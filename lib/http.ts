import "server-only";
import { ZodError } from "zod";
import { AiError, ConfigError } from "./ai/client";
import { NotFoundError } from "./store";

export type Ctx<P> = { params: Promise<P> };

function errorBody(err: unknown): { status: number; body: { error: string; code?: string } } {
  if (err instanceof NotFoundError) return { status: 404, body: { error: err.message } };
  if (err instanceof ConfigError) return { status: 400, body: { error: err.message, code: "config" } };
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return { status: 400, body: { error: `Invalid input${first ? ` at ${first.path.join(".") || "(root)"}: ${first.message}` : ""}` } };
  }
  if (err instanceof AiError) return { status: 502, body: { error: err.message } };
  console.error(err);
  return { status: 500, body: { error: err instanceof Error ? err.message : "Unexpected error" } };
}

/** Wraps a route handler so thrown errors become readable JSON responses. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<unknown>) {
  return async (...args: A): Promise<Response> => {
    try {
      const out = await fn(...args);
      return out instanceof Response ? out : Response.json(out ?? { ok: true });
    } catch (err) {
      const { status, body } = errorBody(err);
      return Response.json(body, { status });
    }
  };
}

export type StreamEvent =
  | { type: "progress"; phase: string; chars: number }
  | { type: "done"; result: unknown }
  | { type: "error"; error: string; code?: string };

/**
 * Long AI jobs stream newline-delimited JSON: progress heartbeats, then one
 * "done" or "error" line. Keeps the UI alive during a 20-60 second generation.
 */
export function ndjson(run: (progress: (phase: string, chars: number) => void) => Promise<unknown>): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const send = (e: StreamEvent) => {
        try {
          controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
        } catch {
          // Client went away; nothing to do.
        }
      };
      try {
        const result = await run((phase, chars) => send({ type: "progress", phase, chars }));
        send({ type: "done", result });
      } catch (err) {
        send({ type: "error", ...errorBody(err).body });
      } finally {
        try {
          controller.close();
        } catch {}
      }
    },
  });
  return new Response(body, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
