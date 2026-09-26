# Brand Copywriter

Writes marketing email copy in each brand's own voice. You give it a brand's past emails, it learns the voice, and then turns a short brief into a full email: 5 subject lines with preview text, headline, body sections, CTA, P.S. and design notes. You edit, copy it out, and design it yourself.

**New here? Follow the step-by-step [Beginner's Guide](docs/GUIDE.md).** The same guide comes as a web page, [HELP.html](HELP.html): double-click it in the app folder (works offline), or click **Help** in the app.

Runs entirely on your Windows PC. The only thing that leaves your computer is the text sent to the AI service when writing (Claude, or OpenRouter as a backup).

## Requirements

- Windows 10 or 11
- [Node.js](https://nodejs.org) 20.9 or newer (the LTS installer, default options)
- A Claude API key from [platform.claude.com](https://platform.claude.com/settings/keys)
- Optional: an [OpenRouter](https://openrouter.ai/settings/keys) key as a fallback (see below)

## Start it

1. Unzip or copy this folder anywhere, e.g. `C:\BrandCopywriter`.
2. Double-click **`start.bat`**.
   The first run installs and builds the app (1–3 minutes). Later runs start in seconds.
3. Your browser opens at http://127.0.0.1:3000. Keep the black window open while you work; close it to stop the app.
4. Go to **Settings**, paste your API key and click **Test connection**.
5. Optional: in the **OpenRouter** section, paste an OpenRouter key and click **Test OpenRouter**.

### OpenRouter fallback

Claude is always tried first. OpenRouter is the next option: if a Claude request fails (outage, overload, rate limit, rejected key, refusal), the same request goes to the OpenRouter model set in Settings (default `openai/gpt-6-sol`). If no Claude key is set, every request goes to OpenRouter. While switching, the progress bar shows "Claude is unavailable, switching to OpenRouter…", and the draft toolbar shows which model wrote it.

- Choose a model from another company (OpenAI, Google) if you want it to keep working when Anthropic is down. The model must support structured outputs; the app only lets OpenRouter route to providers that enforce the JSON format.
- Turn the fallback off with the **Enabled** switch without removing the key.
- The key can also come from `OPENROUTER_API_KEY` in `.env.local` or the environment.

Port 3000 already in use? Open a command prompt in the folder and run `set PORT=3001 & start.bat`.

## Try it with sample data

Brands → **Load sample brands** imports three made-up brands with very different voices (a calm skincare founder, a blunt workwear maker and a pun-loving coffee roaster). Each comes with past emails and their results, a style guide, product info, a palette, rules, a ready-made voice profile and sample briefs. See [samples/README.md](samples/README.md) for what's included and what to test.

## Using it

1. **Brands → New brand.** One per brand.
2. **Past emails.** Add 5–10 or more: drop exported `.html` or `.eml` files or screenshots, or paste the copy. Star the most on-voice ones as favourites, and note **how an email performed** (e.g. "32% CTR"). Emails with a result are preferred as examples and count for more in the voice profile.
3. **Brand documents** (optional, recommended). Add the style guide and product/offer info: PDF, Word (.docx), text, HTML or images. Style guides shape the voice profile. Product info gives Claude real product names, features and prices, so it doesn't need placeholders for them. Documents marked **Send with every email** go into every writing request, within a 100k-character budget. Untick it for big catalogues, which are then used only for the voice profile.
4. **Voice profile → Build voice profile.** Claude reads the emails and documents and writes down how the brand writes. Read it, answer the "open questions", and edit anything that's off. Every save is a new version you can roll back to.
5. **Rules & palette.** Audience, email platform (e.g. Klaviyo), banned words, emoji rule, sign-off, subject/preview length limits, brand colours. Drafts are checked against these automatically.
6. **Write an email.** Fill in the brief (every field is optional, including the **main CTA button** text and **length**) and click **Write email**.
   - Pick a subject line with the radio button; edit anything in place (it autosaves).
   - **↻ Rewrite** any block, optionally with an instruction ("more urgent", "shorter").
   - **Lock** blocks you like; **Rewrite whole email** keeps locked blocks.
   - **✦ Review & improve** checks the draft for voice match, one clear CTA, generic "AI-sounding" copy, subject/preview pull, invented facts and your rules, then fixes only what fails. Locked blocks are never changed. To run it on every new email automatically, turn it on in Settings; that takes about twice as long and costs about twice as much.
   - The warning box flags banned words, over-long subjects and `[placeholders]` to fill in.
   - **Copy text** / **Copy Markdown** copies the whole email with your chosen subject.
7. **Mark final** when you've sent it. It becomes an example for that brand, and your edits are remembered. After a few finals, **Refresh with AI** on the profile page to fold what you changed back into the voice.

## Your data

Everything is stored as plain JSON files in the `data` folder next to `start.bat`:

```
data\settings.json          API key and preferences
data\brands\                one file per brand (palette, rules)
data\sources\<brand>\       past emails
data\docs\<brand>\          brand documents (extracted text)
data\profiles\<brand>\      voice profile versions
data\drafts\                every email written
data\uploads\<brand>\       original uploaded files
```

**Back up** by copying the `data` folder. To move to another PC, copy the whole app folder, or just `data` into a fresh copy. To keep data somewhere else, set the `BC_DATA_DIR` environment variable to a folder path.

API keys are stored in `data\settings.json` on this PC only. You can instead put `ANTHROPIC_API_KEY=...` and `OPENROUTER_API_KEY=...` in a `.env.local` file in this folder.

## Cost

You pay Anthropic directly for API usage (and OpenRouter for any fallback requests). With Claude Opus 5 a full email is roughly $0.05–0.15, and a single block rewrite a cent or two. Settings shows an estimate of this month's spend. Switching to Claude Sonnet 5 in Settings is roughly half the price. Higher **Effort** is slower and costs more.

## Updating

Replace the app files (keep your `data` folder), then double-click **`rebuild.bat`** once, then `start.bat` as usual.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Node.js is not installed" | Install the LTS from nodejs.org, then close and reopen the window. |
| Browser shows "can't connect" | Wait a few seconds after the window says it's running, then refresh. |
| "The Claude API key was rejected" | Paste the key again in Settings; check the key is active in the Claude Console. |
| "Rate limited" | Wait a minute and retry, or add an OpenRouter key so requests fall back automatically. |
| "OpenRouter couldn't serve this request with the chosen model" | Pick another OpenRouter model; it must support structured outputs. |
| "The OpenRouter account is out of credits" | Add credits on openrouter.ai. |
| Screenshot or scanned PDF came out wrong | Open it in the library or documents list, click **Edit** and fix the text. |
| Old Word `.doc` file | Save it as `.docx` or PDF first. |
| Something broken after an update | Run `rebuild.bat`. |
| Build error "os error 32" / "used by another process" | Close all app windows, move the folder out of OneDrive/Dropbox if it's there, then run `rebuild.bat`. |

## For developers

Next.js 16 (App Router) + TypeScript, Anthropic TypeScript SDK, Zod. No database: `lib/store.ts` is a small JSON file store.

```
npm install
npm run dev        # http://127.0.0.1:3000 with hot reload
npm run typecheck
```

| Path | What |
|---|---|
| `lib/ai/prompts.ts` | All prompts (writing, rewriting, profile extraction, ingestion) |
| `lib/ai/generate.ts` | Example selection, prompt assembly, full and per-block generation, review pass |
| `lib/ai/profile.ts` | Build or refresh the voice profile |
| `lib/ai/ingest.ts` | HTML / .eml / screenshot → clean copy; PDF / .docx / images → document text |
| `lib/ai/client.ts` | Provider chain (Claude → OpenRouter), structured-output streaming, cost estimate, error mapping |
| `lib/ai/openrouter.ts` | OpenRouter client (OpenAI-style streaming chat completions with strict JSON schema) |
| `lib/types.ts` | Zod schemas for everything stored and everything Claude returns |
| `lib/lint.ts` | Rule checks on drafts |
| `lib/store.ts` | JSON file storage |
| `app/api/**` | Local API routes |
| `app/**/page.tsx`, `components/**` | UI |
| `samples/`, `lib/samples.ts` | Sample brands for testing and their importer |

See [docs/DESIGN.md](docs/DESIGN.md) for the design.
