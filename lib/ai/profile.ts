import "server-only";
import { describeEdits } from "../copy";
import { addProfileVersion, getActiveProfile, getBrand, listDrafts, listSources } from "../store";
import { BrandProfileContent, type BrandProfile, type SourceEmail } from "../types";
import { runStructured, type Progress } from "./client";
import { PROFILE_INSTRUCTIONS, profileRequestMessage } from "./prompts";

// Keep the extraction request comfortably sized: plenty for dozens of emails.
const MAX_SOURCE_CHARS = 400_000;

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
  const [sources, current, drafts] = await Promise.all([listSources(brand.id), getActiveProfile(brand), listDrafts(brand.id)]);
  if (sources.length === 0) throw new Error("Add at least one past email before building a profile.");

  const { picked, omitted } = pickSources(sources);

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
    messages: [{ role: "user", content: profileRequestMessage({ brand, sources: picked, omitted, current, editNotes }) }],
    phaseOf: (partial) => (partial.includes('"structure"') ? "Mapping email structure…" : partial.includes('"mechanics"') ? "Analysing style…" : "Reading the emails…"),
    onProgress: opts.onProgress,
    signal: opts.signal,
  });

  return addProfileVersion(brand, {
    createdBy: "ai",
    parentVersion: current?.version ?? null,
    sourceIds: picked.map((s) => s.id),
    note: current
      ? `Refreshed from ${picked.length} emails${editNotes.length ? ` and ${editNotes.length} edited drafts` : ""}`
      : `Built from ${picked.length} emails`,
    profile: data,
  });
}
