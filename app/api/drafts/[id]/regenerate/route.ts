import { z } from "zod";
import { regenerateBlock } from "@/lib/ai/generate";
import { ndjson, route, type Ctx } from "@/lib/http";
import { getDraft } from "@/lib/store";
import { EmailCopy } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Rewrite one block: "subjects" | "header" | "closing" | "section:<key>". Streams NDJSON. */
export const POST = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  await getDraft(id);
  const input = z
    .object({ block: z.string().min(1), instruction: z.string().default(""), current: EmailCopy.optional() })
    .parse(await req.json());
  return ndjson((progress) =>
    regenerateBlock({ draftId: id, ...input, signal: req.signal, onProgress: (p) => progress(p.phase, p.chars) }),
  );
});
