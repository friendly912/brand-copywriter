import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { z } from "zod";
import { Brand, BrandDoc, BrandProfile, Draft, Settings, SourceEmail } from "./types";

// Everything lives as plain JSON under ./data (override with BC_DATA_DIR), so it
// is easy to back up, inspect, or move to another Windows machine.
//
//   data/settings.json
//   data/brands/<brandId>.json
//   data/sources/<brandId>/<sourceId>.json
//   data/docs/<brandId>/<docId>.json
//   data/profiles/<brandId>/v0001.json
//   data/drafts/<draftId>.json
//   data/uploads/<brandId>/<file>

export const DATA_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.BC_DATA_DIR || path.join(process.cwd(), "data"));

const p = (...parts: string[]) => path.join(DATA_DIR, ...parts);

export function newId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
}

export function now() {
  return new Date().toISOString();
}

function assertSafeId(id: string) {
  if (!/^[a-z0-9_-]+$/i.test(id)) throw new NotFoundError(`Invalid id: ${id}`);
}

export class NotFoundError extends Error {}

async function readJson<T>(file: string, schema: z.ZodType<T>): Promise<T | null> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return schema.parse(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

// Write to a temp file then rename, so a crash never leaves half a JSON file.
// Windows can briefly lock files (antivirus, indexer), so retry the rename.
async function writeJson(file: string, data: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(tmp, file);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (attempt < 5 && (code === "EPERM" || code === "EBUSY" || code === "EACCES")) {
        await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
        continue;
      }
      await fs.rm(tmp, { force: true });
      throw err;
    }
  }
}

async function listJson<T>(dir: string, schema: z.ZodType<T>): Promise<T[]> {
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const items = await Promise.all(
    names.filter((n) => n.endsWith(".json")).map((n) => readJson(path.join(dir, n), schema)),
  );
  return items.filter((x): x is Awaited<T> => x !== null) as T[];
}

// ---------- Settings ----------

export async function getSettings(): Promise<Settings> {
  return (await readJson(p("settings.json"), Settings)) ?? Settings.parse({});
}

export async function saveSettings(s: Settings) {
  await writeJson(p("settings.json"), Settings.parse(s));
}

// ---------- Brands ----------

export async function listBrands() {
  const brands = await listJson(p("brands"), Brand);
  return brands.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getBrand(id: string) {
  assertSafeId(id);
  const brand = await readJson(p("brands", `${id}.json`), Brand);
  if (!brand) throw new NotFoundError("Brand not found");
  return brand;
}

export async function saveBrand(brand: Brand) {
  assertSafeId(brand.id);
  await writeJson(p("brands", `${brand.id}.json`), Brand.parse({ ...brand, updatedAt: now() }));
}

export async function deleteBrand(id: string) {
  assertSafeId(id);
  await fs.rm(p("brands", `${id}.json`), { force: true });
  for (const dir of ["sources", "docs", "profiles", "uploads"]) {
    await fs.rm(p(dir, id), { recursive: true, force: true });
  }
  for (const d of await listDrafts(id)) await fs.rm(p("drafts", `${d.id}.json`), { force: true });
}

// ---------- Source emails ----------

export async function listSources(brandId: string) {
  assertSafeId(brandId);
  const items = await listJson(p("sources", brandId), SourceEmail);
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getSource(brandId: string, id: string) {
  assertSafeId(brandId);
  assertSafeId(id);
  const s = await readJson(p("sources", brandId, `${id}.json`), SourceEmail);
  if (!s) throw new NotFoundError("Source email not found");
  return s;
}

export async function saveSource(s: SourceEmail) {
  assertSafeId(s.brandId);
  assertSafeId(s.id);
  await writeJson(p("sources", s.brandId, `${s.id}.json`), SourceEmail.parse(s));
}

export async function deleteSource(brandId: string, id: string) {
  assertSafeId(brandId);
  assertSafeId(id);
  await fs.rm(p("sources", brandId, `${id}.json`), { force: true });
}

export async function saveUpload(brandId: string, fileName: string, data: Buffer) {
  assertSafeId(brandId);
  const safe = fileName.replace(/[^a-z0-9._-]+/gi, "_").slice(-80);
  const file = p("uploads", brandId, `${Date.now().toString(36)}_${safe}`);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, data);
  return file;
}

// ---------- Brand documents ----------

export async function listDocs(brandId: string) {
  assertSafeId(brandId);
  const items = await listJson(p("docs", brandId), BrandDoc);
  // Style guides first, then product info, then other; oldest first within a kind.
  const order = { style_guide: 0, product_info: 1, other: 2 };
  return items.sort((a, b) => order[a.kind] - order[b.kind] || a.createdAt.localeCompare(b.createdAt));
}

export async function getDoc(brandId: string, id: string) {
  assertSafeId(brandId);
  assertSafeId(id);
  const d = await readJson(p("docs", brandId, `${id}.json`), BrandDoc);
  if (!d) throw new NotFoundError("Document not found");
  return d;
}

export async function saveDoc(d: BrandDoc) {
  assertSafeId(d.brandId);
  assertSafeId(d.id);
  await writeJson(p("docs", d.brandId, `${d.id}.json`), BrandDoc.parse(d));
}

export async function deleteDoc(brandId: string, id: string) {
  assertSafeId(brandId);
  assertSafeId(id);
  await fs.rm(p("docs", brandId, `${id}.json`), { force: true });
}

// ---------- Profiles (versioned, never overwritten) ----------

const versionFile = (brandId: string, v: number) => p("profiles", brandId, `v${String(v).padStart(4, "0")}.json`);

export async function listProfiles(brandId: string) {
  assertSafeId(brandId);
  const items = await listJson(p("profiles", brandId), BrandProfile);
  return items.sort((a, b) => b.version - a.version);
}

export async function getProfile(brandId: string, version: number) {
  assertSafeId(brandId);
  const prof = await readJson(versionFile(brandId, version), BrandProfile);
  if (!prof) throw new NotFoundError("Profile version not found");
  return prof;
}

export async function getActiveProfile(brand: Brand) {
  if (brand.activeProfileVersion == null) return null;
  return getProfile(brand.id, brand.activeProfileVersion);
}

/** Saves a new profile version and makes it the brand's active one. */
export async function addProfileVersion(
  brand: Brand,
  data: Omit<BrandProfile, "version" | "createdAt" | "brandId">,
): Promise<BrandProfile> {
  const existing = await listProfiles(brand.id);
  const version = (existing[0]?.version ?? 0) + 1;
  const prof = BrandProfile.parse({ ...data, brandId: brand.id, version, createdAt: now() });
  await writeJson(versionFile(brand.id, version), prof);
  await saveBrand({ ...brand, activeProfileVersion: version });
  return prof;
}

// ---------- Drafts ----------

export async function listDrafts(brandId?: string) {
  const all = await listJson(p("drafts"), Draft);
  return all
    .filter((d) => !brandId || d.brandId === brandId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getDraft(id: string) {
  assertSafeId(id);
  const d = await readJson(p("drafts", `${id}.json`), Draft);
  if (!d) throw new NotFoundError("Draft not found");
  return d;
}

export async function saveDraft(d: Draft) {
  assertSafeId(d.id);
  await writeJson(p("drafts", `${d.id}.json`), Draft.parse({ ...d, updatedAt: now() }));
}

export async function deleteDraft(id: string) {
  assertSafeId(id);
  await fs.rm(p("drafts", `${id}.json`), { force: true });
}
