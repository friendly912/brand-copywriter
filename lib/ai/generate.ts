import "server-only";
import type { BetaTextBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { z } from "zod";
import { flattenCopy } from "../copy";
import { lintCopy } from "../lint";
import { getActiveProfile, getBrand, getDraft, getSettings, listDocs, listSources, newId, now, saveDraft } from "../store";
import {
  ClosingBlockRegen,
  CopySection,
  EmailCopy,
  HeaderBlockRegen,
  ReviewOutput,
  SubjectBlockRegen,
  type Brand,
  type BrandDoc,
  type BrandProfile,
  type Brief,
  type Draft,
  type EmailType,
  type SourceEmail,
} from "../types";
import { runStructured, type Progress } from "./client";
import { BLOCK_DESCRIPTIONS, COPYWRITER_INSTRUCTIONS, brandBlock, briefMessage, docsBlock, examplesBlock, regenerateMessage, reviewMessage } from "./prompts";

/**
 * Picks up to k examples: same-type favourites, then same-type emails with a
 * performance result, then same-type finals, then other same-type emails, then
 * favourites / results / finals of other types. Deterministic for the same data,
 * so the cached prompt prefix is reused.
 */
export function selectExamples(sources: SourceEmail[], type: EmailType, k: number): SourceEmail[] {
  const tier = (s: SourceEmail) => {
    const same = s.emailType === type;
    const proven = !!s.note.trim();
    if (same && s.favorite) return 0;
    if (same && proven) return 1;
    if (same && s.origin === "final") return 2;
    if (same) return 3;
    if (s.favorite) return 4;
    if (proven) return 5;
    if (s.origin === "final") return 6;
    return 7;
  };
  return [...sources]
    .sort((a, b) => tier(a) - tier(b) || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
    .slice(0, k);
}

function systemBlocks(brand: Brand, profile: BrandProfile | null, docs: BrandDoc[], examples: SourceEmail[]): BetaTextBlockParam[] {
  return [
    { type: "text", text: COPYWRITER_INSTRUCTIONS },
    { type: "text", text: brandBlock(brand, profile) },
    { type: "text", text: docsBlock(docs).text },
    { type: "text", text: examplesBlock(examples), cache_control: { type: "ephemeral" } },
  ];
}

function phaseOf(partial: string): string {
  if (partial.includes('"design_notes"')) return "Adding design notes…";
  if (partial.includes('"primary_cta"')) return "Writing the CTA…";
  if (partial.includes('"sections"')) return "Writing the body…";
  if (partial.includes('"headline"')) return "Writing the headline…";
  return "Writing subject lines…";
}

async function loadContext(brandId: string) {
  const brand = await getBrand(brandId);
  const [profile, sources, docs, settings] = await Promise.all([getActiveProfile(brand), listSources(brandId), listDocs(brandId), getSettings()]);
  return { brand, profile, sources, docs, settings };
}

/** Writes a brand-new email. If `previous` is given, its locked blocks are kept. */
export async function generateDraft(opts: {
  brandId: string;
  brief: Brief;
  previous?: Draft;
  onProgress?: Progress;
  signal?: AbortSignal;
}): Promise<Draft> {
  const { brand, profile, sources, docs, settings } = await loadContext(opts.brandId);
  const examples = selectExamples(sources, opts.brief.emailType, settings.examplesPerPrompt);

  const { data, usage } = await runStructured({
    schema: EmailCopy,
    system: systemBlocks(brand, profile, docs, examples),
    messages: [{ role: "user", content: briefMessage(opts.brief) }],
    phaseOf,
    onProgress: opts.onProgress,
    signal: opts.signal,
  });

  const prev = opts.previous;
  const current = prev ? keepLocked(data, prev.current, prev.locked) : data;
  const draft: Draft = {
    id: prev?.id ?? newId("draft"),
    brandId: brand.id,
    brief: opts.brief,
    profileVersion: profile?.version ?? null,
    exampleIds: examples.map((e) => e.id),
    model: usage.model,
    // `generated` is always the latest AI-written text, so finals can be diffed against it.
    generated: prev ? keepLocked(data, prev.generated, prev.locked) : data,
    current,
    chosenSubject: prev?.locked.includes("subjects") ? prev.chosenSubject : 0,
    locked: prev?.locked ?? [],
    revisions: [...(prev?.revisions ?? []), ...(prev ? [{ block: "all", instruction: "", createdAt: now() }] : [])],
    status: "draft",
    finalSourceId: null,
    review: null, // a fresh draft hasn't been reviewed
    usage: [...(prev?.usage ?? []), usage],
    createdAt: prev?.createdAt ?? now(),
    updatedAt: now(),
  };
  await saveDraft(draft);

  if (settings.autoReview) {
    return reviewDraft({ draftId: draft.id, onProgress: opts.onProgress, signal: opts.signal });
  }
  return draft;
}

function keepLocked(fresh: EmailCopy, old: EmailCopy, locked: string[]): EmailCopy {
  const out: EmailCopy = structuredClone(fresh);
  if (locked.includes("subjects")) out.subject_lines = old.subject_lines;
  if (locked.includes("header")) {
    out.headline = old.headline;
    out.subheadline = old.subheadline;
  }
  if (locked.includes("closing")) {
    out.primary_cta = old.primary_cta;
    out.ps = old.ps;
    out.footer_line = old.footer_line;
  }
  for (const key of locked.filter((l) => l.startsWith("section:")).map((l) => l.slice(8))) {
    const oldSec = old.sections.find((s) => s.key === key);
    if (!oldSec) continue;
    const i = out.sections.findIndex((s) => s.key === key);
    if (i >= 0) out.sections[i] = oldSec;
    else out.sections.splice(Math.min(old.sections.indexOf(oldSec), out.sections.length), 0, oldSec);
  }
  return out;
}

/** Rewrites one block of a draft, in context, with an optional instruction. */
export async function regenerateBlock(opts: {
  draftId: string;
  block: string;
  instruction: string;
  current?: EmailCopy;
  onProgress?: Progress;
  signal?: AbortSignal;
}): Promise<Draft> {
  const draft = await getDraft(opts.draftId);
  const current = opts.current ?? draft.current;
  const { brand, profile, sources, docs } = await loadContext(draft.brandId);

  // Reuse the draft's own examples so the cached prompt prefix from the first generation is hit.
  const byId = new Map(sources.map((s) => [s.id, s]));
  const examples = draft.exampleIds.map((id) => byId.get(id)).filter((s): s is SourceEmail => !!s);

  let schema: z.ZodType;
  let label: string;
  const sectionKey = opts.block.startsWith("section:") ? opts.block.slice(8) : null;
  if (sectionKey) {
    const sec = current.sections.find((s) => s.key === sectionKey);
    if (!sec) throw new Error(`Section "${sectionKey}" not found`);
    schema = CopySection;
    label = `the section with key "${sectionKey}" (keep that key and the same kind of section unless the user asks otherwise)`;
  } else if (opts.block === "subjects") {
    schema = SubjectBlockRegen;
    label = BLOCK_DESCRIPTIONS.subjects;
  } else if (opts.block === "header") {
    schema = HeaderBlockRegen;
    label = BLOCK_DESCRIPTIONS.header;
  } else if (opts.block === "closing") {
    schema = ClosingBlockRegen;
    label = BLOCK_DESCRIPTIONS.closing;
  } else {
    throw new Error(`Unknown block "${opts.block}"`);
  }

  const { data, usage } = await runStructured({
    schema,
    system: systemBlocks(brand, profile, docs, examples),
    messages: [
      {
        role: "user",
        content: regenerateMessage({
          brief: draft.brief,
          currentJson: JSON.stringify(current, null, 2),
          blockLabel: label,
          instruction: opts.instruction,
          locked: draft.locked.filter((l) => l !== opts.block),
        }),
      },
    ],
    onProgress: opts.onProgress,
    signal: opts.signal,
  });

  const next = applyBlock(current, opts.block, data);
  const chosenSubject = opts.block === "subjects" ? 0 : draft.chosenSubject;

  const updated: Draft = {
    ...draft,
    current: next,
    generated: applyBlock(draft.generated, opts.block, data),
    chosenSubject,
    revisions: [...draft.revisions, { block: opts.block, instruction: opts.instruction, createdAt: now() }],
    usage: [...draft.usage, usage],
  };
  await saveDraft(updated);
  return updated;
}

function applyBlock(copy: EmailCopy, block: string, data: unknown): EmailCopy {
  const next: EmailCopy = structuredClone(copy);
  if (block.startsWith("section:")) {
    const key = block.slice(8);
    const sec = data as z.infer<typeof CopySection>;
    next.sections = next.sections.map((s) => (s.key === key ? { ...sec, key } : s));
  } else if (block === "subjects") {
    next.subject_lines = (data as z.infer<typeof SubjectBlockRegen>).subject_lines;
  } else if (block === "header") {
    Object.assign(next, data as z.infer<typeof HeaderBlockRegen>);
  } else {
    Object.assign(next, data as z.infer<typeof ClosingBlockRegen>);
  }
  return next;
}

/** Blocks of an email as comparable units: subjects, header, closing and each section. */
function blocksOf(c: EmailCopy): Map<string, string> {
  const m = new Map<string, string>();
  m.set("subjects", JSON.stringify(c.subject_lines));
  m.set("header", JSON.stringify([c.headline, c.subheadline]));
  m.set("closing", JSON.stringify([c.primary_cta, c.ps, c.footer_line]));
  for (const s of c.sections) m.set(`section:${s.key}`, JSON.stringify(s));
  return m;
}

/**
 * Keeps `generated` meaning "the latest AI-written text": blocks the review left
 * untouched keep their previous AI text, so the user's own edits still show up
 * as edits when the draft is finalised.
 */
function mergeGenerated(oldGenerated: EmailCopy, current: EmailCopy, revised: EmailCopy): EmailCopy {
  const before = blocksOf(current);
  const after = blocksOf(revised);
  let out: EmailCopy = structuredClone(revised);
  const unchanged = [...after.keys()].filter((k) => before.get(k) === after.get(k));
  out = keepLocked(out, oldGenerated, unchanged);
  return out;
}

function reviewPhase(partial: string): string {
  return partial.includes('"revised"') ? "Revising what didn't pass…" : "Reviewing the draft…";
}

/**
 * Self-review pass: checks the draft against the review criteria (plus the
 * automatic rule checks) and fixes only what fails. Locked blocks are never changed.
 */
export async function reviewDraft(opts: { draftId: string; current?: EmailCopy; onProgress?: Progress; signal?: AbortSignal }): Promise<Draft> {
  const draft = await getDraft(opts.draftId);
  const current = opts.current ?? draft.current;
  const { brand, profile, sources, docs } = await loadContext(draft.brandId);
  const byId = new Map(sources.map((s) => [s.id, s]));
  const examples = draft.exampleIds.map((id) => byId.get(id)).filter((s): s is SourceEmail => !!s);
  const lintNotes = lintCopy(current, brand, profile).map((i) => `${i.where}: ${i.message}`);

  const { data, usage } = await runStructured({
    schema: ReviewOutput,
    system: systemBlocks(brand, profile, docs, examples),
    messages: [
      {
        role: "user",
        content: reviewMessage({ brief: draft.brief, currentJson: JSON.stringify(current, null, 2), lintNotes, locked: draft.locked }),
      },
    ],
    phaseOf: reviewPhase,
    onProgress: opts.onProgress,
    signal: opts.signal,
  });

  // Enforce locks and the subject count even if the model drifted.
  let revised = keepLocked(data.revised, current, draft.locked);
  if (revised.subject_lines.length === 0) revised = { ...revised, subject_lines: current.subject_lines };
  const changed = JSON.stringify(flattenCopy(revised)) !== JSON.stringify(flattenCopy(current));

  const updated: Draft = {
    ...draft,
    current: revised,
    generated: changed ? mergeGenerated(draft.generated, current, revised) : draft.generated,
    chosenSubject: Math.min(draft.chosenSubject, revised.subject_lines.length - 1),
    review: { checks: data.checks, changed, summary: data.summary, createdAt: now() },
    revisions: [...draft.revisions, { block: "review", instruction: "", createdAt: now() }],
    usage: [...draft.usage, usage],
  };
  await saveDraft(updated);
  return updated;
}
