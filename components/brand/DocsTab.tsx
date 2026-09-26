"use client";

import { useRef, useState } from "react";
import { api, ApiError, fmtDate } from "@/lib/client";
import { DOC_KINDS, DOC_KIND_LABELS, WRITING_DOCS_CHAR_LIMIT, type BrandDoc, type DocKind } from "@/lib/types";
import { AutoText } from "../ui";
import type { BrandData } from "./types";

const ACCEPT = ".pdf,.docx,.doc,.txt,.md,.html,.htm,.png,.jpg,.jpeg,.webp,.gif";

const fmtChars = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

export function DocsTab({ data, reload, goToProfile }: { data: BrandData; reload: () => Promise<void>; goToProfile: () => void }) {
  const { brand, docs, profile, writingDocs } = data;
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<DocKind>("style_guide");
  const [useWhenWriting, setUseWhenWriting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: number; failed: { name: string; error: string }[] } | null>(null);
  const [error, setError] = useState("");
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function add() {
    setBusy(true);
    setError("");
    setResult(null);
    const form = new FormData();
    for (const f of files) form.append("files", f);
    form.append("text", text);
    form.append("title", title);
    form.append("kind", kind);
    form.append("useWhenWriting", String(useWhenWriting));
    try {
      const res = await api<{ created: BrandDoc[]; failed: { name: string; error: string }[] }>(`/api/brands/${brand.id}/docs`, { method: "POST", body: form });
      setResult({ ok: res.created.length, failed: res.failed });
      if (res.created.length) {
        setFiles([]);
        setText("");
        setTitle("");
      }
      await reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const newSinceProfile = profile ? docs.filter((d) => d.createdAt > profile.createdAt).length : 0;
  const pct = Math.min(100, Math.round((writingDocs.chars / WRITING_DOCS_CHAR_LIMIT) * 100));

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="card stack">
        <div>
          <h2>Add brand documents</h2>
          <p className="muted small" style={{ marginTop: 4 }}>
            Style guides and brand voice docs shape the voice profile and are sent with every email. Product and offer info gives Claude correct product names, features and prices, so it
            doesn't need placeholders for them.
          </p>
        </div>

        <div className="row" style={{ alignItems: "flex-end", gap: 16 }}>
          <label className="field" style={{ width: 240 }}>
            <span>Kind</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as DocKind)}>
              {DOC_KINDS.map((k) => (
                <option key={k} value={k}>
                  {DOC_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="check" style={{ paddingBottom: 8 }}>
            <input type="checkbox" checked={useWhenWriting} onChange={(e) => setUseWhenWriting(e.target.checked)} /> Send with every email
          </label>
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
          <strong>Drop documents here</strong> or click to choose
          <div className="small faint">PDF, Word (.docx), .txt, .md, .html, or images</div>
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
          <span>…or paste text</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title, e.g. Voice & tone guidelines" />
        </label>
        <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the document text here" />

        <div className="row">
          <button className="btn primary" disabled={busy || (!files.length && !text.trim())} onClick={add}>
            {busy ? "Adding…" : "Add document" + (files.length + (text.trim() ? 1 : 0) > 1 ? "s" : "")}
          </button>
          {busy && <span className="muted small">Reading documents. Scanned PDFs and images are read by Claude and take longer.</span>}
        </div>
        {error && <div className="banner err">{error}</div>}
        {result && (
          <div className={`banner ${result.failed.length ? "warn" : "ok"}`}>
            Added {result.ok} document{result.ok === 1 ? "" : "s"}.
            {result.failed.map((f, i) => (
              <div key={i}>
                <strong>{f.name}:</strong> {f.error}
              </div>
            ))}
          </div>
        )}
      </div>

      {newSinceProfile > 0 && (
        <div className="banner info row between">
          <span>
            {newSinceProfile} document{newSinceProfile === 1 ? " was" : "s were"} added after the voice profile was built. Refresh the profile to use {newSinceProfile === 1 ? "it" : "them"}.
          </span>
          <button className="btn primary sm" onClick={goToProfile}>
            Go to voice profile →
          </button>
        </div>
      )}

      <div className="stack">
        <div className="row between">
          <h2>
            Documents <span className="faint">({docs.length})</span>
          </h2>
          {docs.length > 0 && (
            <span className="small muted" title="Documents marked 'Send with every email' share this budget">
              Sent with every email: {fmtChars(writingDocs.chars)} of {fmtChars(WRITING_DOCS_CHAR_LIMIT)} characters ({pct}%)
            </span>
          )}
        </div>
        {writingDocs.truncated && (
          <div className="banner warn">
            The documents sent with every email are longer than the {fmtChars(WRITING_DOCS_CHAR_LIMIT)}-character budget, so the end of the last ones is left out. Untick <strong>Send with every email</strong> on
            long catalogues (they're still used for the voice profile), or trim them.
          </div>
        )}
        {docs.length === 0 && <div className="empty">No documents yet. They're optional, but a style guide helps a lot.</div>}
        <div className="source-list">
          {docs.map((d) => (
            <DocItem key={d.id} doc={d} reload={reload} />
          ))}
        </div>
      </div>
    </div>
  );
}

function DocItem({ doc, reload }: { doc: BrandDoc; reload: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(doc);
  const url = `/api/brands/${doc.brandId}/docs/${doc.id}`;

  async function patch(p: Partial<BrandDoc>) {
    await api(url, { method: "PUT", json: p });
    await reload();
  }

  return (
    <div className="source">
      <div className="meta">
        <span className="subject" style={{ cursor: "pointer" }} onClick={() => setOpen(!open)}>
          {doc.title}
        </span>
        <span className="faint small">{fmtChars(doc.content.length)} chars</span>
        <span className="spacer" />
        <label className="check small" title="Also include this document with every email request">
          <input type="checkbox" checked={doc.useWhenWriting} onChange={(e) => patch({ useWhenWriting: e.target.checked })} /> Send with every email
        </label>
        <select style={{ width: 200, height: 28, padding: "2px 8px", fontSize: 12.5 }} value={doc.kind} onChange={(e) => patch({ kind: e.target.value as DocKind })}>
          {DOC_KINDS.map((k) => (
            <option key={k} value={k}>
              {DOC_KIND_LABELS[k]}
            </option>
          ))}
        </select>
        <span className="faint small nowrap">{fmtDate(doc.createdAt)}</span>
        <button className="btn ghost sm" onClick={() => setOpen(!open)}>
          {open ? "Hide" : "View"}
        </button>
      </div>
      {open && !editing && (
        <>
          <pre>{doc.content}</pre>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn sm" onClick={() => { setDraft(doc); setEditing(true); }}>
              Edit
            </button>
            <button
              className="btn sm danger"
              onClick={async () => {
                if (!confirm("Delete this document?")) return;
                await api(url, { method: "DELETE" });
                await reload();
              }}
            >
              Delete
            </button>
            {doc.fileName && <span className="faint small">From {doc.fileName}</span>}
          </div>
        </>
      )}
      {open && editing && (
        <div className="stack" style={{ marginTop: 10 }}>
          <label className="field">
            <span>Title</span>
            <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </label>
          <label className="field">
            <span>Text</span>
            <AutoText minRows={8} value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} />
          </label>
          <div className="row">
            <button
              className="btn primary sm"
              onClick={async () => {
                await patch({ title: draft.title, content: draft.content });
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
