import "server-only";
import { convert } from "html-to-text";
import PostalMime from "postal-mime";
import { z } from "zod";
import { EMAIL_TYPES, type EmailType } from "../types";
import { runStructured } from "./client";
import { INGEST_INSTRUCTIONS, typeList } from "./prompts";

export interface IngestedEmail {
  subject: string;
  preview: string;
  body: string;
  emailType: EmailType | null;
}

const Extracted = z.object({
  subject: z.string(),
  preview: z.string(),
  body: z.string(),
  email_type: z.string().describe(`One of: ${EMAIL_TYPES.join(", ")}`),
});

/** Maps whatever type name came back onto a known type. */
function toEmailType(t: string): EmailType {
  const norm = t.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return (EMAIL_TYPES as readonly string[]).includes(norm) ? (norm as EmailType) : "other";
}

const IMAGE_TYPES: Record<string, "image/png" | "image/jpeg" | "image/gif" | "image/webp"> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

const BOILERPLATE =
  /unsubscribe|view (this|it|email)? ?in (your |a )?browser|manage (your )?(email )?preferences|privacy policy|all rights reserved|you('| a)re receiving this|update your preferences|no longer wish to receive/i;

export function isImage(fileName: string) {
  return (fileName.split(".").pop()?.toLowerCase() ?? "") in IMAGE_TYPES;
}

export function htmlToCopy(html: string): { subject: string; preview: string; body: string } {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
  // Preheaders are usually the first hidden element in the body.
  const pre =
    /<(?:div|span|p)[^>]*(?:class="[^"]*preheader[^"]*"|style="[^"]*display:\s*none[^"]*")[^>]*>([\s\S]*?)<\/(?:div|span|p)>/i.exec(html)?.[1] ??
    "";
  const preview = convert(pre, { wordwrap: false }).replace(/[​-‍͏­﻿  \s]+/g, " ").trim();

  // html-to-text has no heading prefixes, so mark headings before converting.
  const marked = html.replace(/<h([1-3])(\s[^>]*)?>/gi, (tag, level: string) => `${tag}${"#".repeat(Number(level))} `);
  const text = convert(marked, {
    wordwrap: false,
    selectors: [
      { selector: "a", options: { ignoreHref: true } },
      { selector: "img", format: "skip" },
      { selector: "title", format: "skip" },
      { selector: "style", format: "skip" },
      { selector: "h1", options: { uppercase: false } },
      { selector: "h2", options: { uppercase: false } },
      { selector: "h3", options: { uppercase: false } },
      { selector: "table", format: "dataTable", options: { uppercaseHeaderCells: false } },
      { selector: "[style*='display:none']", format: "skip" },
      { selector: "[style*='display: none']", format: "skip" },
      { selector: ".preheader", format: "skip" },
    ],
  });

  const body = text
    .split("\n")
    .map((l) => l.replace(/[​-‍͏­﻿]/g, "").trimEnd())
    .filter((l) => !BOILERPLATE.test(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { subject: title, preview, body };
}

/** Pasted text may start with "Subject:" / "Preview:" lines. */
export function parsePastedText(text: string): { subject: string; preview: string; body: string } {
  let subject = "";
  let preview = "";
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  while (lines.length) {
    const m = /^\s*(subject(?: line)?|preview(?: text)?|pre-?header|pretext)\s*[:：]\s*(.*)$/i.exec(lines[0]);
    if (!m) break;
    if (m[1].toLowerCase().startsWith("subject")) subject = m[2].trim();
    else preview = m[2].trim();
    lines.shift();
  }
  return { subject, preview, body: lines.join("\n").trim() };
}

export async function emlToCopy(data: Buffer) {
  const email = await PostalMime.parse(data);
  const fromHtml = email.html ? htmlToCopy(email.html) : null;
  return {
    subject: email.subject ?? fromHtml?.subject ?? "",
    preview: fromHtml?.preview ?? "",
    body: fromHtml?.body || (email.text ?? "").trim(),
  };
}

/** Screenshot → transcribed copy + detected type, via Claude vision. */
export async function imageToCopy(fileName: string, data: Buffer): Promise<IngestedEmail> {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const media = IMAGE_TYPES[ext];
  if (!media) throw new Error(`Unsupported image type: .${ext}`);
  const { data: out } = await runStructured({
    schema: Extracted,
    effort: "low",
    maxTokens: 16000,
    system: [{ type: "text", text: `${INGEST_INSTRUCTIONS}\n\nEmail types: ${typeList()}` }],
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: media, data: data.toString("base64") } },
          { type: "text", text: "Transcribe this email." },
        ],
      },
    ],
  });
  return { subject: out.subject, preview: out.preview, body: out.body, emailType: toEmailType(out.email_type) };
}

/** Guesses the email type of already-extracted text (cheap, low effort). */
export async function detectType(copy: { subject: string; body: string }): Promise<EmailType> {
  const { data } = await runStructured({
    schema: z.object({ email_type: z.string().describe(`One of: ${EMAIL_TYPES.join(", ")}`) }),
    effort: "low",
    maxTokens: 4000,
    system: [{ type: "text", text: `Classify the marketing email into one type. Types: ${typeList()}` }],
    messages: [{ role: "user", content: `Subject: ${copy.subject}\n\n${copy.body.slice(0, 6000)}` }],
  });
  return toEmailType(data.email_type);
}
