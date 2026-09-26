"use client";

import { useRef, useState } from "react";
import type { BrandData } from "./types";
import { api, ApiError, fmtDate } from "@/lib/client";
import { EMAIL_TYPES, EMAIL_TYPE_LABELS, type EmailType, type SourceEmail } from "@/lib/types";
import { AutoText } from "../ui";

const ACCEPT = ".html,.htm,.eml,.txt,.md,.png,.jpg,.jpeg,.webp,.gif";

export function SourcesTab({ data, reload, goToProfile }: { data: BrandData; reload: () => Promise<void>; goToProfile: () => void }) {
  const { brand, sources, profile } = data;
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState("");
  const [emailType, setEmailType] = useState<string>("auto");
  const [favorite, setFavorite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: number; failed: { name: string; error: string }[] } | null>(null);
  const [error, setError] = useState("");
  const [over, setOver] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const input = useRef<HTMLInputElement>(null);

  async function add() {
    setBusy(true);
    setError("");
    setResult(null);
    const form = new FormData();
    for (const f of files) form.append("files", f);
    form.append("text", text);
    form.append("emailType", emailType);
    form.append("favorite", String(favorite));
    try {
      const res = await api<{ created: SourceEmail[]; failed: { name: string; error: string }[] }>(`/api/brands/${brand.id}/sources`, {
        method: "POST",
        body: form,
      });
      setResult({ ok: res.created.length, failed: res.failed });
      if (res.created.length) {
        setFiles([]);
        setText("");
      }
      await reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const needsAi = emailType === "auto" || files.some((f) => /\.(png|jpe?g|webp|gif)$/i.test(f.name));
  const shown = filter === "all" ? sources : sources.filter((s) => s.emailType === filter);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="card stack">
        <div>
          <h2>Add past emails</h2>
          <p className="muted small" style={{ marginTop: 4 }}>
            5–10 emails per brand is a good start; more is better. Upload exported <code>.html</code> or <code>.eml</code> files or screenshots, or paste the copy.
          </p>
        </div>

        <div
          className={`dropzone ${over ? "over" : ""}`}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            setFiles((f) => [...f, ...Array.from(e.dataTransfer.files)]);
          }}
        >
          <strong>Drop files here</strong> or click to choose
          <div className="small faint">.html .eml .txt .md, or screenshots (.png .jpg .webp)</div>
          <input
            ref={input}
            type="file"
            multiple
            accept={ACCEPT}
            hidden
            onChange={(e) => {
              setFiles((f) => [...f, ...Array.from(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
        </div>
        {files.length > 0 && (
          <div className="row">
            {files.map((f, i) => (
              <span key={i} className="file-chip">
                {f.name}
                <button className="btn ghost sm" style={{ height: 18, padding: 0 }} onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}

        <label className="field">
          <span>…or paste an email</span>
          <small>Optional first lines: “Subject: …” and “Preview: …”</small>
          <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Subject: Your summer glow starts here\nPreview: 20% off our bestsellers, this weekend only\n\nHey gorgeous,\n…"} />
        </label>

        <div className="row">
          <label className="field" style={{ width: 220 }}>
            <span>Email type</span>
            <select value={emailType} onChange={(e) => setEmailType(e.target.value)}>
              <option value="auto">Auto-detect</option>
              {EMAIL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {EMAIL_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="check" style={{ marginTop: 22 }}>
            <input type="checkbox" checked={favorite} onChange={(e) => setFavorite(e.target.checked)} /> Mark as favourite (strongest on-voice examples)
          </label>
        </div>

        <div className="row">
          <button className="btn primary" disabled={busy || (!files.length && !text.trim())} onClick={add}>
            {busy ? "Adding…" : `Add ${files.length + (text.trim() ? 1 : 0) || ""} email${files.length + (text.trim() ? 1 : 0) === 1 ? "" : "s"}`}
          </button>
          {busy && needsAi && <span className="muted small">Reading screenshots and detecting types with Claude. This can take a moment per email.</span>}
        </div>

        {error && <div className="banner err">{error}</div>}
        {result && (
          <div className={`banner ${result.failed.length ? "warn" : "ok"}`}>
            Added {result.ok} email{result.ok === 1 ? "" : "s"}.
            {result.failed.map((f, i) => (
              <div key={i}>
                <strong>{f.name}:</strong> {f.error}
              </div>
            ))}
          </div>
        )}
      </div>

      {sources.length > 0 && !profile && (
        <div className="banner info row between">
          <span>
            {sources.length < 3 ? "Add a few more emails, then " : "Ready: "}build the voice profile from these {sources.length} emails.
          </span>
          <button className="btn primary sm" onClick={goToProfile}>
            Go to voice profile →
          </button>
        </div>
      )}

      <div className="stack">
        <div className="row between">
          <h2>
            Library <span className="faint">({sources.length})</span>
          </h2>
          <select style={{ width: 200 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All types</option>
            {EMAIL_TYPES.map((t) => (
              <option key={t} value={t}>
                {EMAIL_TYPE_LABELS[t]} ({sources.filter((s) => s.emailType === t).length})
              </option>
            ))}
          </select>
        </div>
        {sources.length === 0 && <div className="empty">No emails yet. Add some above.</div>}
        <div className="source-list">
          {shown.map((s) => (
            <SourceItem key={s.id} source={s} reload={reload} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SourceItem({ source, reload }: { source: SourceEmail; reload: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(source);
  const url = `/api/brands/${source.brandId}/sources/${source.id}`;

  async function patch(p: Partial<SourceEmail>) {
    await api(url, { method: "PUT", json: p });
    await reload();
  }

  const title = source.subject || source.body.split("\n").find((l) => l.trim())?.replace(/^#+\s*/, "") || "(untitled)";

  return (
    <div className="source">
      <div className="meta">
        <button className="btn ghost sm" title={source.favorite ? "Unmark favourite" : "Mark favourite"} onClick={() => patch({ favorite: !source.favorite })} style={{ padding: "0 4px", fontSize: 16, color: source.favorite ? "#f59f00" : undefined }}>
          {source.favorite ? "★" : "☆"}
        </button>
        <span className="subject" style={{ cursor: "pointer" }} onClick={() => setOpen(!open)}>
          {title}
        </span>
        <span className="spacer" />
        {source.origin === "final" && <span className="badge accent">Written here</span>}
        <select
          style={{ width: 170, height: 28, padding: "2px 8px", fontSize: 12.5 }}
          value={source.emailType}
          onChange={(e) => patch({ emailType: e.target.value as EmailType })}
        >
          {EMAIL_TYPES.map((t) => (
            <option key={t} value={t}>
              {EMAIL_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <span className="faint small nowrap">{fmtDate(source.createdAt)}</span>
        <button className="btn ghost sm" onClick={() => setOpen(!open)}>
          {open ? "Hide" : "View"}
        </button>
      </div>
      {source.preview && !open && <p className="muted small" style={{ marginLeft: 34 }}>{source.preview}</p>}
      {open && !editing && (
        <>
          {source.preview && <p className="muted small" style={{ marginTop: 6 }}>Preview: {source.preview}</p>}
          <pre>{source.body}</pre>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn sm" onClick={() => { setDraft(source); setEditing(true); }}>
              Edit text
            </button>
            <button
              className="btn sm danger"
              onClick={async () => {
                if (!confirm("Delete this email from the library?")) return;
                await api(url, { method: "DELETE" });
                await reload();
              }}
            >
              Delete
            </button>
            {source.fileName && <span className="faint small">From {source.fileName}</span>}
          </div>
        </>
      )}
      {open && editing && (
        <div className="stack" style={{ marginTop: 10 }}>
          <label className="field">
            <span>Subject</span>
            <input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
          </label>
          <label className="field">
            <span>Preview text</span>
            <input value={draft.preview} onChange={(e) => setDraft({ ...draft, preview: e.target.value })} />
          </label>
          <label className="field">
            <span>Body</span>
            <AutoText minRows={6} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
          </label>
          <div className="row">
            <button
              className="btn primary sm"
              onClick={async () => {
                await patch({ subject: draft.subject, preview: draft.preview, body: draft.body });
                setEditing(false);
              }}
            >
              Save
            </button>
            <button className="btn ghost sm" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
