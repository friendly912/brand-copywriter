import { z } from "zod";
import { buildProfile } from "@/lib/ai/profile";
import { ndjson, route, type Ctx } from "@/lib/http";
import { addProfileVersion, getActiveProfile, getBrand, getProfile, saveBrand } from "@/lib/store";
import { BrandProfileContent } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

type P = Ctx<{ id: string }>;

/** Build (or refresh) the profile with Claude. Streams progress as NDJSON. */
export const POST = route(async (req: Request, { params }: P) => {
  const { id } = await params;
  await getBrand(id);
  return ndjson((progress) => buildProfile({ brandId: id, signal: req.signal, onProgress: (p) => progress(p.phase, p.chars) }));
});

/** Save the user's edits as a new version. */
export const PUT = route(async (req: Request, { params }: P) => {
  const { id } = await params;
  const brand = await getBrand(id);
  const { profile, note } = z.object({ profile: BrandProfileContent, note: z.string().default("Edited by hand") }).parse(await req.json());
  const current = await getActiveProfile(brand);
  return addProfileVersion(brand, {
    createdBy: "user",
    parentVersion: current?.version ?? null,
    sourceIds: current?.sourceIds ?? [],
    note,
    profile,
  });
});

/** Switch the active version (roll back / forward). */
export const PATCH = route(async (req: Request, { params }: P) => {
  const { id } = await params;
  const brand = await getBrand(id);
  const { version } = z.object({ version: z.number().int() }).parse(await req.json());
  const prof = await getProfile(id, version);
  await saveBrand({ ...brand, activeProfileVersion: version });
  return prof;
});

/** Fetch one specific version (for viewing history). */
export const GET = route(async (req: Request, { params }: P) => {
  const { id } = await params;
  const v = Number(new URL(req.url).searchParams.get("version"));
  return getProfile(id, v);
});
