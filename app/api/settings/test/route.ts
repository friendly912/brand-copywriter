import { runText } from "@/lib/ai/client";
import { route } from "@/lib/http";

export const dynamic = "force-dynamic";

// Cheapest possible round trip to confirm the key and model work.
export const POST = route(async () => {
  const { text, usage } = await runText({
    system: "Reply with exactly: OK",
    content: [{ type: "text", text: "Connection test." }],
    effort: "low",
    maxTokens: 2000,
  });
  return { ok: true, reply: text, model: usage.model };
});
