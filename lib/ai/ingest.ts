import "server-only";
import { convert } from "html-to-text";
import PostalMime from "postal-mime";
import { z } from "zod";
import { EMAIL_TYPES, type EmailType } from "../types";
import { runStructured, runText } from "./client";
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
  // Decode entities (&amp; etc.) in the title the same way as the body.
  const rawTitle = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "";
  const title = convert(rawTitle, { wordwrap: false }).replace(/\s+/g, " ").trim();
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
      // Email HTML uses tables for layout, not data: treat every cell as a plain block
      // (a data-table format would wrap text at 60 characters and pad columns).
      { selector: "table", format: "block" },
      { selector: "td", format: "block" },
      { selector: "th", format: "block" },
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

// ---------------------------------------------------------------------------
// Brand documents (style guides, product info): PDF, Word, HTML, text, images
// ---------------------------------------------------------------------------

export const DOC_EXTENSIONS = ["pdf", "docx", "txt", "md", "html", "htm", "png", "jpg", "jpeg", "webp", "gif"];

const TRANSCRIBE_DOC = `Transcribe all the text of this brand document faithfully as clean Markdown (headings, lists, tables). Do not summarise, rewrite or add commentary. Skip page numbers and repeated headers/footers. Describe nothing visual unless it contains words.`;

/** Extracts readable text from an uploaded document. Scanned PDFs and images go through Claude. */
export async function docToText(fileName: string, data: Buffer): Promise<string> {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";

  if (ext === "pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(data));
    const { text, totalPages } = await extractText(pdf, { mergePages: true });
    const clean = unwrapLines(tidy(text));
    // Almost no text per page means a scanned or image-only PDF: let Claude read it.
    if (clean.length >= 100 * Math.min(totalPages, 3)) return clean;
    const { text: read } = await runText({
      system: TRANSCRIBE_DOC,
      content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: data.toString("base64") } },
        { type: "text", text: "Transcribe this document." },
      ],
      maxTokens: 64000,
    });
    return tidy(read);
  }

  if (ext === "docx") {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: data });
    return tidy(value);
  }

  if (ext === "html" || ext === "htm") {
    return tidy(convert(data.toString("utf8"), { wordwrap: false, selectors: [{ selector: "img", format: "skip" }, { selector: "a", options: { ignoreHref: true } }] }));
  }

  if (ext === "txt" || ext === "md") return tidy(data.toString("utf8"));

  const media = IMAGE_TYPES[ext];
  if (media) {
    const { text } = await runText({
      system: TRANSCRIBE_DOC,
      content: [
        { type: "image", source: { type: "base64", media_type: media, data: data.toString("base64") } },
        { type: "text", text: "Transcribe this document." },
      ],
    });
    return tidy(text);
  }

  if (ext === "doc") throw new Error("Old .doc files aren't supported. Save it as .docx or PDF and try again.");
  throw new Error(`Unsupported file type ".${ext}". Use PDF, .docx, .txt, .md, .html or an image.`);
}

/** PDF text keeps the page's line breaks; rejoin lines that were wrapped mid-sentence. */
function unwrapLines(text: string): string {
  return text.replace(/([^\n.!?:;])\n(?=[a-z(])/g, "$1 ");
}

function tidy(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
