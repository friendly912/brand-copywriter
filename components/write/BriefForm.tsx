"use client";

import { EMAIL_TYPES, EMAIL_TYPE_LABELS, LENGTH_OPTIONS, type Brief, type EmailType } from "@/lib/types";

const FIELDS: { key: keyof Omit<Brief, "emailType" | "length">; label: string; placeholder: string; rows?: number }[] = [
  { key: "goal", label: "Goal", placeholder: "e.g. Drive sales of the summer collection before stock runs out", rows: 2 },
  { key: "offer", label: "Offer / key message", placeholder: "e.g. 20% off everything, code SUMMER20", rows: 2 },
  { key: "products", label: "Products to feature", placeholder: "e.g. Linen shirt ($49), Straw hat ($29), Canvas tote", rows: 2 },
  { key: "deadline", label: "Deadline / dates", placeholder: "e.g. Ends Sunday midnight" },
  { key: "targetCta", label: "Main CTA button", placeholder: "e.g. Shop the sale" },
  { key: "audience", label: "Audience / segment", placeholder: "e.g. Past buyers who haven't ordered in 90 days" },
  { key: "mustInclude", label: "Must include", placeholder: "e.g. Free shipping over $50" },
  { key: "avoid", label: "Avoid", placeholder: "e.g. Don't mention the old collection" },
  { key: "toneNudge", label: "Tone for this email", placeholder: "e.g. Extra playful, it's the 4th of July" },
  { key: "notes", label: "Anything else", placeholder: "Links, context, ideas…", rows: 2 },
];

export function BriefForm({
  brief,
  onChange,
  disabled,
  actions,
}: {
  brief: Brief;
  onChange: (b: Brief) => void;
  disabled?: boolean;
  actions: React.ReactNode;
}) {
  return (
    <div className="stack">
      <h2>Brief</h2>
      <label className="field">
        <span>Email type</span>
        <select disabled={disabled} value={brief.emailType} onChange={(e) => onChange({ ...brief, emailType: e.target.value as EmailType })}>
          {EMAIL_TYPES.map((t) => (
            <option key={t} value={t}>
              {EMAIL_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Length</span>
        <select disabled={disabled} value={brief.length} onChange={(e) => onChange({ ...brief, length: e.target.value })}>
          {LENGTH_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
          {brief.length && !LENGTH_OPTIONS.some((o) => o.value === brief.length) && <option value={brief.length}>{brief.length}</option>}
        </select>
      </label>
      {FIELDS.map((f) => (
        <label key={f.key} className="field">
          <span>{f.label}</span>
          {f.rows ? (
            <textarea disabled={disabled} rows={f.rows} style={{ minHeight: 0 }} value={brief[f.key]} placeholder={f.placeholder} onChange={(e) => onChange({ ...brief, [f.key]: e.target.value })} />
          ) : (
            <input disabled={disabled} value={brief[f.key]} placeholder={f.placeholder} onChange={(e) => onChange({ ...brief, [f.key]: e.target.value })} />
          )}
        </label>
      ))}
      <p className="small faint">All fields are optional. Facts not given here come back as [placeholders], never invented.</p>
      {actions}
    </div>
  );
}
