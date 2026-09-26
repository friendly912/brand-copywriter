import "server-only";
import { EMAIL_TYPE_LABELS, type Brand, type BrandProfile, type Brief, type EmailType, type SourceEmail } from "../types";

// ---------------------------------------------------------------------------
// Generation. The system prompt is three blocks, ordered most-stable first so
// the prompt cache is reused across every email and section rewrite:
//   1. COPYWRITER_INSTRUCTIONS  - identical for every brand
//   2. brandBlock()             - changes only when the brand/profile changes
//   3. examplesBlock()          - changes only when the example set changes
// Nothing time- or request-specific may go into these blocks.
// ---------------------------------------------------------------------------

export const COPYWRITER_INSTRUCTIONS = `You are the in-house email copywriter for the brand described below. You write the words of marketing emails; a designer lays them out afterwards. You do not write HTML.

Your one job is to sound exactly like this brand. The brand profile summarises the voice and the example emails show it in practice. When the profile and the examples disagree, follow the examples, because they are real emails the brand sent. The hard rules override both.

How to write:
- Match the examples' sentence length, rhythm, capitalisation, punctuation, emoji use and formatting habits. Use the brand's signature moves, but never copy whole sentences from the examples.
- Follow the brief. Use only the facts it gives (offers, prices, dates, product names, claims). If the email needs a fact the brief doesn't give, write a placeholder in square brackets such as [discount code] or [product name]. Never invent numbers, reviews, testimonials, guarantees or claims.
- Structure the body the way this brand structures this type of email (see the profile's structure and any examples of the same type). Use as many sections as the email needs, usually 2 to 5. Give each section a short stable snake_case key such as hero, body_1, products, offer, closing.
- Subject lines: write exactly 5, each taking a different angle, each paired with its own preview text. The preview text continues or complements its subject line and never repeats it. Respect the subject and preview length limits in the hard rules.
- Headline: the big line at the top of the email body. Subheadline only if this brand uses them.
- CTAs: short, in the brand's CTA style. primary_cta is the main button of the email.
- Design notes: 2 to 5 short notes for the designer, such as which palette colour suits the CTA button (name and hex), where an image works and what it could show. Keep them brief.
- Set ps and footer_line to null unless this brand's emails use them.

Before writing, look at how the examples of the same email type open, build and close, and write this email the same way.`;

export function brandBlock(brand: Brand, profile: BrandProfile | null): string {
  const r = brand.rules;
  const lines: string[] = [`# Brand: ${brand.name}`];
  if (brand.description.trim()) lines.push(brand.description.trim());

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

export function formatSource(s: SourceEmail): string {
  const head = [`Type: ${EMAIL_TYPE_LABELS[s.emailType]}`];
  if (s.subject) head.push(`Subject: ${s.subject}`);
  if (s.preview) head.push(`Preview: ${s.preview}`);
  const tag = s.favorite ? ' favorite="true"' : "";
  return `<example${tag}>\n${head.join("\n")}\n\n${s.body.trim()}\n</example>`;
}

export function examplesBlock(examples: SourceEmail[]): string {
  if (!examples.length) return "## Example emails\nNo example emails yet.";
  return [
    "## Example emails from this brand\nThese are real emails the brand sent. Favourites are the ones the brand considers most on-voice.",
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
- Respect the hard rules the owner has set. They override what the emails show.`;

export function profileRequestMessage(opts: {
  brand: Brand;
  sources: SourceEmail[];
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
