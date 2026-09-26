"use client";

import { useRef, useState } from "react";
import { api, ApiError, fmtDate, streamJob, type JobProgress } from "@/lib/client";
import type { BrandProfile, BrandProfileContent } from "@/lib/types";
import { AutoText, Progress } from "../ui";
import type { BrandData } from "./types";

// ---------- Editing spec: how each profile field maps to a text box ----------

type Kind = "text" | "lines" | "typed" | "typedList";
interface Spec {
  path: string[];
  label: string;
  kind: Kind;
  hint?: string;
}

const GROUPS: { title: string; fields: Spec[] }[] = [
  {
    title: "Voice",
    fields: [
      { path: ["summary"], label: "Summary", kind: "text" },
      { path: ["personality"], label: "Personality", kind: "lines", hint: "One trait per line" },
      { path: ["audience"], label: "Audience", kind: "text" },
      { path: ["tone_by_email_type"], label: "Tone by email type", kind: "typed", hint: "One per line: email_type: tone" },
    ],
  },
  {
    title: "Mechanics",
    fields: [
      { path: ["mechanics", "sentence_length"], label: "Sentence length", kind: "text" },
      { path: ["mechanics", "person"], label: "Point of view", kind: "text" },
      { path: ["mechanics", "capitalization"], label: "Capitalisation", kind: "text" },
      { path: ["mechanics", "punctuation"], label: "Punctuation", kind: "text" },
      { path: ["mechanics", "emoji"], label: "Emoji", kind: "text" },
      { path: ["mechanics", "formatting"], label: "Formatting", kind: "text" },
    ],
  },
  {
    title: "Vocabulary",
    fields: [
      { path: ["vocabulary", "signature_phrases"], label: "Signature phrases", kind: "lines", hint: "One per line" },
      { path: ["vocabulary", "preferred_words"], label: "Preferred words", kind: "lines", hint: "One per line" },
      { path: ["vocabulary", "avoid_words"], label: "Words to avoid", kind: "lines", hint: "One per line. Drafts are checked for these." },
    ],
  },
  {
    title: "Subject lines & preview text",
    fields: [
      { path: ["subject_lines", "patterns"], label: "Subject line patterns", kind: "lines" },
      { path: ["subject_lines", "typical_length"], label: "Typical length", kind: "text" },
      { path: ["subject_lines", "examples"], label: "Subject line examples", kind: "lines" },
      { path: ["preview_text", "patterns"], label: "Preview text patterns", kind: "lines" },
      { path: ["preview_text", "examples"], label: "Preview text examples", kind: "lines" },
    ],
  },
  {
    title: "Structure & CTAs",
    fields: [
      { path: ["structure", "default"], label: "Default structure", kind: "lines", hint: "One section per line, in order" },
      { path: ["structure", "by_email_type"], label: "Structure by email type", kind: "typedList", hint: "One per line: email_type: hero > offer > products > cta" },
      { path: ["cta_style", "patterns"], label: "CTA patterns", kind: "lines" },
      { path: ["cta_style", "examples"], label: "CTA examples", kind: "lines" },
      { path: ["sign_off"], label: "Sign-off", kind: "text" },
    ],
  },
  {
    title: "Rules of thumb",
    fields: [
      { path: ["dos"], label: "Do", kind: "lines" },
      { path: ["donts"], label: "Don't", kind: "lines" },
      { path: ["open_questions"], label: "Open questions", kind: "lines", hint: "Things for you to decide. Answer them in the fields above, then clear them." },
    ],
  },
];

function getAt(obj: unknown, path: string[]): unknown {
  return path.reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], obj);
}

function setAt<T>(obj: T, path: string[], value: unknown): T {
  const clone = structuredClone(obj) as Record<string, unknown>;
  let cur = clone;
  for (const k of path.slice(0, -1)) cur = cur[k] as Record<string, unknown>;
  cur[path.at(-1)!] = value;
  return clone as T;
}

function toText(kind: Kind, v: unknown): string {
  if (kind === "text") return String(v ?? "");
  if (kind === "lines") return ((v as string[]) ?? []).join("\n");
  if (kind === "typed") return ((v as { email_type: string; tone: string }[]) ?? []).map((x) => `${x.email_type}: ${x.tone}`).join("\n");
  return ((v as { email_type: string; sections: string[] }[]) ?? []).map((x) => `${x.email_type}: ${x.sections.join(" > ")}`).join("\n");
}

function fromText(kind: Kind, s: string): unknown {
  if (kind === "text") return s;
  const lines = s.split("\n").map((l) => l.trim()).filter(Boolean);
  if (kind === "lines") return lines;
  const pairs = lines.map((l) => {
    const i = l.indexOf(":");
    return i < 0 ? ["other", l] : [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  });
  if (kind === "typed") return pairs.map(([email_type, tone]) => ({ email_type, tone }));
  return pairs.map(([email_type, rest]) => ({ email_type, sections: rest.split(">").map((x) => x.trim()).filter(Boolean) }));
}

// ---------- Component ----------

export function ProfileTab({ data, reload }: { data: BrandData; reload: () => Promise<void> }) {
  const { brand, sources, profile, versions, finalsSinceProfile } = data;
  const [progress, setProgress] = useState<JobProgress | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<BrandProfileContent | null>(null);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [viewing, setViewing] = useState<BrandProfile | null>(null);
  const abort = useRef<AbortController | null>(null);

  async function build() {
    setError("");
    setProgress({ phase: "Starting…", chars: 0 });
    abort.current = new AbortController();
    try {
      await streamJob(`/api/brands/${brand.id}/profile`, {}, setProgress, abort.current.signal);
      setViewing(null);
      await reload();
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  }

  function startEdit() {
    if (!profile) return;
    const t: Record<string, string> = {};
    for (const g of GROUPS) for (const f of g.fields) t[f.path.join(".")] = toText(f.kind, getAt(profile.profile, f.path));
    setTexts(t);
    setEditing(profile.profile);
  }

  async function saveEdit() {
    if (!editing) return;
    let next = editing;
    for (const g of GROUPS) for (const f of g.fields) next = setAt(next, f.path, fromText(f.kind, texts[f.path.join(".")] ?? ""));
    try {
      await api(`/api/brands/${brand.id}/profile`, { method: "PUT", json: { profile: next } });
      setEditing(null);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function activate(version: number) {
    await api(`/api/brands/${brand.id}/profile`, { method: "PATCH", json: { version } });
    setViewing(null);
    await reload();
  }

  async function view(version: number) {
    if (version === profile?.version) return setViewing(null);
    setViewing(await api<BrandProfile>(`/api/brands/${brand.id}/profile?version=${version}`));
  }

  if (progress) {
    return (
      <div className="card stack" style={{ maxWidth: 640 }}>
        <h2>{profile ? "Refreshing" : "Building"} the voice profile…</h2>
        <p className="muted">Claude is reading {sources.length} emails and working out how {brand.name} writes. This usually takes 30–90 seconds.</p>
        <Progress progress={progress} onCancel={() => abort.current?.abort()} />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="stack">
        {error && <div className="banner err">{error}</div>}
        <div className="empty">
          <h3>No voice profile yet</h3>
          <p>
            {sources.length === 0
              ? "Add some past emails first (tab 1)."
              : `Claude will read the ${sources.length} email${sources.length === 1 ? "" : "s"} in the library and write down how ${brand.name} writes. You can edit everything afterwards.`}
          </p>
          <button className="btn primary" style={{ marginTop: 14 }} disabled={!sources.length} onClick={build}>
            Build voice profile
          </button>
          {sources.length > 0 && sources.length < 5 && <p className="small faint" style={{ marginTop: 8 }}>Tip: 5 or more emails give a much better profile.</p>}
        </div>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="stack" style={{ gap: 18 }}>
        <div className="row between">
          <h2>Edit voice profile</h2>
          <div className="row">
            <button className="btn ghost" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button className="btn primary" onClick={saveEdit}>
              Save as v{Math.max(...versions.map((v) => v.version)) + 1}
            </button>
          </div>
        </div>
        {error && <div className="banner err">{error}</div>}
        {GROUPS.map((g) => (
          <div key={g.title} className="card stack">
            <h3>{g.title}</h3>
            {g.fields.map((f) => {
              const k = f.path.join(".");
              return (
                <label key={k} className="field">
                  <span>{f.label}</span>
                  {f.hint && <small>{f.hint}</small>}
                  {f.kind === "text" && !["summary", "audience"].includes(k) ? (
                    <input value={texts[k] ?? ""} onChange={(e) => setTexts({ ...texts, [k]: e.target.value })} />
                  ) : (
                    <AutoText minRows={2} value={texts[k] ?? ""} onChange={(e) => setTexts({ ...texts, [k]: e.target.value })} />
                  )}
                </label>
              );
            })}
          </div>
        ))}
        <div className="row">
          <button className="btn primary" onClick={saveEdit}>
            Save changes
          </button>
          <button className="btn ghost" onClick={() => setEditing(null)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const shown = viewing ?? profile;
  const p = shown.profile;

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="row between">
        <div className="row">
          <select style={{ width: 280 }} value={shown.version} onChange={(e) => view(Number(e.target.value))}>
            {versions.map((v) => (
              <option key={v.version} value={v.version}>
                v{v.version} · {v.createdBy === "ai" ? "AI" : "edited"} · {fmtDate(v.createdAt)}
                {v.version === profile.version ? " (active)" : ""}
              </option>
            ))}
          </select>
          <span className="muted small">{shown.note}</span>
        </div>
        <div className="row">
          {viewing ? (
            <>
              <button className="btn" onClick={() => setViewing(null)}>
                Back to active
              </button>
              <button className="btn primary" onClick={() => activate(viewing.version)}>
                Use v{viewing.version}
              </button>
            </>
          ) : (
            <>
              <button className="btn" onClick={startEdit}>
                Edit
              </button>
              <button className="btn" onClick={build} title="Re-read all emails (and your edits to finished drafts) and update the profile">
                Refresh with AI
              </button>
            </>
          )}
        </div>
      </div>

      {error && <div className="banner err">{error}</div>}
      {viewing && <div className="banner info">You're viewing an older version. The active one is v{profile.version}.</div>}
      {!viewing && finalsSinceProfile > 0 && (
        <div className="banner info">
          {finalsSinceProfile} email{finalsSinceProfile === 1 ? " was" : "s were"} finalised since this profile was made. <strong>Refresh with AI</strong> to learn from your edits.
        </div>
      )}
      {p.open_questions.length > 0 && (
        <div className="banner warn">
          <strong>Open questions for you</strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {p.open_questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
          <div className="small" style={{ marginTop: 6 }}>Answer these by editing the profile.</div>
        </div>
      )}

      <div className="card">
        <p style={{ fontSize: 15 }}>{p.summary}</p>
        <div className="chips" style={{ marginTop: 10 }}>
          {p.personality.map((t, i) => (
            <span key={i} className="chip">
              {t}
            </span>
          ))}
        </div>
        <p className="muted small" style={{ marginTop: 10 }}>
          <strong>Audience:</strong> {p.audience}
        </p>
      </div>

      <div className="profile-view">
        <Card title="Mechanics">
          <dl className="kv">
            <dt>Sentences</dt>
            <dd>{p.mechanics.sentence_length}</dd>
            <dt>Point of view</dt>
            <dd>{p.mechanics.person}</dd>
            <dt>Capitalisation</dt>
            <dd>{p.mechanics.capitalization}</dd>
            <dt>Punctuation</dt>
            <dd>{p.mechanics.punctuation}</dd>
            <dt>Emoji</dt>
            <dd>{p.mechanics.emoji}</dd>
            <dt>Formatting</dt>
            <dd>{p.mechanics.formatting}</dd>
          </dl>
        </Card>
        <Card title="Vocabulary">
          <Sub label="Signature phrases" items={p.vocabulary.signature_phrases} quote />
          <Sub label="Preferred words" items={p.vocabulary.preferred_words} chips />
          <Sub label="Avoid" items={p.vocabulary.avoid_words} chips />
        </Card>
        <Card title="Subject lines">
          <p className="small muted">{p.subject_lines.typical_length}</p>
          <List items={p.subject_lines.patterns} />
          <Sub label="Examples" items={p.subject_lines.examples} quote />
        </Card>
        <Card title="Preview text">
          <List items={p.preview_text.patterns} />
          <Sub label="Examples" items={p.preview_text.examples} quote />
        </Card>
        <Card title="Structure">
          <p className="small">
            <strong>Default:</strong> {p.structure.default.join(" → ")}
          </p>
          {p.structure.by_email_type.map((s, i) => (
            <p key={i} className="small" style={{ marginTop: 4 }}>
              <strong>{s.email_type}:</strong> {s.sections.join(" → ")}
            </p>
          ))}
        </Card>
        <Card title="Tone by email type">
          {p.tone_by_email_type.map((t, i) => (
            <p key={i} className="small" style={{ marginTop: i ? 4 : 0 }}>
              <strong>{t.email_type}:</strong> {t.tone}
            </p>
          ))}
        </Card>
        <Card title="CTAs & sign-off">
          <List items={p.cta_style.patterns} />
          <Sub label="Examples" items={p.cta_style.examples} chips />
          <p className="small" style={{ marginTop: 8 }}>
            <strong>Sign-off:</strong> {p.sign_off || "—"}
          </p>
        </Card>
        <Card title="Do">
          <List items={p.dos} />
        </Card>
        <Card title="Don't">
          <List items={p.donts} />
        </Card>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

function List({ items }: { items: string[] }) {
  if (!items.length) return <p className="faint small">—</p>;
  return (
    <ul>
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
}

function Sub({ label, items, quote, chips }: { label: string; items: string[]; quote?: boolean; chips?: boolean }) {
  if (!items.length) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <div className="small muted" style={{ fontWeight: 600, marginBottom: 3 }}>
        {label}
      </div>
      {chips ? (
        <div className="chips">
          {items.map((x, i) => (
            <span key={i} className="chip">
              {x}
            </span>
          ))}
        </div>
      ) : (
        <ul>
          {items.map((x, i) => (
            <li key={i}>{quote ? `“${x}”` : x}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
