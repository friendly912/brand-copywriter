import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaTextBlockParam, BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { z } from "zod";
import { getSettings } from "../store";
import type { Settings, Usage } from "../types";

export class ConfigError extends Error {}
export class AiError extends Error {}

// USD per million tokens. Cache writes bill at 1.25x input, cache reads at 0.1x.
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

// Server-side refusal fallback ("default" routing) is documented for Claude Opus 5.
const FALLBACK_MODELS = new Set(["claude-opus-5"]);

export async function getAi(): Promise<{ client: Anthropic; settings: Settings }> {
  const settings = await getSettings();
  const apiKey = settings.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new ConfigError("No Claude API key yet. Add one on the Settings page.");
  return { client: new Anthropic({ apiKey, maxRetries: 3 }), settings };
}

function toUsage(model: string, u: Anthropic.Beta.Messages.BetaUsage): Usage {
  const price = PRICES[model] ?? PRICES["claude-opus-5"];
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const costUsd =
    (u.input_tokens * price.input +
      cacheWrite * price.input * 1.25 +
      cacheRead * price.input * 0.1 +
      u.output_tokens * price.output) /
    1_000_000;
  return {
    model,
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
    costUsd: Math.round(costUsd * 10000) / 10000,
  };
}

export type Progress = (p: { phase: string; chars: number }) => void;

interface StructuredCall<S extends z.ZodType> {
  schema: S;
  system: BetaTextBlockParam[];
  messages: BetaMessageParam[];
  effort?: Settings["effort"];
  model?: string;
  maxTokens?: number;
  /** Maps the partial JSON text to a human-readable phase ("Writing subject lines…"). */
  phaseOf?: (partialJson: string) => string;
  onProgress?: Progress;
  signal?: AbortSignal;
}

const isParseFailure = (err: unknown) => err instanceof Error && err.message.includes("Failed to parse structured output");

/** One streaming request that must come back as JSON matching `schema`. Retries once if the JSON doesn't validate. */
export async function runStructured<S extends z.ZodType>(call: StructuredCall<S>): Promise<{ data: z.infer<S>; usage: Usage }> {
  try {
    return await runStructuredOnce(call);
  } catch (err) {
    if (!isParseFailure(err) || call.signal?.aborted) throw err;
    call.onProgress?.({ phase: "Retrying…", chars: 0 });
    try {
      return await runStructuredOnce(call);
    } catch (again) {
      if (isParseFailure(again)) throw new AiError("Claude's answer didn't match the expected format twice. Please try again.");
      throw again;
    }
  }
}

async function runStructuredOnce<S extends z.ZodType>(call: StructuredCall<S>): Promise<{ data: z.infer<S>; usage: Usage }> {
  const { client, settings } = await getAi();
  const model = call.model ?? settings.model;
  const useFallback = FALLBACK_MODELS.has(model);

  const stream = client.beta.messages.stream(
    {
      model,
      max_tokens: call.maxTokens ?? 32000,
      thinking: { type: "adaptive" },
      output_config: { effort: call.effort ?? settings.effort, format: betaZodOutputFormat(call.schema) },
      system: call.system,
      messages: call.messages,
      ...(useFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    },
    { signal: call.signal },
  );

  let lastReport = 0;
  call.onProgress?.({ phase: "Thinking…", chars: 0 });
  stream.on("text", (_delta, snapshot) => {
    // Throttle: the UI only needs a heartbeat, not every token.
    if (snapshot.length - lastReport < 200) return;
    lastReport = snapshot.length;
    call.onProgress?.({ phase: call.phaseOf?.(snapshot) ?? "Writing…", chars: snapshot.length });
  });

  let message;
  try {
    message = await stream.finalMessage();
  } catch (err) {
    if (isParseFailure(err)) throw err; // handled by the retry in runStructured
    throw toAiError(err);
  }

  if (message.stop_reason === "refusal") {
    throw new AiError("Claude declined this request. Try rephrasing the brief.");
  }
  if (message.stop_reason === "max_tokens") {
    throw new AiError("The response was cut off (too long). Try a shorter brief or fewer sections.");
  }
  if (message.parsed_output == null) {
    throw new AiError("Claude's answer didn't match the expected format. Please try again.");
  }
  return { data: message.parsed_output as z.infer<S>, usage: toUsage(model, message.usage) };
}

/** Plain vision/text call used for transcribing screenshots and small classification jobs. */
export async function runText(opts: {
  system: string;
  content: Anthropic.Beta.Messages.BetaContentBlockParam[];
  effort?: Settings["effort"];
  maxTokens?: number;
}): Promise<{ text: string; usage: Usage }> {
  const { client, settings } = await getAi();
  const model = settings.model;
  let message;
  try {
    message = await client.beta.messages
      .stream({
        model,
        max_tokens: opts.maxTokens ?? 16000,
        thinking: { type: "adaptive" },
        output_config: { effort: opts.effort ?? "low" },
        system: opts.system,
        messages: [{ role: "user", content: opts.content }],
        ...(FALLBACK_MODELS.has(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      })
      .finalMessage();
  } catch (err) {
    throw toAiError(err);
  }
  if (message.stop_reason === "refusal") throw new AiError("Claude declined to process this file.");
  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("")
    .trim();
  return { text, usage: toUsage(model, message.usage) };
}

function toAiError(err: unknown): Error {
  if (err instanceof Anthropic.AuthenticationError) return new ConfigError("The Claude API key was rejected. Check it on the Settings page.");
  if (err instanceof Anthropic.PermissionDeniedError) return new ConfigError("This API key isn't allowed to use the selected model.");
  if (err instanceof Anthropic.NotFoundError) return new ConfigError("Model not found. Pick another model on the Settings page.");
  if (err instanceof Anthropic.RateLimitError) return new AiError("Rate limited by the Claude API. Wait a minute and try again.");
  if (err instanceof Anthropic.BadRequestError) return new AiError(`Claude API rejected the request: ${err.message}`);
  if (err instanceof Anthropic.APIUserAbortError) return new AiError("Cancelled.");
  if (err instanceof Anthropic.APIConnectionError) return new AiError("Couldn't reach the Claude API. Check your internet connection.");
  if (err instanceof Anthropic.APIError) return new AiError(`Claude API error (${err.status ?? "?"}): ${err.message}`);
  return err instanceof Error ? err : new Error(String(err));
}
