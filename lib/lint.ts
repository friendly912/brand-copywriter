import { flattenCopy } from "./copy";
import type { Brand, BrandProfile, EmailCopy, LintIssue } from "./types";

const EMOJI = /\p{Extended_Pictographic}/u;
const PLACEHOLDER = /\[[^\]]{2,40}\]/;

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsPhrase(text: string, phrase: string) {
  const p = phrase.trim();
  if (!p) return false;
  // Word boundaries only where the phrase starts/ends with a word character.
  const start = /^\w/.test(p) ? "\\b" : "";
  const end = /\w$/.test(p) ? "\\b" : "";
  return new RegExp(`${start}${escapeRegExp(p)}${end}`, "i").test(text);
}

/** Deterministic checks that don't depend on the model getting the prompt right. */
export function lintCopy(copy: EmailCopy, brand: Brand, profile: BrandProfile | null): LintIssue[] {
  const issues: LintIssue[] = [];
  const r = brand.rules;
  const fields = flattenCopy(copy);

  for (const { where, text } of fields) {
    for (const w of r.bannedWords) {
      if (containsPhrase(text, w)) issues.push({ level: "error", where, message: `Uses banned word "${w}"` });
    }
    for (const w of profile?.profile.vocabulary.avoid_words ?? []) {
      if (containsPhrase(text, w)) issues.push({ level: "warning", where, message: `Uses "${w}", which the profile says to avoid` });
    }
    if (r.emoji === "never" && EMOJI.test(text)) issues.push({ level: "error", where, message: "Contains emoji (brand rule: never)" });
    const ph = PLACEHOLDER.exec(text);
    if (ph && !/^\[(Button|button):/.test(ph[0])) {
      issues.push({ level: "warning", where, message: `Placeholder to fill in: ${ph[0]}` });
    }
  }

  if (r.emoji === "sparingly") {
    const count = fields.reduce((n, f) => n + (f.text.match(/\p{Extended_Pictographic}/gu)?.length ?? 0), 0);
    if (count > 3) issues.push({ level: "warning", where: "Whole email", message: `${count} emoji used (brand rule: sparingly)` });
  }

  copy.subject_lines.forEach((s, i) => {
    const len = [...s.text].length;
    if (len > r.subjectMaxChars) issues.push({ level: "warning", where: `Subject ${i + 1}`, message: `${len} characters (max ${r.subjectMaxChars})` });
    const plen = [...s.preview].length;
    if (plen > r.previewMaxChars || plen < r.previewMinChars) {
      issues.push({ level: "warning", where: `Preview ${i + 1}`, message: `${plen} characters (aim for ${r.previewMinChars}–${r.previewMaxChars})` });
    }
  });

  if (r.signOff.trim()) {
    const tail = [copy.sections.at(-1)?.body, copy.ps, copy.footer_line].filter(Boolean).join("\n");
    if (!containsPhrase(tail, r.signOff)) {
      issues.push({ level: "warning", where: "Sign-off", message: `Expected sign-off "${r.signOff}" near the end` });
    }
  }

  return issues;
}
