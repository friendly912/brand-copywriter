import { z } from "zod";
import { route } from "@/lib/http";
import { listBrands, listDrafts, listSources, newId, now, saveBrand } from "@/lib/store";
import { HardRules, type Brand } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const [brands, drafts] = await Promise.all([listBrands(), listDrafts()]);
  return Promise.all(
    brands.map(async (b) => ({
      ...b,
      sourceCount: (await listSources(b.id)).length,
      draftCount: drafts.filter((d) => d.brandId === b.id).length,
      lastUsed: drafts.find((d) => d.brandId === b.id)?.updatedAt ?? null,
    })),
  );
});

export const POST = route(async (req: Request) => {
  const input = z.object({ name: z.string().trim().min(1), description: z.string().default("") }).parse(await req.json());
  const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "brand";
  const brand: Brand = {
    id: newId(slug),
    name: input.name,
    description: input.description,
    palette: [],
    rules: HardRules.parse({}),
    activeProfileVersion: null,
    createdAt: now(),
    updatedAt: now(),
  };
  await saveBrand(brand);
  return brand;
});
