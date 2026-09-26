import { z } from "zod";
import { route, type Ctx } from "@/lib/http";
import { deleteDoc, getDoc, saveDoc } from "@/lib/store";
import { DOC_KINDS } from "@/lib/types";

export const dynamic = "force-dynamic";

type P = Ctx<{ id: string; docId: string }>;

const Update = z.object({
  title: z.string().trim().min(1).optional(),
  kind: z.enum(DOC_KINDS).optional(),
  content: z.string().min(1).optional(),
  useWhenWriting: z.boolean().optional(),
});

export const PUT = route(async (req: Request, { params }: P) => {
  const { id, docId } = await params;
  const doc = await getDoc(id, docId);
  const patch = Update.parse(await req.json());
  const next = { ...doc, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) };
  await saveDoc(next);
  return next;
});

export const DELETE = route(async (_req: Request, { params }: P) => {
  const { id, docId } = await params;
  await getDoc(id, docId);
  await deleteDoc(id, docId);
  return { ok: true };
});
