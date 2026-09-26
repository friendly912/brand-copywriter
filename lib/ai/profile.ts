import "server-only";
import { describeEdits } from "../copy";
import { addProfileVersion, getActiveProfile, getBrand, listDocs, listDrafts, listSources } from "../store";
import { BrandProfileContent, type BrandDoc, type BrandProfile, type SourceEmail } from "../types";
import { runStructured, type Progress } from "./client";
import { PROFILE_INSTRUCTIONS, profileRequestMessage } from "./prompts";

// Keep the extraction request comfortably sized: plenty for dozens of emails
// plus a long style guide. Documents get their own budget.
const MAX_SOURCE_CHARS = 400_000;
const MAX_DOC_CHARS = 200_000;

/** Fits documents into their budget, style guides first; cuts are marked in the text. */
function fitDocs(docs: BrandDoc[]): { docs: BrandDoc[]; cut: boolean } {
  let left = MAX_DOC_CHARS;
  let cut = false;
  const out: BrandDoc[] = [];
  for (const d of docs) {
    if (left <= 0) {
      cut = true;
      break;
    }
    const content = d.content.length > left ? `${d.content.slice(0, left)}\n[… the rest of this document was left out to fit]` : d.content;
    if (content !== d.content) cut = true;
    left -= content.length;
    out.push({ ...d, content });
  }
  return { docs: out, cut };
}

function pickSources(all: SourceEmail[]) {
  // Favourites first, then newest. Everything that fits goes in.
  const ordered = [...all].sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.createdAt.localeCompare(a.createdAt));
  const picked: SourceEmail[] = [];
  let total = 0;
  for (const s of ordered) {
    if (total + s.body.length > MAX_SOURCE_CHARS && picked.length) continue;
    picked.push(s);
    total += s.body.length;
  }
  return { picked, omitted: all.length - picked.length };
}

/**
 * Builds the first profile, or refreshes the active one using all sources plus
 * what the owner changed in finalised drafts. Saves it as a new active version.
 */
export async function buildProfile(opts: { brandId: string; onProgress?: Progress; signal?: AbortSignal }): Promise<BrandProfile> {
  const brand = await getBrand(opts.brandId);
  const [sources, current, drafts, allDocs] = await Promise.all([
    listSources(brand.id),
    getActiveProfile(brand),
    listDrafts(brand.id),
    listDocs(brand.id),
  ]);
  if (sources.length === 0 && allDocs.length === 0) throw new Error("Add at least one past email or brand document before building a profile.");

  const { picked, omitted } = pickSources(sources);
  const { docs, cut } = fitDocs(allDocs);

  const editNotes = drafts
    .filter((d) => d.status === "final")
    .slice(0, 15)
    .map((d) => describeEdits(d.generated, d.current, d.chosenSubject))
    .filter((n) => n.length)
    .map((n, i) => `### Edited email ${i + 1}\n${n.join("\n")}`);

  const { data } = await runStructured({
    schema: BrandProfileContent,
    effort: "high", // one-off and quality-critical
    system: [{ type: "text", text: PROFILE_INSTRUCTIONS }],
    messages: [{ role: "user", content: profileRequestMessage({ brand, sources: picked, docs, omitted, current, editNotes }) }],
    phaseOf: (partial) => (partial.includes('"structure"') ? "Mapping email structure…" : partial.includes('"mechanics"') ? "Analysing style…" : "Reading the emails…"),
    onProgress: opts.onProgress,
    signal: opts.signal,
  });

  return addProfileVersion(brand, {
    createdBy: "ai",
    parentVersion: current?.version ?? null,
    sourceIds: picked.map((s) => s.id),
    note: [
      `${current ? "Refreshed" : "Built"} from ${picked.length} emails`,
      docs.length ? `${docs.length} document${docs.length === 1 ? "" : "s"}${cut ? " (long documents shortened)" : ""}` : "",
      editNotes.length ? `${editNotes.length} edited drafts` : "",
    ]
      .filter(Boolean)
      .join(", "),
    profile: data,
  });
}
