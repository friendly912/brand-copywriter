import type { EmailCopy } from "./types";

/** Every piece of text in an email, labelled by where it sits. Used by lint, diffs and export. */
export function flattenCopy(c: EmailCopy): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  const push = (where: string, text: string | null | undefined) => {
    if (text && text.trim()) out.push({ where, text });
  };
  c.subject_lines.forEach((s, i) => {
    push(`Subject ${i + 1}`, s.text);
    push(`Preview ${i + 1}`, s.preview);
  });
  push("Headline", c.headline);
  push("Subheadline", c.subheadline);
  for (const s of c.sections) {
    push(`${s.key} heading`, s.heading);
    push(`${s.key} body`, s.body);
    s.items?.forEach((it, i) => {
      push(`${s.key} item ${i + 1} title`, it.title);
      push(`${s.key} item ${i + 1} copy`, it.copy);
      push(`${s.key} item ${i + 1} CTA`, it.cta);
    });
    push(`${s.key} CTA`, s.cta);
  }
  push("Primary CTA", c.primary_cta);
  push("P.S.", c.ps);
  push("Footer line", c.footer_line);
  return out;
}

/** Human-readable before/after notes for every field the user changed. */
export function describeEdits(generated: EmailCopy, final: EmailCopy, chosenSubject: number): string[] {
  const before = new Map(flattenCopy(generated).map((x) => [x.where, x.text]));
  const after = new Map(flattenCopy(final).map((x) => [x.where, x.text]));
  const notes: string[] = [];
  for (const where of new Set([...before.keys(), ...after.keys()])) {
    // Only the chosen subject/preview matters; the unused alternatives are noise.
    const m = /^(Subject|Preview) (\d+)$/.exec(where);
    if (m && Number(m[2]) - 1 !== chosenSubject) continue;
    const a = before.get(where) ?? "";
    const b = after.get(where) ?? "";
    if (a.trim() === b.trim()) continue;
    notes.push(`${where}\n  AI wrote: ${a || "(nothing)"}\n  Owner changed to: ${b || "(removed)"}`);
  }
  return notes;
}

/** Plain text or Markdown version of the email, ready to paste into an email platform or doc. */
export function exportCopy(c: EmailCopy, chosenSubject: number, format: "text" | "markdown"): string {
  const md = format === "markdown";
  const subj = c.subject_lines[chosenSubject] ?? c.subject_lines[0];
  const lines: string[] = [];
  if (subj) {
    lines.push(md ? `**Subject:** ${subj.text}` : `Subject: ${subj.text}`);
    lines.push(md ? `**Preview:** ${subj.preview}` : `Preview: ${subj.preview}`);
    lines.push("");
  }
  lines.push(md ? `# ${c.headline}` : c.headline.toUpperCase());
  if (c.subheadline) lines.push(md ? `### ${c.subheadline}` : c.subheadline);
  for (const s of c.sections) {
    lines.push("");
    if (s.heading) lines.push(md ? `## ${s.heading}` : s.heading);
    lines.push(s.body);
    for (const it of s.items ?? []) {
      lines.push("");
      lines.push(md ? `**${it.title}**` : it.title);
      lines.push(it.copy);
      if (it.cta) lines.push(md ? `[${it.cta}]` : `[ ${it.cta} ]`);
    }
    if (s.cta) lines.push("", md ? `[${s.cta}]` : `[ ${s.cta} ]`);
  }
  lines.push("", md ? `**[${c.primary_cta}]**` : `[ ${c.primary_cta} ]`);
  if (c.ps) lines.push("", c.ps.startsWith("P.S") ? c.ps : `P.S. ${c.ps}`);
  if (c.footer_line) lines.push("", c.footer_line);
  return lines.join("\n");
}

/** Converts a finished draft into the text stored as a new example email. */
export function copyToExampleBody(c: EmailCopy): string {
  const lines: string[] = [`# ${c.headline}`];
  if (c.subheadline) lines.push(c.subheadline);
  for (const s of c.sections) {
    lines.push("");
    if (s.heading) lines.push(`## ${s.heading}`);
    lines.push(s.body);
    for (const it of s.items ?? []) {
      lines.push("", `- ${it.title}: ${it.copy}${it.cta ? ` [Button: ${it.cta}]` : ""}`);
    }
    if (s.cta) lines.push(`[Button: ${s.cta}]`);
  }
  lines.push("", `[Button: ${c.primary_cta}]`);
  if (c.ps) lines.push("", c.ps);
  if (c.footer_line) lines.push("", c.footer_line);
  return lines.join("\n");
}
