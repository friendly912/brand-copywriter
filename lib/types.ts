import { z } from "zod";

// ---------- Brand setup ----------

export const PALETTE_ROLES = ["primary", "secondary", "accent", "cta", "background", "text"] as const;

export const PaletteColor = z.object({
  name: z.string(),
  hex: z.string(),
  role: z.enum(PALETTE_ROLES),
});
export type PaletteColor = z.infer<typeof PaletteColor>;

export const HardRules = z.object({
  bannedWords: z.array(z.string()).default([]),
  emoji: z.enum(["never", "sparingly", "free"]).default("sparingly"),
  signOff: z.string().default(""),
  subjectMaxChars: z.number().int().positive().default(60),
  previewMinChars: z.number().int().nonnegative().default(40),
  previewMaxChars: z.number().int().positive().default(110),
  other: z.array(z.string()).default([]),
});
export type HardRules = z.infer<typeof HardRules>;

export const Brand = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(""),
  palette: z.array(PaletteColor).default([]),
  rules: HardRules,
  activeProfileVersion: z.number().int().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Brand = z.infer<typeof Brand>;

export const EMAIL_TYPES = [
  "promo",
  "product_launch",
  "newsletter",
  "welcome",
  "abandoned_cart",
  "win_back",
  "announcement",
  "event",
  "seasonal",
  "other",
] as const;
export type EmailType = (typeof EMAIL_TYPES)[number];

export const EMAIL_TYPE_LABELS: Record<EmailType, string> = {
  promo: "Promo / sale",
  product_launch: "Product launch",
  newsletter: "Newsletter",
  welcome: "Welcome",
  abandoned_cart: "Abandoned cart",
  win_back: "Win-back",
  announcement: "Announcement",
  event: "Event / webinar",
  seasonal: "Seasonal / holiday",
  other: "Other",
};

export const SourceEmail = z.object({
  id: z.string(),
  brandId: z.string(),
  emailType: z.enum(EMAIL_TYPES),
  subject: z.string().default(""),
  preview: z.string().default(""),
  body: z.string(),
  origin: z.enum(["upload", "final"]),
  fileName: z.string().nullable().default(null),
  favorite: z.boolean().default(false),
  note: z.string().default(""),
  createdAt: z.string(),
});
export type SourceEmail = z.infer<typeof SourceEmail>;

// ---------- Brand profile (also the structured-output schema for extraction) ----------
// Structured outputs don't support records/maps, so per-type data is a list of {email_type, ...}.

export const BrandProfileContent = z.object({
  summary: z.string().describe("2-3 sentences describing the voice"),
  personality: z.array(z.string()).describe("Short trait words or phrases"),
  audience: z.string(),
  tone_by_email_type: z.array(z.object({ email_type: z.string(), tone: z.string() })),
  vocabulary: z.object({
    signature_phrases: z.array(z.string()),
    preferred_words: z.array(z.string()),
    avoid_words: z.array(z.string()),
  }),
  mechanics: z.object({
    sentence_length: z.string(),
    person: z.string(),
    capitalization: z.string(),
    punctuation: z.string(),
    emoji: z.string(),
    formatting: z.string(),
  }),
  subject_lines: z.object({ patterns: z.array(z.string()), typical_length: z.string(), examples: z.array(z.string()) }),
  preview_text: z.object({ patterns: z.array(z.string()), examples: z.array(z.string()) }),
  structure: z.object({
    default: z.array(z.string()),
    by_email_type: z.array(z.object({ email_type: z.string(), sections: z.array(z.string()) })),
  }),
  cta_style: z.object({ patterns: z.array(z.string()), examples: z.array(z.string()) }),
  sign_off: z.string(),
  dos: z.array(z.string()),
  donts: z.array(z.string()),
  open_questions: z
    .array(z.string())
    .describe("Things the sources were inconsistent or silent about, for the user to decide"),
});
export type BrandProfileContent = z.infer<typeof BrandProfileContent>;

export const BrandProfile = z.object({
  brandId: z.string(),
  version: z.number().int(),
  createdBy: z.enum(["ai", "user"]),
  parentVersion: z.number().int().nullable(),
  sourceIds: z.array(z.string()),
  note: z.string().default(""),
  profile: BrandProfileContent,
  createdAt: z.string(),
});
export type BrandProfile = z.infer<typeof BrandProfile>;

// ---------- Email copy (structured-output schema for generation) ----------

export const SECTION_KINDS = ["hero", "text", "product", "feature_list", "testimonial", "offer", "cta_block"] as const;

export const CopySection = z.object({
  key: z.string().describe("Stable snake_case id, e.g. hero, body_1, product_grid"),
  // Plain string: the SDK doesn't send enum constraints, so a strict enum here could reject good output.
  kind: z.string().describe(`One of: ${SECTION_KINDS.join(", ")}`),
  heading: z.string().nullable(),
  body: z.string(),
  items: z
    .array(z.object({ title: z.string(), copy: z.string(), cta: z.string().nullable() }))
    .nullable()
    .describe("Only for product / feature_list sections"),
  cta: z.string().nullable(),
});
export type CopySection = z.infer<typeof CopySection>;

export const SubjectLine = z.object({
  text: z.string(),
  angle: z.string().describe("One or two words: urgency, curiosity, benefit, playful, ..."),
  preview: z.string().describe("Preview text written to pair with this subject line"),
});
export type SubjectLine = z.infer<typeof SubjectLine>;

export const EmailCopy = z.object({
  subject_lines: z.array(SubjectLine),
  headline: z.string(),
  subheadline: z.string().nullable(),
  sections: z.array(CopySection),
  primary_cta: z.string(),
  ps: z.string().nullable(),
  footer_line: z.string().nullable(),
  design_notes: z.array(z.string()),
});
export type EmailCopy = z.infer<typeof EmailCopy>;

// Regenerating one part of an email returns one of these shapes.
export const SubjectBlockRegen = z.object({ subject_lines: z.array(SubjectLine) });
export const HeaderBlockRegen = z.object({ headline: z.string(), subheadline: z.string().nullable() });
export const ClosingBlockRegen = z.object({
  primary_cta: z.string(),
  ps: z.string().nullable(),
  footer_line: z.string().nullable(),
});

// ---------- Brief & drafts ----------

export const Brief = z.object({
  emailType: z.enum(EMAIL_TYPES),
  goal: z.string().default(""),
  offer: z.string().default(""),
  products: z.string().default(""),
  deadline: z.string().default(""),
  audience: z.string().default(""),
  mustInclude: z.string().default(""),
  avoid: z.string().default(""),
  toneNudge: z.string().default(""),
  notes: z.string().default(""),
});
export type Brief = z.infer<typeof Brief>;

export const Usage = z.object({
  model: z.string(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadTokens: z.number(),
  cacheWriteTokens: z.number(),
  costUsd: z.number(),
});
export type Usage = z.infer<typeof Usage>;

export const LintIssue = z.object({
  level: z.enum(["error", "warning"]),
  where: z.string(),
  message: z.string(),
});
export type LintIssue = z.infer<typeof LintIssue>;

/** Keys of editable blocks inside a draft: "subjects", "header", "closing", or "section:<key>". */
export type BlockKey = string;

export const Revision = z.object({
  block: z.string(),
  instruction: z.string(),
  createdAt: z.string(),
});

export const Draft = z.object({
  id: z.string(),
  brandId: z.string(),
  brief: Brief,
  profileVersion: z.number().int().nullable(),
  exampleIds: z.array(z.string()),
  model: z.string(),
  generated: EmailCopy,
  current: EmailCopy,
  chosenSubject: z.number().int().default(0),
  locked: z.array(z.string()).default([]),
  revisions: z.array(Revision).default([]),
  status: z.enum(["draft", "final"]),
  finalSourceId: z.string().nullable().default(null),
  usage: z.array(Usage).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Draft = z.infer<typeof Draft>;

// ---------- Settings ----------

export const MODELS = [
  { id: "claude-opus-5", label: "Claude Opus 5 (best quality)" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5 (cheaper, faster)" },
] as const;

export const Settings = z.object({
  apiKey: z.string().default(""),
  model: z.string().default("claude-opus-5"),
  effort: z.enum(["low", "medium", "high"]).default("medium"),
  examplesPerPrompt: z.number().int().min(1).max(15).default(6),
  refreshAfterFinals: z.number().int().min(1).default(5),
});
export type Settings = z.infer<typeof Settings>;

/** What the browser is allowed to see: never the key itself. */
export type PublicSettings = Omit<Settings, "apiKey"> & { apiKeySet: boolean; apiKeyHint: string; apiKeyFromEnv: boolean };
