import { z } from "zod";
import { copyToExampleBody } from "@/lib/copy";
import { route, type Ctx } from "@/lib/http";
import { deleteSource, getActiveProfile, getBrand, getDraft, getSettings, listDrafts, newId, now, saveDraft, saveSource } from "@/lib/store";
import { EmailCopy } from "@/lib/types";

export const dynamic = "force-dynamic";

type P = Ctx<{ id: string }>;

/**
 * Mark a draft as final. The final copy becomes a new example email for the
 * brand, so future emails learn from it. Calling again updates that example.
 */
export const POST = route(async (req: Request, { params }: P) => {
  const { id } = await params;
  const draft = await getDraft(id);
  const input = z.object({ current: EmailCopy.optional(), chosenSubject: z.number().int().min(0).optional() }).parse(await req.json());
  const current = input.current ?? draft.current;
  const chosenSubject = input.chosenSubject ?? draft.chosenSubject;
  const subj = current.subject_lines[chosenSubject] ?? current.subject_lines[0];

  const sourceId = draft.finalSourceId ?? newId("src");
  await saveSource({
    id: sourceId,
    brandId: draft.brandId,
    emailType: draft.brief.emailType,
    subject: subj?.text ?? "",
    preview: subj?.preview ?? "",
    body: copyToExampleBody(current),
    origin: "final",
    fileName: null,
    favorite: false,
    note: "",
    createdAt: now(),
  });

  const next = { ...draft, current, chosenSubject, status: "final" as const, finalSourceId: sourceId };
  await saveDraft(next);

  const brand = await getBrand(draft.brandId);
  const [profile, settings, drafts] = await Promise.all([getActiveProfile(brand), getSettings(), listDrafts(brand.id)]);
  const finalsSinceProfile = drafts.filter((d) => d.status === "final" && (!profile || d.updatedAt > profile.createdAt)).length;
  return { draft: next, suggestRefresh: finalsSinceProfile >= settings.refreshAfterFinals };
});

/** Undo "final": back to draft, and remove it from the example library. */
export const DELETE = route(async (_req: Request, { params }: P) => {
  const { id } = await params;
  const draft = await getDraft(id);
  if (draft.finalSourceId) await deleteSource(draft.brandId, draft.finalSourceId);
  const next = { ...draft, status: "draft" as const, finalSourceId: null };
  await saveDraft(next);
  return { draft: next };
});
