"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui";
import { api, fmtUsd } from "@/lib/client";
import { MODELS, type PublicSettings } from "@/lib/types";

type S = PublicSettings & { spend: { monthUsd: number; totalUsd: number; calls: number } };

export default function SettingsPage() {
  const toast = useToast();
  const [s, setS] = useState<S | null>(null);
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [test, setTest] = useState<{ ok: boolean; msg: string } | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    api<S>("/api/settings").then(setS).catch((e) => setError(e.message));
  }, []);

  async function save(patch: Record<string, unknown>) {
    setError("");
    try {
      setS(await api<S>("/api/settings", { method: "PUT", json: patch }));
      toast.show("Saved");
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }

  async function runTest() {
    setTesting(true);
    setTest(null);
    try {
      const r = await api<{ reply: string; model: string }>("/api/settings/test", { method: "POST" });
      setTest({ ok: true, msg: `Connected. ${r.model} replied “${r.reply}”.` });
    } catch (e) {
      setTest({ ok: false, msg: (e as Error).message });
    } finally {
      setTesting(false);
    }
  }

  if (!s) return <main className="page">{error ? <div className="banner err">{error}</div> : <p className="muted">Loading…</p>}</main>;

  return (
    <main className="page" style={{ maxWidth: 720 }}>
      {toast.node}
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="sub">Stored on this computer only, in the app's data folder.</p>
        </div>
      </div>

      <div className="stack" style={{ gap: 18 }}>
        <div className="card stack">
          <h2>Claude API key</h2>
          <p className="muted small">
            Create one at <a href="https://platform.claude.com/settings/keys" target="_blank" rel="noreferrer">platform.claude.com</a> → API keys. Usage is billed to that account.
          </p>
          {s.apiKeySet && (
            <div className="banner ok">
              Key set ({s.apiKeyHint}){s.apiKeyFromEnv ? ", from the ANTHROPIC_API_KEY environment variable" : ""}.
            </div>
          )}
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <input type="password" placeholder={s.apiKeySet ? "Paste a new key to replace it" : "sk-ant-…"} value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" />
            <button
              className="btn primary"
              disabled={!key.trim()}
              onClick={async () => {
                if (await save({ apiKey: key })) setKey("");
              }}
            >
              Save key
            </button>
          </div>
          <div className="row">
            <button className="btn" disabled={!s.apiKeySet || testing} onClick={runTest}>
              {testing ? "Testing…" : "Test connection"}
            </button>
            {s.apiKeySet && !s.apiKeyFromEnv && (
              <button className="btn ghost danger" onClick={() => confirm("Remove the saved API key?") && save({ clearKey: true })}>
                Remove key
              </button>
            )}
          </div>
          {test && <div className={`banner ${test.ok ? "ok" : "err"}`}>{test.msg}</div>}
        </div>

        <div className="card stack">
          <h2>Writing</h2>
          <label className="field">
            <span>Model</span>
            <select value={s.model} onChange={(e) => save({ model: e.target.value })}>
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Effort</span>
            <small>How hard Claude thinks before writing. Higher is slower and costs more, and can match the voice more closely.</small>
            <select value={s.effort} onChange={(e) => save({ effort: e.target.value })}>
              <option value="low">Low (fastest)</option>
              <option value="medium">Medium (recommended)</option>
              <option value="high">High (most careful)</option>
            </select>
          </label>
          <label className="check" style={{ alignItems: "flex-start" }}>
            <input type="checkbox" checked={s.autoReview} onChange={(e) => save({ autoReview: e.target.checked })} style={{ marginTop: 3 }} />
            <span>
              <strong>Review every new email automatically</strong>
              <br />
              <span className="small muted">
                After writing, Claude checks the draft for voice, one clear CTA, generic-sounding copy, subject/preview pull, invented facts and your rules, and fixes what fails. It takes roughly twice as long and costs about twice as much per email. You can also run it on demand with <em>Review &amp; improve</em>.
              </span>
            </span>
          </label>
          <label className="field">
            <span>Example emails per request</span>
            <small>How many past emails Claude sees when writing. Same-type favourites are picked first.</small>
            <input type="number" min={1} max={15} value={s.examplesPerPrompt} onChange={(e) => save({ examplesPerPrompt: Math.min(15, Math.max(1, Number(e.target.value) || 6)) })} style={{ width: 100 }} />
          </label>
          <label className="field">
            <span>Suggest a profile refresh after this many finalised emails</span>
            <input type="number" min={1} value={s.refreshAfterFinals} onChange={(e) => save({ refreshAfterFinals: Math.max(1, Number(e.target.value) || 5) })} style={{ width: 100 }} />
          </label>
        </div>

        <div className="card stack tight">
          <h2>Spend (estimated)</h2>
          <p>
            This month: <strong>{fmtUsd(s.spend.monthUsd)}</strong> · All time: <strong>{fmtUsd(s.spend.totalUsd)}</strong> across {s.spend.calls} writing requests
          </p>
          <p className="small faint">Estimated from token counts for email writing and rewrites. Profile builds and screenshot reading aren't included. Your Claude Console shows the exact bill.</p>
        </div>

        {error && <div className="banner err">{error}</div>}
      </div>
    </main>
  );
}
