import { z } from "zod";
import { route, type Ctx } from "@/lib/http";
import { deleteSource, getSource, saveSource } from "@/lib/store";
import { EMAIL_TYPES } from "@/lib/types";

export const dynamic = "force-dynamic";

type P = Ctx<{ id: string; sid: string }>;

const Update = z.object({
  emailType: z.enum(EMAIL_TYPES).optional(),
  favorite: z.boolean().optional(),
  subject: z.string().optional(),
  preview: z.string().optional(),
  body: z.string().min(1).optional(),
  note: z.string().optional(),
});

export const PUT = route(async (req: Request, { params }: P) => {
  const { id, sid } = await params;
  const s = await getSource(id, sid);
  const patch = Update.parse(await req.json());
  const next = { ...s, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) };
  await saveSource(next);
  return next;
});

export const DELETE = route(async (_req: Request, { params }: P) => {
  const { id, sid } = await params;
  await getSource(id, sid);
  await deleteSource(id, sid);
  return { ok: true };
});
