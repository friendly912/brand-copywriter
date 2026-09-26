import { z } from "zod";
import { route, type Ctx } from "@/lib/http";
import { docsBlock } from "@/lib/ai/prompts";
import { deleteBrand, getActiveProfile, getBrand, listDocs, listDrafts, listProfiles, listSources, saveBrand } from "@/lib/store";
import { HardRules, PaletteColor } from "@/lib/types";

export const dynamic = "force-dynamic";

type P = Ctx<{ id: string }>;

export const GET = route(async (_req: Request, { params }: P) => {
  const { id } = await params;
  const brand = await getBrand(id);
  const [sources, profiles, profile, drafts, docs] = await Promise.all([
    listSources(id),
    listProfiles(id),
    getActiveProfile(brand),
    listDrafts(id),
    listDocs(id),
  ]);
  // Finals written since the active profile was built: used to suggest a refresh.
  const finalsSinceProfile = drafts.filter((d) => d.status === "final" && (!profile || d.updatedAt > profile.createdAt)).length;
  return {
    brand,
    sources,
    docs,
    writingDocs: {
      chars: docs.filter((d) => d.useWhenWriting).reduce((n, d) => n + d.content.length, 0),
      truncated: docsBlock(docs).truncated,
    },
    profile,
    versions: profiles.map(({ profile: _p, ...meta }) => meta),
    finalsSinceProfile,
  };
});

const Update = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  audience: z.string().optional(),
  platform: z.string().optional(),
  palette: z.array(PaletteColor).optional(),
  rules: HardRules.optional(),
});

export const PUT = route(async (req: Request, { params }: P) => {
  const { id } = await params;
  const brand = await getBrand(id);
  const patch = Update.parse(await req.json());
  const next = { ...brand, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) };
  await saveBrand(next);
  return next;
});

export const DELETE = route(async (_req: Request, { params }: P) => {
  const { id } = await params;
  await getBrand(id);
  await deleteBrand(id);
  return { ok: true };
});
