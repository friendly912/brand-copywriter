import "server-only";
import { DOC_KIND_LABELS, EMAIL_TYPE_LABELS, WRITING_DOCS_CHAR_LIMIT, type Brand, type BrandDoc, type BrandProfile, type Brief, type EmailType, type SourceEmail } from "../types";

// ---------------------------------------------------------------------------
// Generation. The system prompt is four blocks, ordered most-stable first so
// the prompt cache is reused across every email and section rewrite:
//   1. COPYWRITER_INSTRUCTIONS  - identical for every brand
//   2. brandBlock()             - changes only when the brand/profile changes
//   3. docsBlock()              - changes only when brand documents change
//   4. examplesBlock()          - changes only when the example set changes
// Nothing time- or request-specific may go into these blocks.
// ---------------------------------------------------------------------------

export const COPYWRITER_INSTRUCTIONS = `You are the in-house email copywriter for the brand described below. You write the words of marketing emails; a designer lays them out afterwards. You do not write HTML.

Your one job is to sound exactly like a real person from this brand, not like generic marketing copy. The brand profile summarises the voice, the brand documents state how the brand wants to sound and what it sells, and the example emails show the voice in practice. When the profile and the examples disagree, follow the examples, because they are real emails the brand sent. Explicit rules in a style guide count as hard rules. The hard rules override everything.

How to write:
- Match the examples' sentence length, rhythm, capitalisation, punctuation, emoji use and formatting habits. Use the brand's signature moves, but never copy whole sentences from the examples. Examples that come with a result (such as a click rate) performed well for this brand: lean on what they do.
- Avoid generic marketing phrasing ("elevate", "unlock", "look no further", "in today's fast-paced world", "we've got you covered") unless the brand's own emails use it. The copy should survive being read aloud without sounding machine-written.
- Facts: use only what the brief and the brand documents give. Product names, features and prices may come from the product information documents; offers, discounts, codes and deadlines only from the brief. If the email needs a fact you don't have, write a placeholder in square brackets such as [discount code] or [product name]. Never invent numbers, reviews, testimonials, guarantees or claims.
- Structure the body the way this brand structures this type of email (see the profile's structure and any examples of the same type). Use as many sections as the email needs, usually 2 to 5. Give each section a short stable snake_case key such as hero, body_1, products, offer, closing. If the brief sets a length, keep the whole body within it.
- Subject lines: write exactly 5, each taking a different angle, each paired with its own preview text. The preview text continues or complements its subject line and never repeats it. Each pair should earn the open. Respect the subject and preview length limits in the hard rules.
- Headline: the big line at the top of the email body. Subheadline only if this brand uses them.
- One main action per email: primary_cta is the main button. Any other buttons (such as per-product buttons) must lead to the same action rather than compete with it. If the brief names a CTA, use that wording or stay very close to it. CTAs are short and in the brand's CTA style.
- Design notes: 2 to 5 short notes for the designer, such as which palette colour suits the CTA button (name and hex), where an image works and what it could show. Keep them brief.
- Set ps and footer_line to null unless this brand's emails use them.

Before writing, look at how the examples of the same email type open, build and close, and write this email the same way.`;

export function brandBlock(brand: Brand, profile: BrandProfile | null): string {
  const r = brand.rules;
  const lines: string[] = [`# Brand: ${brand.name}`];
  if (brand.description.trim()) lines.push(brand.description.trim());
  if (brand.audience.trim()) lines.push(`Audience: ${brand.audience.trim()}`);
  if (brand.platform.trim()) lines.push(`These emails are sent with ${brand.platform.trim()}.`);

  lines.push("", "## Hard rules (always follow)");
  lines.push(`- Emoji: ${{ never: "never use emoji", sparingly: "at most one or two, only where this brand uses them", free: "use them as the examples do" }[r.emoji]}`);
  lines.push(`- Subject lines: at most ${r.subjectMaxChars} characters`);
  lines.push(`- Preview text: ${r.previewMinChars} to ${r.previewMaxChars} characters`);
  if (r.signOff.trim()) lines.push(`- Sign off as: ${r.signOff.trim()}`);
  if (r.bannedWords.length) lines.push(`- Never use these words or phrases: ${r.bannedWords.join(", ")}`);
  for (const o of r.other) if (o.trim()) lines.push(`- ${o.trim()}`);

  if (brand.palette.length) {
    lines.push("", "## Palette (for design notes)");
    for (const c of brand.palette) lines.push(`- ${c.name} ${c.hex} (${c.role})`);
  }

  lines.push("", "## Brand voice profile");
  if (profile) {
    lines.push(JSON.stringify(profile.profile, null, 2));
  } else {
    lines.push("No written profile yet. Work out the voice from the example emails.");
  }
  return lines.join("\n");
}

/**
 * Brand documents for writing requests, within a fixed character budget.
 * Returns the text and whether anything was cut (the UI tells the user).
 */
export function docsBlock(docs: BrandDoc[], limit = WRITING_DOCS_CHAR_LIMIT): { text: string; truncated: boolean } {
  const used = docs.filter((d) => d.useWhenWriting && d.content.trim());
  if (!used.length) return { text: "## Brand documents\nNone.", truncated: false };
  let left = limit;
  let truncated = false;
  const parts: string[] = [];
  for (const d of used) {
    if (left <= 0) {
      truncated = true;
      break;
    }
    let content = d.content.trim();
    if (content.length > left) {
      content = `${content.slice(0, left)}\n[… the rest of this document was left out to fit]`;
      truncated = true;
    }
    left -= content.length;
    parts.push(formatDoc(d, content));
  }
  return { text: ["## Brand documents", ...parts].join("\n\n"), truncated };
}

export function formatDoc(d: BrandDoc, content = d.content.trim()): string {
  return `<document kind="${DOC_KIND_LABELS[d.kind]}" title="${d.title.replace(/"/g, "'")}">\n${content}\n</document>`;
}

export function formatSource(s: SourceEmail): string {
  const head = [`Type: ${EMAIL_TYPE_LABELS[s.emailType]}`];
  if (s.note.trim()) head.push(`Result: ${s.note.trim()}`);
  if (s.subject) head.push(`Subject: ${s.subject}`);
  if (s.preview) head.push(`Preview: ${s.preview}`);
  const tag = s.favorite ? ' favorite="true"' : "";
  return `<example${tag}>\n${head.join("\n")}\n\n${s.body.trim()}\n</example>`;
}

export function examplesBlock(examples: SourceEmail[]): string {
  if (!examples.length) return "## Example emails\nNo example emails yet.";
  return [
    "## Example emails from this brand\nThese are real emails the brand sent. Favourites are the ones the brand considers most on-voice; a Result line says how an email performed.",
    ...examples.map(formatSource),
  ].join("\n\n");
}

export function briefMessage(brief: Brief): string {
  const f: [string, string][] = [
    ["Goal", brief.goal],
    ["Offer / key message", brief.offer],
    ["Products / features to feature", brief.products],
    ["Deadline / dates", brief.deadline],
    ["Audience / segment", brief.audience],
    ["Main CTA button", brief.targetCta],
    ["Length", brief.length],
    ["Must include", brief.mustInclude],
    ["Avoid", brief.avoid],
    ["Tone for this email", brief.toneNudge],
    ["Other notes", brief.notes],
  ];
  const body = f.filter(([, v]) => v.trim()).map(([k, v]) => `${k}: ${v.trim()}`);
  return [`Write a ${EMAIL_TYPE_LABELS[brief.emailType].toLowerCase()} email.`, "", ...(body.length ? body : ["(No further details. Write a strong, typical email of this type for this brand.)"])].join("\n");
}

export const BLOCK_DESCRIPTIONS: Record<string, string> = {
  subjects: "the 5 subject lines, each with its paired preview text",
  header: "the headline and subheadline",
  closing: "the primary CTA, P.S. and footer line",
};

export function regenerateMessage(opts: {
  brief: Brief;
  currentJson: string;
  blockLabel: string;
  instruction: string;
  locked: string[];
}): string {
  return [
    briefMessage(opts.brief),
    `Here is the current draft of this email (it may include the user's own edits, which are intentional):\n\`\`\`json\n${opts.currentJson}\n\`\`\``,
    [
      `Rewrite only ${opts.blockLabel}. Keep it consistent with the rest of the draft and in the brand's voice.`,
      opts.instruction.trim() ? `The user asks: ${opts.instruction.trim()}` : "Give a fresh alternative that is clearly different from the current version.",
      opts.locked.length ? `Do not contradict these parts the user has locked: ${opts.locked.join(", ")}.` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  ].join("\n\n");
}

// ---------------------------------------------------------------------------
// Profile extraction
// ---------------------------------------------------------------------------

export const PROFILE_INSTRUCTIONS = `You are a senior brand copy strategist. From a brand's real marketing emails, you write a voice profile specific enough that another copywriter could imitate the brand convincingly.

Guidelines:
- Describe what the brand actually does, not generic marketing advice. "Short sentences" is weak; "Sentences rarely pass 12 words; fragments like 'Zero fuss.' are common" is useful.
- Quote real phrases from the emails as evidence in signature_phrases, subject line examples, preview text examples and CTA examples.
- Separate consistent habits from one-offs. If emails disagree (for example some use emoji and some don't), say so and describe the typical case.
- For tone_by_email_type and structure.by_email_type, only include email types that appear in the emails.
- dos and donts should be concrete and checkable.
- Put anything the emails leave unclear, or that the brand owner should decide, into open_questions.
- Respect the hard rules the owner has set. They override what the emails show.
- Brand documents: a style guide says how the brand wants to sound, and its explicit rules belong in dos/donts. The emails show how it actually sounds. Where they conflict, describe what the emails do and raise the conflict in open_questions. Product information is context, not voice.
- Emails with a Result line performed well. Give their habits more weight.`;

export function profileRequestMessage(opts: {
  brand: Brand;
  sources: SourceEmail[];
  docs: BrandDoc[];
  omitted: number;
  current: BrandProfile | null;
  editNotes: string[];
}): string {
  const parts: string[] = [brandBlock(opts.brand, null).replace(/\n## Brand voice profile[\s\S]*$/, "")];

  if (opts.current) {
    parts.push(
      "## Current profile",
      "Update this profile rather than starting over. Keep what is still accurate and change what the emails and edits below show is wrong or missing.",
      JSON.stringify(opts.current.profile, null, 2),
    );
  }
  if (opts.editNotes.length) {
    parts.push(
      "## How the owner edited AI-written drafts before sending",
      "These edits are strong evidence of the voice the owner wants. Learn from them.",
      opts.editNotes.join("\n\n"),
    );
  }
  if (opts.docs.length) parts.push(`## Brand documents (${opts.docs.length})`, ...opts.docs.map((d) => formatDoc(d)));
  parts.push(`## The brand's emails (${opts.sources.length})`, ...opts.sources.map(formatSource));
  if (opts.omitted > 0) parts.push(`(${opts.omitted} older emails were left out to fit the request.)`);
  parts.push(opts.current ? "Write the updated voice profile." : "Write the voice profile.");
  return parts.join("\n\n");
}

// ---------------------------------------------------------------------------
// Ingestion
// ---------------------------------------------------------------------------

export const INGEST_INSTRUCTIONS = `You turn a marketing email (screenshot, pasted text or extracted HTML text) into clean copy for a copywriting reference library.

- Transcribe the words exactly as written. Do not rewrite, fix or summarise.
- Keep the structure with light Markdown: # for the main headline, ## for section headings, blank lines between blocks, "- " for lists, and [Button: text] for buttons.
- Leave out legal/footer boilerplate (unsubscribe, address, "view in browser", social links) and image alt text that isn't visible copy.
- subject and preview: fill them only if they are visible or clearly marked in the input; otherwise use empty strings.
- email_type: pick the closest type.`;

export function typeList(): string {
  return (Object.keys(EMAIL_TYPE_LABELS) as EmailType[]).map((t) => `${t} (${EMAIL_TYPE_LABELS[t]})`).join(", ");
}

// ---------------------------------------------------------------------------
// Self-review pass
// ---------------------------------------------------------------------------

export const REVIEW_CRITERIA = [
  "Voice: matches the brand's voice profile, documents and examples, not a generic marketing tone",
  "One clear action: a single main CTA, and any other buttons support it rather than compete",
  "Sounds human: would survive being read aloud to someone who doesn't know the brand without sounding like generic AI copy",
  "Opens: each subject line and preview text pairing is likely to earn an open, and the preview complements rather than repeats",
  "Facts: nothing invented; anything missing is a [placeholder]",
  "Rules: follows the hard rules and the brief (length, CTA, must-include, avoid)",
];

export function reviewMessage(opts: { brief: Brief; currentJson: string; lintNotes: string[]; locked: string[] }): string {
  return [
    briefMessage(opts.brief),
    `Here is a draft of this email. It may include the user's own edits, which are intentional:\n\`\`\`json\n${opts.currentJson}\n\`\`\``,
    [
      "Review the draft as the brand's most demanding editor. Check it against each criterion:",
      ...REVIEW_CRITERIA.map((c, i) => `${i + 1}. ${c}`),
    ].join("\n"),
    opts.lintNotes.length ? `An automatic check also flagged:\n${opts.lintNotes.map((n) => `- ${n}`).join("\n")}` : "",
    [
      "Then return the revised draft:",
      "- Fix only what fails. Leave passing parts exactly as they are, word for word, including the user's edits.",
      "- If everything passes, return the draft unchanged and set changed to false.",
      "- Keep the same section keys and the same number of subject lines.",
      opts.locked.length ? `- Do not change these locked parts at all: ${opts.locked.join(", ")}.` : "",
      "- In checks, give one entry per criterion, in order, with a short, specific note.",
    ]
      .filter(Boolean)
      .join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
}
