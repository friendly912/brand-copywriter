import { z } from "zod";
import { runText } from "@/lib/ai/client";
import { route } from "@/lib/http";

export const dynamic = "force-dynamic";

// Cheapest possible round trip to confirm a provider's key and model work.
export const POST = route(async (req: Request) => {
  const { provider } = z.object({ provider: z.enum(["claude", "openrouter"]).default("claude") }).parse(await req.json().catch(() => ({})));
  const { text, usage } = await runText({
    system: "Reply with exactly: OK",
    content: [{ type: "text", text: "Connection test." }],
    effort: "low",
    maxTokens: 2000,
    provider,
  });
  return { ok: true, reply: text, model: usage.model };
});
