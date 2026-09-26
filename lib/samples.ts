import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { docToText, emlToCopy, htmlToCopy, parsePastedText } from "./ai/ingest";
import { addProfileVersion, listBrands, newId, now, saveBrand, saveDoc, saveSource } from "./store";
import { Brief, BrandProfileContent, DOC_KINDS, EMAIL_TYPES, HardRules, PaletteColor, type Brand } from "./types";

// Sample brands for testing live in ./samples/<id>/ (brand.json manifest,
// emails/, docs/, optional profile.json). Importing them makes no AI calls:
// emails declare their type, and documents are text-based (PDF text layer, .docx, .md).

const SAMPLES_DIR = path.resolve(/*turbopackIgnore: true*/ process.cwd(), "samples");

export const SampleManifest = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(""),
  audience: z.string().default(""),
  platform: z.string().default(""),
  palette: z.array(PaletteColor).default([]),
  rules: HardRules.partial().default({}),
  emails: z.array(z.object({ file: z.string(), type: z.enum(EMAIL_TYPES), favorite: z.boolean().default(false), note: z.string().default("") })),
  docs: z.array(z.object({ file: z.string(), kind: z.enum(DOC_KINDS), title: z.string(), useWhenWriting: z.boolean().default(true) })).default([]),
  briefs: z.array(z.object({ title: z.string(), brief: Brief })).default([]),
});
export type SampleManifest = z.infer<typeof SampleManifest>;

export interface SampleSummary {
  id: string;
  name: string;
  description: string;
  emailCount: number;
  docCount: number;
  hasProfile: boolean;
  briefs: { title: string; brief: z.infer<typeof Brief> }[];
  importedBrandId: string | null;
}

async function readManifest(id: string) {
  const raw = await fs.readFile(path.join(SAMPLES_DIR, id, "brand.json"), "utf8");
  return SampleManifest.parse(JSON.parse(raw));
}

async function readProfile(id: string) {
  try {
    const raw = await fs.readFile(path.join(SAMPLES_DIR, id, "profile.json"), "utf8");
    return BrandProfileContent.parse(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function listSamples(): Promise<SampleSummary[]> {
  let dirs: string[];
  try {
    dirs = (await fs.readdir(SAMPLES_DIR, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return [];
  }
  const brands = await listBrands();
  const out: SampleSummary[] = [];
  for (const dir of dirs.sort()) {
    let m: SampleManifest;
    try {
      m = await readManifest(dir);
    } catch {
      continue; // not a sample brand folder (e.g. samples/extra)
    }
    out.push({
      id: m.id,
      name: m.name,
      description: m.description,
      emailCount: m.emails.length,
      docCount: m.docs.length,
      hasProfile: (await readProfile(dir)) !== null,
      briefs: m.briefs,
      importedBrandId: brands.find((b) => b.sampleId === m.id)?.id ?? null,
    });
  }
  return out;
}

async function extractEmail(file: string, data: Buffer) {
  const ext = path.extname(file).slice(1).toLowerCase();
  if (ext === "html" || ext === "htm") return htmlToCopy(data.toString("utf8"));
  if (ext === "eml") return emlToCopy(data);
  if (ext === "txt" || ext === "md") return parsePastedText(data.toString("utf8"));
  throw new Error(`Sample emails must be .txt, .md, .html or .eml (got ${file})`);
}

/** Imports one sample brand. Skips it if it was imported before. */
export async function importSample(id: string, withProfile: boolean): Promise<{ id: string; brandId: string; skipped: boolean; emails: number; docs: number; profile: boolean }> {
  const m = await readManifest(id);
  const existing = (await listBrands()).find((b) => b.sampleId === m.id);
  if (existing) return { id, brandId: existing.id, skipped: true, emails: 0, docs: 0, profile: false };

  const base = path.join(SAMPLES_DIR, id);
  const brand: Brand = {
    id: newId(m.id.slice(0, 24)),
    name: m.name,
    description: m.description,
    audience: m.audience,
    platform: m.platform,
    palette: m.palette,
    rules: HardRules.parse(m.rules),
    activeProfileVersion: null,
    sampleId: m.id,
    createdAt: now(),
    updatedAt: now(),
  };
  await saveBrand(brand);

  // Oldest first, so the library's newest-first order matches the manifest order.
  for (const [i, e] of m.emails.entries()) {
    const copy = await extractEmail(e.file, await fs.readFile(path.join(base, e.file)));
    await saveSource({
      id: newId("src"),
      brandId: brand.id,
      emailType: e.type,
      subject: copy.subject,
      preview: copy.preview,
      body: copy.body,
      origin: "upload",
      fileName: path.basename(e.file),
      favorite: e.favorite,
      note: e.note,
      createdAt: new Date(Date.now() - (m.emails.length - i) * 1000).toISOString(),
    });
  }

  for (const d of m.docs) {
    const content = await docToText(d.file, await fs.readFile(path.join(base, d.file)));
    await saveDoc({ id: newId("doc"), brandId: brand.id, kind: d.kind, title: d.title, content, fileName: path.basename(d.file), useWhenWriting: d.useWhenWriting, createdAt: now() });
  }

  let profile = false;
  const content = withProfile ? await readProfile(id) : null;
  if (content) {
    await addProfileVersion(brand, {
      createdBy: "user",
      parentVersion: null,
      sourceIds: [],
      note: "Sample profile (hand-written). Use Refresh with AI to compare with an AI-built one.",
      profile: content,
    });
    profile = true;
  }
  return { id, brandId: brand.id, skipped: false, emails: m.emails.length, docs: m.docs.length, profile };
}
