import { z } from "zod";
import { generateDraft } from "@/lib/ai/generate";
import { ndjson, route } from "@/lib/http";
import { getBrand, getDraft } from "@/lib/store";
import { Brief } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Write a new email for a brand. Pass draftId to rewrite an existing draft
 * from scratch while keeping its locked blocks. Streams NDJSON progress.
 */
export const POST = route(async (req: Request) => {
  const input = z.object({ brandId: z.string(), brief: Brief, draftId: z.string().optional() }).parse(await req.json());
  await getBrand(input.brandId);
  const previous = input.draftId ? await getDraft(input.draftId) : undefined;
  return ndjson((progress) =>
    generateDraft({
      brandId: input.brandId,
      brief: input.brief,
      previous,
      signal: req.signal,
      onProgress: (p) => progress(p.phase, p.chars),
    }),
  );
});
