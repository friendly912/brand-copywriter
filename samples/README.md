# Sample data for testing

Three made-up brands with deliberately different voices, so you can see whether the app really writes differently per brand. All names, people, products, prices and results are fictional.

| Brand | Voice | Emails | Documents | Email platform |
|---|---|---|---|---|
| **Luna & Fern** (skincare) | Warm, calm, founder-led ("Hi love," … "Love, Mia"), sentence case, almost no emoji | 6 (.txt, .html, .md, .eml) | Style guide (**PDF**), product sheet (.md) | Klaviyo |
| **Ironclad Supply Co.** (workwear) | Blunt, dry humour, Title Case subjects, ALL CAPS labels, never emoji | 6 (.txt, .html) | Voice rules (.md), catalogue (**.docx**) | Shopify Email |
| **Daybreak Coffee Co.** (coffee) | Playful, lowercase, puns, emoji everywhere | 6 (.txt, .md, .html) | Voice cheat sheet (.md), lineup (.md) | Klaviyo |

Each brand folder has:

- `brand.json`: the manifest (description, audience, palette, hard rules, which emails are favourites and how they performed, documents, sample briefs)
- `emails/`: past emails in the formats the app accepts
- `docs/`: brand documents
- `profile.json`: a hand-written voice profile, so you can write emails without building one first

`extra/daybreak-cold-brew-screenshot.png` is an email screenshot for testing screenshot upload by hand (this uses Claude vision).

## Loading the samples

**In the app:** Brands → **Load sample brands** → pick brands → **Import**. Importing makes no AI calls.

- Keep **Include ready-made voice profiles** ticked to start writing straight away.
- Untick it to test **Build voice profile** with AI, then compare the AI profile with `profile.json`.
- On the Write screen, sample brands get a **Sample brief** dropdown that fills in the form.

**By hand (to test uploads):** create a brand, then drag the files from `emails/` into *Past emails* and from `docs/` into *Brand documents*.

**From the command line** while the app is running:

```bash
curl -X POST http://127.0.0.1:3000/api/samples -H "Content-Type: application/json" -d '{"withProfiles": true}'
```

## Things worth testing

1. Write the same brief (e.g. a Black Friday sale) for all three brands. The subject lines alone should look nothing alike.
2. Rules: Ironclad bans emoji and "premium"; Luna bans "anti-aging" and limits subjects to 45 characters. Try briefs that tempt the model and look at the warnings.
3. Product facts: ask Luna & Fern for a Calm Mist email without giving a price. It should use $22 from the product sheet instead of a placeholder.
4. Performance notes: favourites and emails with results are picked first as examples.
5. Review & improve on a draft you've made worse on purpose (add "Buy now!!!" to a Luna email).

`docs/*.source.*` files are the editable sources of the PDF and .docx; they aren't imported.
