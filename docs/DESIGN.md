# Brand-Voice Email Copywriter: Project Design

Status: v2, 2026-09-26. **Runs locally on Windows.** See the [README](../README.md) for install and use.

The v1 design was a hosted web app (Vercel, Postgres, login). v2 makes it a local desktop tool:

| | v1 (hosted) | v2 (local Windows) |
|---|---|---|
| Runs on | Vercel | The user's PC, `start.bat` → browser at `127.0.0.1:3000` |
| Storage | Postgres + blob storage | Plain JSON files in `data\` |
| Login | Magic link + allowlist | None; the server listens on 127.0.0.1 only |
| API key | Server environment variable | Pasted in Settings, stored in `data\settings.json` (or `.env.local`) |
| Install | Deploy | Install Node.js LTS, double-click `start.bat` |
| Updates | Redeploy | Replace files, run `rebuild.bat` |
| Backup | Managed DB | Copy the `data` folder |

---

## 1. Goal

One user picks a brand, writes a short brief, and gets back a complete, structured email copy in that brand's voice. They edit it and hand it to design. The tool does **not** design, render HTML templates, or send email.

**Success criteria**
- In a blind test, the client can't reliably tell generated copy from the brand's real past emails, or rates it "usable with light edits" in ≥ 80% of cases.
- A full email is ready in under 60 s; a single block rewrite in under 15 s.
- Adding a brand needs no code changes.
- A non-developer can install and run it on Windows from the README.

**Non-goals**: email design/HTML output, sending/ESP integration, multi-user, hosting.

---

## 2. Core concepts

| Concept | What it is |
|---|---|
| **Brand** | Name, description, palette, hard rules, active profile version. |
| **Source email** | A past email (from paste, `.html`, `.eml`, `.txt`/`.md` or screenshot), normalised to subject + preview + light-Markdown body, and tagged with an email type. It can be a favourite. |
| **Brand Profile** | A versioned, editable description of the voice, extracted by Claude from the sources. Versions are never overwritten, and any version can be made active again. |
| **Brief** | Email type + optional goal, offer, products, deadline, audience, must-include, avoid, tone nudge and notes. |
| **Draft** | Generated email copy. It stores `generated` (the latest AI text per block), `current` (with the user's edits), the chosen subject, locked blocks, revision log, token usage, and the profile version and examples that produced it. |
| **Final** | A draft marked as sent. Its copy becomes a source email (`origin: final`), and the diff from `generated` to `current` feeds the next profile refresh. |

---

## 3. User flows

**A. Set up a brand**: create → add past emails (auto-detect type or pick one; star favourites) → **Build voice profile** → review, answer the "open questions", edit → set rules and palette.

**B. Write an email**: brief → **Write email** (streams progress) → pick a subject, edit inline (autosaves) → **↻ Rewrite** any block, with an optional instruction or a quick chip → **Lock** good blocks, **Rewrite whole email** keeps them → fix lint warnings (one-click **Fix with AI**) → **Copy text / Copy Markdown**.

**C. Learn over time**: **Mark final** → the email joins the example library. Once *N* finals (default 5) exist since the active profile was built, the app suggests **Refresh with AI**. The refresh reads the current profile, all sources, and before/after notes of what the user changed in finals.

---

## 4. Architecture

```
start.bat ─► npm install / next build (first run) ─► next start -H 127.0.0.1 -p 3000 ─► opens browser

Browser (React client pages)
   │  fetch JSON; long AI jobs stream NDJSON progress lines
   ▼
Next.js server (Node, localhost only)
   ├─ app/api/*            thin route handlers (Zod-validated input)
   ├─ lib/ai/ingest.ts     html/eml/txt → text; screenshots → Claude vision; type detection
   ├─ lib/ai/profile.ts    build / refresh Brand Profile (structured output, effort high)
   ├─ lib/ai/generate.ts   example selection, cache-friendly prompt assembly, full + per-block generation
   ├─ lib/ai/client.ts     Anthropic SDK: streaming structured output, fallbacks, retry, cost, error mapping
   ├─ lib/lint.ts          deterministic rule checks (shared with the browser)
   └─ lib/store.ts         JSON file store under data\
          ▲
   Claude API (@anthropic-ai/sdk) ── the only network traffic
```

**Stack**

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node.js ≥ 20.9 (LTS installer) | One install on Windows. No native modules to compile. |
| App | Next.js 16 (App Router) + TypeScript | UI and API in one process, with streaming responses. |
| UI | Hand-written CSS (light and dark) | No CSS toolchain or native binaries, so fewer install problems. |
| Storage | JSON files, atomic temp-file + rename, retries on Windows `EPERM`/`EBUSY` locks | Transparent, easy to back up, no database service. |
| AI | `@anthropic-ai/sdk`, default model `claude-opus-5` (Sonnet 5 selectable) | Best tone matching. Structured outputs via Zod. |
| Parsing | `html-to-text`, `postal-mime` | Pure JavaScript, so they work on Windows without build tools. |

**Windows-specific choices**
- The launcher is `.bat` with CRLF line endings, uses `call npm …` so the script continues after npm, checks the Node version, and auto-builds on first run.
- The server binds to `127.0.0.1`, so nothing on the local network can reach it and no login is needed.
- All paths use `path.join`, and ids are validated with `[a-z0-9_-]` before they are used in file names. Uploaded file names are sanitised.
- The data folder can be moved with `BC_DATA_DIR`. The API key can come from Settings, `.env.local` or the environment.

---

## 5. Data layout

```
data\settings.json                 { apiKey, model, effort, examplesPerPrompt, refreshAfterFinals }
data\brands\<brandId>.json         Brand
data\sources\<brandId>\<id>.json   SourceEmail
data\profiles\<brandId>\v0001.json BrandProfile (immutable versions)
data\drafts\<draftId>.json         Draft (includes brief, usage[], revisions[])
data\uploads\<brandId>\…           original uploaded files
```

Schemas live in `lib/types.ts` (Zod) and are validated on every read and write. The API never returns the API key, only whether one is set and its last 4 characters.

---

## 6. The Brand Profile

This is the structured-output schema `BrandProfileContent`: summary, personality, audience, tone by email type, vocabulary (signature phrases, preferred and avoid words), mechanics (sentence length, point of view, capitalisation, punctuation, emoji, formatting), subject-line and preview patterns with real examples, structure (default and by type), CTA style, sign-off, dos and don'ts, and **open questions** for the owner.

Structured outputs don't allow maps, so per-type data is a list of `{email_type, …}`. In the UI, each field is edited as plain text: lists one per line, `type: tone` pairs, and `type: a > b > c` structures.

---

## 7. Generation pipeline

### 7.1 Output contract (`EmailCopy`)
5 × `{text, angle, preview}` subject lines (each preview is written for its own subject), headline, subheadline, sections `{key, kind, heading, body, items[], cta}`, primary CTA, P.S., footer line and design notes.

Two constraints come from the SDK. It strips `enum` and array-length constraints when it sends the schema but still validates them when it parses the answer. So "enum" fields are sent as plain strings with the allowed values in the description, and normalised in code. Counts are stated in the prompt.

### 7.2 Prompt assembly (cache-friendly)
```
system[0] COPYWRITER_INSTRUCTIONS      same for every brand
system[1] brand block                  rules, palette, profile JSON
system[2] examples block  ← cache_control breakpoint
user      brief (or: brief + current draft JSON + "rewrite only X" + instruction)
```
Example selection (default 6) takes favourites of the same type, then finals of the same type, then other emails of the same type, then other favourites and finals. It is deterministic. A rewrite reuses the draft's own `exampleIds`, so full generations and block rewrites share one cached prefix; the test run confirmed the prefix is byte-identical.

### 7.3 Request
`client.beta.messages.stream` with `thinking: {type: "adaptive"}`, `output_config: {effort, format: betaZodOutputFormat(schema)}`, and, for Opus 5, server-side refusal fallback (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`). It checks `stop_reason` (`refusal`, `max_tokens`) and retries once if the JSON fails validation. SDK errors are turned into plain-language messages, for example "key rejected → Settings".

### 7.4 Progress
Routes stream NDJSON: `progress` heartbeats (with the phase inferred from which JSON keys have appeared so far, e.g. "Writing the body…"), then one `done` or `error` line. The browser can cancel, and cancelling aborts the Claude request.

### 7.5 Block rewrites
The blocks are `subjects`, `header`, `closing` and `section:<key>`. Each has its own small output schema. The result is merged into both `current` and `generated`, so later edit diffs only contain the user's own changes.

### 7.6 Lint (browser and server, deterministic)
- banned words (errors)
- the profile's avoid-words (warnings)
- emoji rule
- subject and preview lengths
- `[placeholders]`
- missing sign-off

Each issue maps to its block for **Fix with AI**.

---

## 8. Ingestion

| Input | Handling |
|---|---|
| Paste / `.txt` / `.md` | Leading `Subject:` / `Preview:` lines are parsed out. |
| `.html` | `<title>` becomes the subject. The hidden preheader becomes the preview. h1–h3 become `#` headings. Images, styles, hidden elements and footer boilerplate are removed. |
| `.eml` | Parsed with `postal-mime`; the Subject header plus the HTML part (or text part) go through the `.html` path. |
| Screenshot (png/jpg/webp/gif) | Claude vision (effort low) transcribes it into the same structure and also returns the type. |

If the type is "Auto-detect", a low-effort classification call picks it. The originals are kept in `data\uploads`.

---

## 9. Screens

| Screen | Contents |
|---|---|
| **Brands** | Cards with palette swatches, counts and profile status. Write / Set up buttons. |
| **Brand** | Tabs: *1. Past emails* (drop zone, paste, type, favourite, library with filter/view/edit/delete) · *2. Voice profile* (build, readable view, open questions, edit, version picker and rollback, refresh) · *3. Rules & palette*. |
| **Write** | Sticky brief on the left. On the right: toolbar (status, model, cost, autosave, copy, final, delete), lint box, subject block (radio, char counters), headline, sections, CTA & closing, design notes with swatches. |
| **History** | All drafts with search, brand and status filters. Click one to reopen it. |
| **Settings** | API key (save, test, remove), model, effort, examples per request, refresh threshold, estimated spend. |

---

## 10. Quality and evaluation

- **Automated check (done)**: a mock Claude API server returns data shaped like the real schemas, then a script drives every route and a headless-browser pass covers every screen. It verified ingestion, profile build and refresh, generation, block rewrites, lock-preserving full rewrites, finals, edit diffs, requests (headers, thinking, fallbacks, cache breakpoint) and the UI flows.
- **Voice check (to do with the client's real emails)**: hold out 3 real emails per brand, write the brief each came from, generate, and let the client compare blind. Use it to tune effort (medium vs high) and example count.

---

## 11. Cost and privacy

- With Opus 5, a full email is about $0.05–0.15 and a block rewrite about $0.01–0.03, helped by prompt caching. A profile build is about $0.10–0.50 depending on how many emails the brand has. Settings shows a running estimate.
- Everything stays on the PC except the text sent to the Claude API when writing. There is no telemetry, and there are no accounts.

---

## 12. Status

| Area | State |
|---|---|
| Brands, sources (all input types), profile build/edit/versions/refresh | Done |
| Write flow: generate, stream, edit, autosave, lock, block rewrite, lint and fix, copy out, finals | Done |
| History, settings, spend estimate, Windows launcher, README | Done |
| Tested against the real Claude API | **Not yet**: this environment had no API key. It was tested against a mock server that uses the same request and response format. |
| Voice-match evaluation on the client's brands | To do after setup |

## 13. Later

- Export in formats specific to Klaviyo or Mailchimp, or push copy straight into a template.
- Use open and click rates to weight which examples are chosen.
- Multi-email sequences (teaser → launch → last call) from one brief.
- A packaged `.exe` (Electron) if installing Node.js turns out to be a barrier for the client.
