import "server-only";
import type { BetaContentBlockParam, BetaMessageParam, BetaTextBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { z } from "zod";
import type { Settings, Usage } from "../types";

// OpenRouter (https://openrouter.ai) is the fallback provider: an OpenAI-style
// chat completions API in front of many models. Requests are built from the same
// Anthropic-shaped system blocks and messages the Claude path uses.

const BASE_URL = (process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, "");

export const OPENROUTER_SUGGESTED_MODELS = [
  "openai/gpt-6-sol",
  "google/gemini-3.8-flash",
  "anthropic/claude-sonnet-5",
  "anthropic/claude-opus-5",
];

export class OpenRouterError extends Error {
  constructor(message: string, public config = false) {
    super(message);
  }
}

export interface OpenRouterConfig {
  apiKey: string;
  model: string;
}

/** The OpenRouter settings to use, or null if it isn't set up or is switched off. */
export function openRouterConfig(settings: Settings): OpenRouterConfig | null {
  const apiKey = settings.openrouterApiKey || process.env.OPENROUTER_API_KEY || "";
  if (!apiKey || !settings.openrouterEnabled) return null;
  return { apiKey, model: settings.openrouterModel.trim() || OPENROUTER_SUGGESTED_MODELS[0] };
}

type Part =
  | { type: "text"; text: string; cache_control?: { type: "ephemeral" } }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

function toParts(content: string | BetaContentBlockParam[]): string | Part[] {
  if (typeof content === "string") return content;
  return content.map((b): Part => {
    if (b.type === "text") return { type: "text", text: b.text };
    if (b.type === "image" && b.source.type === "base64") {
      return { type: "image_url", image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` } };
    }
    if (b.type === "document" && b.source.type === "base64" && b.source.media_type === "application/pdf") {
      return { type: "file", file: { filename: "document.pdf", file_data: `data:application/pdf;base64,${b.source.data}` } };
    }
    throw new OpenRouterError(`Content of type "${b.type}" can't be sent to OpenRouter.`);
  });
}

function systemMessage(system: string | BetaTextBlockParam[]) {
  if (typeof system === "string") return { role: "system", content: system };
  // cache_control is honoured by providers that support prompt caching (e.g. Anthropic, Gemini) and ignored by others.
  return {
    role: "system",
    content: system.map((b) => ({ type: "text", text: b.text, ...(b.cache_control ? { cache_control: { type: "ephemeral" as const } } : {}) })),
  };
}

function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _drop, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return rest;
}

function errorFor(status: number, detail: string): OpenRouterError {
  if (status === 401) return new OpenRouterError("The OpenRouter API key was rejected. Check it on the Settings page.", true);
  if (status === 402) return new OpenRouterError("The OpenRouter account is out of credits.", true);
  if (status === 403) return new OpenRouterError(`OpenRouter refused the request (moderation): ${detail}`);
  if (status === 404) return new OpenRouterError(`OpenRouter couldn't serve this request with the chosen model (${detail}). Pick a model that supports structured outputs.`, true);
  if (status === 408) return new OpenRouterError("OpenRouter timed out. Try again.");
  if (status === 429) return new OpenRouterError("OpenRouter rate limit reached. Wait a minute and try again.");
  if (status === 400) return new OpenRouterError(`OpenRouter rejected the request: ${detail}`);
  return new OpenRouterError(`OpenRouter error (${status}): ${detail}`);
}

interface ChatCall {
  config: OpenRouterConfig;
  system: string | BetaTextBlockParam[];
  messages: BetaMessageParam[];
  effort: Settings["effort"];
  maxTokens: number;
  schema?: z.ZodType;
  onText?: (snapshot: string) => void;
  signal?: AbortSignal;
}

/** One streaming chat completion. Returns the full text and usage. */
async function chat(call: ChatCall): Promise<{ text: string; usage: Usage }> {
  const body: Record<string, unknown> = {
    model: call.config.model,
    stream: true,
    max_tokens: call.maxTokens,
    reasoning: { effort: call.effort },
    usage: { include: true },
    messages: [
      systemMessage(call.system),
      ...call.messages.map((m) => ({ role: m.role, content: toParts(m.content as string | BetaContentBlockParam[]) })),
    ],
  };
  if (call.schema) {
    body.response_format = { type: "json_schema", json_schema: { name: "output", strict: true, schema: jsonSchemaOf(call.schema) } };
    // Only route to providers that actually enforce the schema.
    body.provider = { require_parameters: true };
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${call.config.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost",
        "X-Title": "Brand Copywriter",
      },
      body: JSON.stringify(body),
      signal: call.signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new OpenRouterError("Couldn't reach OpenRouter. Check your internet connection.");
  }
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw errorFor(res.status, data?.error?.message ?? res.statusText);
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let text = "";
  let finish: string | null = null;
  let usage: { prompt_tokens?: number; completion_tokens?: number; cost?: number; prompt_tokens_details?: { cached_tokens?: number } } = {};
  let servedBy = call.config.model;

  for (;;) {
    const { value, done } = await reader.read();
    if (value) buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue; // SSE comments such as ": OPENROUTER PROCESSING"
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") continue;
      const chunk = JSON.parse(payload);
      if (chunk.error) throw errorFor(Number(chunk.error.code) || 500, chunk.error.message ?? "stream error");
      if (chunk.model) servedBy = chunk.model;
      const choice = chunk.choices?.[0];
      const delta = choice?.delta?.content;
      if (typeof delta === "string" && delta) {
        text += delta;
        call.onText?.(text);
      }
      if (choice?.finish_reason) finish = choice.finish_reason;
      if (chunk.usage) usage = chunk.usage;
    }
    if (done) break;
  }

  if (finish === "length") throw new OpenRouterError("The response was cut off (too long). Try a shorter brief.");
  if (finish === "content_filter") throw new OpenRouterError("The OpenRouter model declined this request.");

  return {
    text,
    usage: {
      model: `${servedBy} (OpenRouter)`,
      inputTokens: usage.prompt_tokens ?? 0,
      outputTokens: usage.completion_tokens ?? 0,
      cacheReadTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
      cacheWriteTokens: 0,
      costUsd: Math.round((usage.cost ?? 0) * 10000) / 10000,
    },
  };
}

/** Parses model output as JSON, tolerating a Markdown code fence around it. */
function parseJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(t);
}

export async function openRouterStructured<S extends z.ZodType>(
  call: Omit<ChatCall, "schema" | "onText"> & { schema: S; onText?: (snapshot: string) => void },
): Promise<{ data: z.infer<S>; usage: Usage }> {
  const { text, usage } = await chat(call);
  let parsed: unknown;
  try {
    parsed = call.schema.parse(parseJson(text));
  } catch (err) {
    // Same marker the Claude path uses, so the caller's one-retry logic applies.
    throw new Error(`Failed to parse structured output: ${(err as Error).message.slice(0, 300)}`);
  }
  return { data: parsed as z.infer<S>, usage };
}

export async function openRouterText(call: Omit<ChatCall, "schema">): Promise<{ text: string; usage: Usage }> {
  const { text, usage } = await chat(call);
  return { text: text.trim(), usage };
}
