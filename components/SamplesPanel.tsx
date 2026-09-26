"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";

interface Sample {
  id: string;
  name: string;
  description: string;
  emailCount: number;
  docCount: number;
  hasProfile: boolean;
  importedBrandId: string | null;
}

type Result = { id: string; skipped?: boolean; error?: string; emails?: number; docs?: number; profile?: boolean };

/** Lets the user import the bundled sample brands (samples/) for testing. */
export function SamplesPanel({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  const [samples, setSamples] = useState<Sample[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [withProfiles, setWithProfiles] = useState(true);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Sample[]>("/api/samples")
      .then((s) => {
        setSamples(s);
        setPicked(s.filter((x) => !x.importedBrandId).map((x) => x.id));
      })
      .catch((e) => setError(e.message));
  }, []);

  async function load() {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ results: Result[] }>("/api/samples", { method: "POST", json: { ids: picked, withProfiles } });
      setResults(r.results);
      onDone();
      setSamples(await api<Sample[]>("/api/samples"));
      setPicked([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card stack" style={{ marginBottom: 20 }}>
      <div className="row between" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
        <div>
          <h2>Sample brands for testing</h2>
          <p className="muted small" style={{ marginTop: 4 }}>
            Three made-up brands with very different voices, each with 6 past emails (with results), a style guide, product info, palette, rules and ready-to-use briefs. Importing makes no AI calls.
          </p>
        </div>
        <button className="btn ghost sm" onClick={onClose}>
          Close
        </button>
      </div>
      {!samples && !error && <p className="muted">Loading…</p>}
      {samples?.length === 0 && <p className="muted">No sample data found in the app's samples folder.</p>}
      {samples && samples.length > 0 && (
        <div className="stack tight">
          {samples.map((s) => (
            <label key={s.id} className="check" style={{ alignItems: "flex-start", opacity: s.importedBrandId ? 0.6 : 1 }}>
              <input
                type="checkbox"
                disabled={!!s.importedBrandId}
                checked={picked.includes(s.id)}
                onChange={(e) => setPicked(e.target.checked ? [...picked, s.id] : picked.filter((x) => x !== s.id))}
                style={{ marginTop: 3 }}
              />
              <span>
                <strong>{s.name}</strong> {s.importedBrandId && <span className="badge ok">Imported</span>}
                <br />
                <span className="small muted">
                  {s.description} · {s.emailCount} emails, {s.docCount} documents
                </span>
              </span>
            </label>
          ))}
          <label className="check" style={{ marginTop: 8 }}>
            <input type="checkbox" checked={withProfiles} onChange={(e) => setWithProfiles(e.target.checked)} /> Include ready-made voice profiles (so you can write right away; untick to test building profiles with AI)
          </label>
          <div className="row" style={{ marginTop: 6 }}>
            <button className="btn primary" disabled={busy || picked.length === 0} onClick={load}>
              {busy ? "Importing…" : `Import ${picked.length || ""} sample brand${picked.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      )}
      {error && <div className="banner err">{error}</div>}
      {results && (
        <div className={`banner ${results.some((r) => r.error) ? "warn" : "ok"}`}>
          {results.map((r) => (
            <div key={r.id}>
              <strong>{samples?.find((s) => s.id === r.id)?.name ?? r.id}:</strong>{" "}
              {r.error ? r.error : r.skipped ? "already imported" : `${r.emails} emails, ${r.docs} documents${r.profile ? ", voice profile" : ""}`}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
