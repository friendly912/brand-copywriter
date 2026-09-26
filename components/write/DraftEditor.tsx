"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, copyText, fmtUsd, streamJob, type JobProgress } from "@/lib/client";
import { exportCopy } from "@/lib/copy";
import { lintCopy } from "@/lib/lint";
import type { Brand, BrandProfile, CopySection, Draft, EmailCopy, LintIssue } from "@/lib/types";
import { AutoText, Counter, Progress, useToast } from "../ui";

const SUBJECT_CHIPS = ["More urgent", "More curiosity", "Shorter", "More playful", "More personal"];
const SECTION_CHIPS = ["Shorter", "Longer", "More playful", "More benefit-focused", "Simpler words", "Punchier"];

/** Which rewritable block a lint issue belongs to. */
function blockOf(issue: LintIssue, copy: EmailCopy): string | null {
  const w = issue.where;
  if (/^(Subject|Preview) \d+$/.test(w)) return "subjects";
  if (w === "Headline" || w === "Subheadline") return "header";
  if (w === "Primary CTA" || w === "P.S." || w === "Footer line" || w === "Sign-off") return "closing";
  const sec = copy.sections.find((s) => w.startsWith(`${s.key} `));
  return sec ? `section:${sec.key}` : null;
}

export function DraftEditor({
  draft,
  brand,
  profile,
  onDraft,
  busy,
}: {
  draft: Draft;
  brand: Brand;
  profile: BrandProfile | null;
  onDraft: (d: Draft) => void;
  busy: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [current, setCurrent] = useState<EmailCopy>(draft.current);
  const [chosen, setChosen] = useState(draft.chosenSubject);
  const [locked, setLocked] = useState<string[]>(draft.locked);
  const [regen, setRegen] = useState<{ block: string; progress: JobProgress } | null>(null);
  const [openBox, setOpenBox] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [error, setError] = useState("");
  const [suggestRefresh, setSuggestRefresh] = useState(false);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");
  const abort = useRef<AbortController | null>(null);
  const first = useRef(true);

  const isFinal = draft.status === "final";
  const readOnly = isFinal || busy || !!regen;
  const issues = useMemo(() => lintCopy(current, brand, profile), [current, brand, profile]);
  const cost = draft.usage.reduce((n, u) => n + u.costUsd, 0);

  // Autosave edits, subject choice and locks shortly after the user stops typing.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (isFinal) return;
    setSaving("saving");
    const t = setTimeout(async () => {
      try {
        const d = await api<Draft>(`/api/drafts/${draft.id}`, { method: "PUT", json: { current, chosenSubject: chosen, locked } });
        onDraft(d);
        setSaving("saved");
      } catch (e) {
        setError((e as Error).message);
        setSaving("idle");
      }
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, chosen, locked]);

  async function rewrite(block: string, instr: string) {
    setError("");
    setOpenBox(null);
    setInstruction("");
    setRegen({ block, progress: { phase: "Rewriting…", chars: 0 } });
    abort.current = new AbortController();
    try {
      const d = await streamJob<Draft>(
        `/api/drafts/${draft.id}/regenerate`,
        { block, instruction: instr, current },
        (p) => setRegen({ block, progress: p }),
        abort.current.signal,
      );
      onDraft(d); // remounts this editor with the new copy
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError(e instanceof ApiError ? e.message : String(e));
      setRegen(null);
    }
  }

  async function markFinal() {
    try {
      const res = await api<{ draft: Draft; suggestRefresh: boolean }>(`/api/drafts/${draft.id}/final`, {
        method: "POST",
        json: { current, chosenSubject: chosen },
      });
      toast.show("Marked final and added to the brand's examples");
      setSuggestRefresh(res.suggestRefresh);
      onDraft(res.draft);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function reopen() {
    const res = await api<{ draft: Draft }>(`/api/drafts/${draft.id}/final`, { method: "DELETE" });
    onDraft(res.draft);
  }

  async function copyAll(format: "text" | "markdown") {
    await copyText(exportCopy(current, chosen, format));
    toast.show(format === "text" ? "Copied as plain text" : "Copied as Markdown");
  }

  const toggleLock = (k: string) => setLocked(locked.includes(k) ? locked.filter((x) => x !== k) : [...locked, k]);
  const setSection = (i: number, patch: Partial<CopySection>) =>
    setCurrent({ ...current, sections: current.sections.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  const blockProps = (k: string, chips: string[]) => ({
    k,
    locked: locked.includes(k),
    readOnly,
    isFinal,
    regen: regen?.block === k ? regen.progress : null,
    open: openBox === k,
    chips,
    instruction,
    setInstruction,
    onOpen: () => {
      setOpenBox(openBox === k ? null : k);
      setInstruction("");
    },
    onLock: () => toggleLock(k),
    onRewrite: (instr: string) => rewrite(k, instr),
    onCancel: () => abort.current?.abort(),
  });

  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");

  return (
    <div className="stack" style={{ gap: 14 }}>
      {toast.node}
      <div className="toolbar">
        {isFinal ? <span className="badge ok">Final</span> : <span className="badge">Draft</span>}
        <span className="small faint">
          {draft.model} · {fmtUsd(cost)}
          {saving === "saving" ? " · saving…" : saving === "saved" ? " · saved" : ""}
        </span>
        <span className="spacer" />
        <button className="btn sm" onClick={() => copyAll("text")}>
          Copy text
        </button>
        <button className="btn sm" onClick={() => copyAll("markdown")}>
          Copy Markdown
        </button>
        {isFinal ? (
          <button className="btn sm" onClick={reopen}>
            Reopen for editing
          </button>
        ) : (
          <button className="btn primary sm" disabled={readOnly} onClick={markFinal} title="Saves this email as an example so future emails learn from it">
            ✓ Mark final
          </button>
        )}
        <button
          className="btn ghost sm"
          onClick={async () => {
            if (!confirm("Delete this draft?")) return;
            if (isFinal) await api(`/api/drafts/${draft.id}/final`, { method: "DELETE" });
            await api(`/api/drafts/${draft.id}`, { method: "DELETE" });
            router.push(`/brands/${brand.id}/write`);
          }}
        >
          Delete
        </button>
      </div>

      {error && <div className="banner err">{error}</div>}
      {isFinal && (
        <div className="banner ok">
          Final. This email is now one of {brand.name}'s examples. Reopen it to make more changes.
          {suggestRefresh && (
            <>
              {" "}
              Several emails have been finalised since the profile was made: <Link href={`/brands/${brand.id}?tab=profile`}>refresh the voice profile</Link> to learn from your edits.
            </>
          )}
        </div>
      )}

      {issues.length > 0 && (
        <div className={`banner ${errors.length ? "err" : "warn"} lint`}>
          <strong>
            {errors.length ? `${errors.length} rule break${errors.length === 1 ? "" : "s"}` : ""}
            {errors.length && warnings.length ? ", " : ""}
            {warnings.length ? `${warnings.length} thing${warnings.length === 1 ? "" : "s"} to check` : ""}
          </strong>
          <ul>
            {[...errors, ...warnings].slice(0, 12).map((iss, i) => {
              const b = blockOf(iss, current);
              return (
                <li key={i}>
                  <span className={`badge ${iss.level === "error" ? "err" : "warn"}`}>{iss.where}</span>
                  <span>{iss.message}</span>
                  {b && !readOnly && !locked.includes(b) && !iss.message.startsWith("Placeholder") && (
                    <button className="btn ghost sm" onClick={() => rewrite(b, `Fix this problem: ${iss.where}: ${iss.message}. Keep everything else as close as possible.`)}>
                      Fix with AI
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Subject lines */}
      <Block title="Subject lines & preview text" {...blockProps("subjects", SUBJECT_CHIPS)} copy={() => {
        const s = current.subject_lines[chosen];
        return s ? `${s.text}\n${s.preview}` : "";
      }}>
        {current.subject_lines.map((s, i) => (
          <div key={i} className="subject-row">
            <input type="radio" name="subject" checked={chosen === i} onChange={() => setChosen(i)} style={{ marginTop: 10 }} disabled={isFinal} title="Use this one" />
            <div className="inputs">
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <input
                  className="subj"
                  readOnly={readOnly}
                  value={s.text}
                  onChange={(e) => setCurrent({ ...current, subject_lines: current.subject_lines.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })}
                />
                <Counter text={s.text} max={brand.rules.subjectMaxChars} />
              </div>
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <input
                  readOnly={readOnly}
                  value={s.preview}
                  onChange={(e) => setCurrent({ ...current, subject_lines: current.subject_lines.map((x, j) => (j === i ? { ...x, preview: e.target.value } : x)) })}
                />
                <Counter text={s.preview} max={brand.rules.previewMaxChars} min={brand.rules.previewMinChars} />
              </div>
              <span className="angle">{s.angle}</span>
            </div>
          </div>
        ))}
      </Block>

      {/* Headline */}
      <Block title="Headline" {...blockProps("header", SECTION_CHIPS)} copy={() => [current.headline, current.subheadline].filter(Boolean).join("\n")}>
        <div className="stack tight">
          <input className="headline" readOnly={readOnly} value={current.headline} onChange={(e) => setCurrent({ ...current, headline: e.target.value })} />
          <input
            readOnly={readOnly}
            placeholder="Subheadline (optional)"
            value={current.subheadline ?? ""}
            onChange={(e) => setCurrent({ ...current, subheadline: e.target.value || null })}
          />
        </div>
      </Block>

      {/* Body sections */}
      {current.sections.map((s, i) => (
        <Block
          key={s.key}
          title={s.key.replace(/_/g, " ")}
          badge={s.kind.replace(/_/g, " ")}
          {...blockProps(`section:${s.key}`, SECTION_CHIPS)}
          copy={() =>
            [s.heading, s.body, ...(s.items ?? []).flatMap((it) => [it.title, it.copy, it.cta]), s.cta].filter(Boolean).join("\n\n")
          }
        >
          <div className="stack tight">
            <input readOnly={readOnly} placeholder="Section heading (optional)" value={s.heading ?? ""} onChange={(e) => setSection(i, { heading: e.target.value || null })} style={{ fontWeight: 600 }} />
            <AutoText readOnly={readOnly} minRows={2} value={s.body} onChange={(e) => setSection(i, { body: e.target.value })} />
            {s.items && s.items.length > 0 && (
              <div className="item-grid">
                {s.items.map((it, j) => {
                  const setItem = (patch: Partial<typeof it>) => setSection(i, { items: s.items!.map((x, k) => (k === j ? { ...x, ...patch } : x)) });
                  return (
                    <div key={j} className="stack tight">
                      <input readOnly={readOnly} value={it.title} onChange={(e) => setItem({ title: e.target.value })} style={{ fontWeight: 600 }} />
                      <AutoText readOnly={readOnly} minRows={1} value={it.copy} onChange={(e) => setItem({ copy: e.target.value })} />
                      {it.cta !== null && (
                        <div className="row">
                          <span className="small faint">Button</span>
                          <input readOnly={readOnly} value={it.cta} onChange={(e) => setItem({ cta: e.target.value })} style={{ width: 220 }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {s.cta !== null && (
              <div className="row">
                <span className="small faint">Button</span>
                <input readOnly={readOnly} value={s.cta} onChange={(e) => setSection(i, { cta: e.target.value })} style={{ width: 260 }} />
              </div>
            )}
          </div>
        </Block>
      ))}

      {/* Closing */}
      <Block title="CTA & closing" {...blockProps("closing", SECTION_CHIPS)} copy={() => [current.primary_cta, current.ps, current.footer_line].filter(Boolean).join("\n\n")}>
        <div className="stack tight">
          <label className="field">
            <span>Main button</span>
            <input readOnly={readOnly} value={current.primary_cta} onChange={(e) => setCurrent({ ...current, primary_cta: e.target.value })} style={{ fontWeight: 600, maxWidth: 360 }} />
          </label>
          <label className="field">
            <span>P.S.</span>
            <AutoText readOnly={readOnly} minRows={1} placeholder="None" value={current.ps ?? ""} onChange={(e) => setCurrent({ ...current, ps: e.target.value || null })} />
          </label>
          <label className="field">
            <span>Footer line</span>
            <input readOnly={readOnly} placeholder="None" value={current.footer_line ?? ""} onChange={(e) => setCurrent({ ...current, footer_line: e.target.value || null })} />
          </label>
        </div>
      </Block>

      {/* Design notes */}
      {current.design_notes.length > 0 && (
        <div className="block">
          <div className="block-head">
            <h3>Design notes</h3>
          </div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {current.design_notes.map((n, i) => {
              const hexes = n.match(/#[0-9a-f]{6}\b/gi) ?? [];
              return (
                <li key={i} style={{ margin: "3px 0" }}>
                  {hexes.map((h, j) => (
                    <span key={j} className="swatch" style={{ background: h, marginRight: 6 }} />
                  ))}
                  {n}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function Block(props: {
  title: string;
  badge?: string;
  k: string;
  locked: boolean;
  readOnly: boolean;
  isFinal: boolean;
  regen: JobProgress | null;
  open: boolean;
  chips: string[];
  instruction: string;
  setInstruction: (s: string) => void;
  onOpen: () => void;
  onLock: () => void;
  onRewrite: (instruction: string) => void;
  onCancel: () => void;
  copy: () => string;
  children: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={`block ${props.locked ? "locked" : ""}`}>
      <div className="block-head">
        <h3>{props.title}</h3>
        {props.badge && <span className="badge">{props.badge}</span>}
        {props.locked && <span className="badge accent">Locked</span>}
        <div className="block-actions">
          <button
            className="btn ghost sm"
            onClick={async () => {
              await copyText(props.copy());
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
          {!props.isFinal && (
            <>
              <button className={`btn sm ${props.locked ? "on" : "ghost"}`} disabled={props.readOnly} onClick={props.onLock} title="Locked blocks are kept when the whole email is rewritten">
                {props.locked ? "Unlock" : "Lock"}
              </button>
              <button className="btn sm" disabled={props.readOnly || props.locked} onClick={props.onOpen}>
                ↻ Rewrite
              </button>
            </>
          )}
        </div>
      </div>
      {props.regen ? (
        <div style={{ padding: "8px 0" }}>
          <Progress progress={props.regen} onCancel={props.onCancel} />
        </div>
      ) : (
        props.children
      )}
      {props.open && !props.regen && (
        <form
          className="regen-box"
          onSubmit={(e) => {
            e.preventDefault();
            props.onRewrite(props.instruction);
          }}
        >
          <input autoFocus placeholder="How should it change? (optional)" value={props.instruction} onChange={(e) => props.setInstruction(e.target.value)} />
          <div className="row">
            {props.chips.map((c) => (
              <button key={c} type="button" className="btn sm" onClick={() => props.onRewrite(c)}>
                {c}
              </button>
            ))}
            <span className="spacer" />
            <button type="button" className="btn ghost sm" onClick={props.onOpen}>
              Cancel
            </button>
            <button className="btn primary sm">Rewrite</button>
          </div>
        </form>
      )}
    </div>
  );
}
