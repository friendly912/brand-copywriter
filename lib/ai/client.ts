import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaContentBlockParam, BetaMessageParam, BetaTextBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { z } from "zod";
import { getSettings } from "../store";
import type { Settings, Usage } from "../types";
import { OpenRouterError, openRouterConfig, openRouterStructured, openRouterText, type OpenRouterConfig } from "./openrouter";

export class ConfigError extends Error {}
export class AiError extends Error {}

// Provider order: Claude first; OpenRouter is the next option. It is used when
// no Claude key is set, or when a Claude request fails for any reason other
// than the user cancelling.

// USD per million tokens. Cache writes bill at 1.25x input, cache reads at 0.1x.
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

// Server-side refusal fallback ("default" routing) is documented for Claude Opus 5.
const SERVER_FALLBACK_MODELS = new Set(["claude-opus-5"]);

export type Provider = "claude" | "openrouter";

interface Providers {
  settings: Settings;
  claude: Anthropic | null;
  openrouter: OpenRouterConfig | null;
}

async function providers(): Promise<Providers> {
  const settings = await getSettings();
  const openrouter = openRouterConfig(settings);
  const claudeKey = settings.apiKey || process.env.ANTHROPIC_API_KEY;
  // With a fallback available, don't spend long retrying Claude before switching.
  const claude = claudeKey ? new Anthropic({ apiKey: claudeKey, maxRetries: openrouter ? 1 : 3 }) : null;
  if (!claude && !openrouter) throw new ConfigError("No API key yet. Add a Claude key (or an OpenRouter key) on the Settings page.");
  return { settings, claude, openrouter };
}

/** Runs `claudeFn`, and if it fails (or there's no Claude key), `openrouterFn`. */
async function withFallback<T>(
  p: Providers,
  only: Provider | undefined,
  signal: AbortSignal | undefined,
  onSwitch: (() => void) | undefined,
  claudeFn: (client: Anthropic) => Promise<T>,
  openrouterFn: (cfg: OpenRouterConfig) => Promise<T>,
): Promise<T> {
  if (only === "claude") {
    if (!p.claude) throw new ConfigError("No Claude API key set.");
    return claudeFn(p.claude);
  }
  if (only === "openrouter") {
    if (!p.openrouter) throw new ConfigError("No OpenRouter API key set, or OpenRouter is switched off.");
    return orCall(() => openrouterFn(p.openrouter!));
  }
  if (!p.claude) return orCall(() => openrouterFn(p.openrouter!));
  try {
    return await claudeFn(p.claude);
  } catch (err) {
    if (!p.openrouter || signal?.aborted || isAbort(err)) throw err;
    console.warn(`[ai] Claude failed, falling back to OpenRouter: ${(err as Error).message}`);
    onSwitch?.();
    try {
      return await orCall(() => openrouterFn(p.openrouter!));
    } catch (err2) {
      if (signal?.aborted || isAbort(err2)) throw err2;
      throw new AiError(`Claude failed (${(err as Error).message}) and OpenRouter failed too (${(err2 as Error).message}).`);
    }
  }
}

async function orCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof OpenRouterError) throw err.config ? new ConfigError(err.message) : new AiError(err.message);
    throw err;
  }
}

const isAbort = (err: unknown) => err instanceof Anthropic.APIUserAbortError || (err instanceof Error && err.name === "AbortError");
const isParseFailure = (err: unknown) => err instanceof Error && err.message.includes("Failed to parse structured output");

/** Retries once when the JSON didn't validate. */
async function parseRetry<T>(fn: () => Promise<T>, onRetry: () => void, signal?: AbortSignal): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isParseFailure(err) || signal?.aborted) throw err;
    onRetry();
    try {
      return await fn();
    } catch (again) {
      if (isParseFailure(again)) throw new AiError("The model's answer didn't match the expected format twice. Please try again.");
      throw again;
    }
  }
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
  maxTokens?: number;
  /** Maps the partial JSON text to a human-readable phase ("Writing subject lines…"). */
  phaseOf?: (partialJson: string) => string;
  onProgress?: Progress;
  signal?: AbortSignal;
}

/** One streaming request that must come back as JSON matching `schema`: Claude first, then OpenRouter. */
export async function runStructured<S extends z.ZodType>(call: StructuredCall<S>): Promise<{ data: z.infer<S>; usage: Usage }> {
  const p = await providers();
  const effort = call.effort ?? p.settings.effort;
  const maxTokens = call.maxTokens ?? 32000;
  const retry = () => call.onProgress?.({ phase: "Retrying…", chars: 0 });

  // Throttled heartbeat: the UI only needs a phase and a character count.
  let lastReport = 0;
  const onText = (snapshot: string) => {
    if (snapshot.length - lastReport < 200) return;
    lastReport = snapshot.length;
    call.onProgress?.({ phase: call.phaseOf?.(snapshot) ?? "Writing…", chars: snapshot.length });
  };

  return withFallback(
    p,
    undefined,
    call.signal,
    () => {
      lastReport = 0;
      call.onProgress?.({ phase: "Claude is unavailable, switching to OpenRouter…", chars: 0 });
    },
    (client) => parseRetry(() => claudeStructured(client, p.settings.model, effort, maxTokens, call, onText), retry, call.signal),
    (cfg) =>
      parseRetry(
        () => {
          call.onProgress?.({ phase: "Thinking (OpenRouter)…", chars: 0 });
          return openRouterStructured({ config: cfg, schema: call.schema, system: call.system, messages: call.messages, effort, maxTokens, onText, signal: call.signal });
        },
        retry,
        call.signal,
      ),
  );
}

async function claudeStructured<S extends z.ZodType>(
  client: Anthropic,
  model: string,
  effort: Settings["effort"],
  maxTokens: number,
  call: StructuredCall<S>,
  onText: (snapshot: string) => void,
): Promise<{ data: z.infer<S>; usage: Usage }> {
  const stream = client.beta.messages.stream(
    {
      model,
      max_tokens: maxTokens,
      thinking: { type: "adaptive" },
      output_config: { effort, format: betaZodOutputFormat(call.schema) },
      system: call.system,
      messages: call.messages,
      ...(SERVER_FALLBACK_MODELS.has(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    },
    { signal: call.signal },
  );

  call.onProgress?.({ phase: "Thinking…", chars: 0 });
  stream.on("text", (_delta, snapshot) => onText(snapshot));

  let message;
  try {
    message = await stream.finalMessage();
  } catch (err) {
    if (isParseFailure(err)) throw err; // handled by parseRetry
    throw toAiError(err);
  }

  if (message.stop_reason === "refusal") throw new AiError("Claude declined this request. Try rephrasing the brief.");
  if (message.stop_reason === "max_tokens") throw new AiError("The response was cut off (too long). Try a shorter brief or fewer sections.");
  if (message.parsed_output == null) throw new AiError("Claude's answer didn't match the expected format. Please try again.");
  return { data: message.parsed_output as z.infer<S>, usage: toUsage(model, message.usage) };
}

/** Plain vision/text call used for transcribing screenshots and documents, and connection tests. */
export async function runText(opts: {
  system: string;
  content: BetaContentBlockParam[];
  effort?: Settings["effort"];
  maxTokens?: number;
  /** Force one provider (used by the Settings connection tests). */
  provider?: Provider;
}): Promise<{ text: string; usage: Usage }> {
  const p = await providers();
  const effort = opts.effort ?? "low";
  const maxTokens = opts.maxTokens ?? 16000;
  const messages: BetaMessageParam[] = [{ role: "user", content: opts.content }];

  return withFallback(
    p,
    opts.provider,
    undefined,
    undefined,
    async (client) => {
      const model = p.settings.model;
      let message;
      try {
        message = await client.beta.messages
          .stream({
            model,
            max_tokens: maxTokens,
            thinking: { type: "adaptive" },
            output_config: { effort },
            system: opts.system,
            messages,
            ...(SERVER_FALLBACK_MODELS.has(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
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
    },
    (cfg) => openRouterText({ config: cfg, system: opts.system, messages, effort, maxTokens }),
  );
}

function toAiError(err: unknown): Error {
  if (err instanceof Anthropic.AuthenticationError) return new ConfigError("The Claude API key was rejected. Check it on the Settings page.");
  if (err instanceof Anthropic.PermissionDeniedError) return new ConfigError("This API key isn't allowed to use the selected model.");
  if (err instanceof Anthropic.NotFoundError) return new ConfigError("Model not found. Pick another model on the Settings page.");
  if (err instanceof Anthropic.RateLimitError) return new AiError("Rate limited by the Claude API. Wait a minute and try again.");
  if (err instanceof Anthropic.BadRequestError) return new AiError(`Claude API rejected the request: ${err.message}`);
  if (err instanceof Anthropic.APIUserAbortError) return err;
  if (err instanceof Anthropic.APIConnectionError) return new AiError("Couldn't reach the Claude API. Check your internet connection.");
  if (err instanceof Anthropic.APIError) return new AiError(`Claude API error (${err.status ?? "?"}): ${err.message}`);
  return err instanceof Error ? err : new Error(String(err));
}
