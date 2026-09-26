import { z } from "zod";
import { reviewDraft } from "@/lib/ai/generate";
import { ndjson, route, type Ctx } from "@/lib/http";
import { getDraft } from "@/lib/store";
import { EmailCopy } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Self-review pass: check the draft against the review criteria and fix what fails. Streams NDJSON. */
export const POST = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  await getDraft(id);
  const { current } = z.object({ current: EmailCopy.optional() }).parse(await req.json().catch(() => ({})));
  return ndjson((progress) => reviewDraft({ draftId: id, current, signal: req.signal, onProgress: (p) => progress(p.phase, p.chars) }));
});
