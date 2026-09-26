import { z } from "zod";
import { route, type Ctx } from "@/lib/http";
import { deleteDraft, getActiveProfile, getBrand, getDraft, saveDraft } from "@/lib/store";
import { EmailCopy } from "@/lib/types";

export const dynamic = "force-dynamic";

type P = Ctx<{ id: string }>;

export const GET = route(async (_req: Request, { params }: P) => {
  const { id } = await params;
  const draft = await getDraft(id);
  const brand = await getBrand(draft.brandId);
  return { draft, brand, profile: await getActiveProfile(brand) };
});

/** Autosave of the user's inline edits, subject choice and locks. */
export const PUT = route(async (req: Request, { params }: P) => {
  const { id } = await params;
  const draft = await getDraft(id);
  const patch = z
    .object({ current: EmailCopy.optional(), chosenSubject: z.number().int().min(0).optional(), locked: z.array(z.string()).optional() })
    .parse(await req.json());
  const next = { ...draft, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) };
  await saveDraft(next);
  return next;
});

export const DELETE = route(async (_req: Request, { params }: P) => {
  const { id } = await params;
  await getDraft(id);
  await deleteDraft(id);
  return { ok: true };
});
