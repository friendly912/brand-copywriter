# Brand Copywriter: Beginner's Guide

This guide takes you from nothing installed to your first finished email. You don't need any technical knowledge; just follow the steps in order.

**Time needed:** about 20 minutes the first time.

**Contents**

1. [What this app does](#1-what-this-app-does)
2. [What you need](#2-what-you-need)
3. [Install on Windows](#3-install-on-windows)
4. [Get your API key](#4-get-your-api-key)
5. [Try it with the sample brands](#5-try-it-with-the-sample-brands)
6. [Write your first email](#6-write-your-first-email)
7. [Set up your own brand](#7-set-up-your-own-brand)
8. [Everyday use](#8-everyday-use)
9. [Troubleshooting](#9-troubleshooting)
10. [Mac and Linux](#10-mac-and-linux)
11. [Words used in this guide](#11-words-used-in-this-guide)

---

## 1. What this app does

You give the app a brand's old emails. It learns how that brand writes. Then you describe a new email in a few lines, and it writes the whole thing in that brand's voice:

- 5 subject lines, each with its own preview text
- a headline
- the body, split into sections
- the main button text (the "CTA")
- short notes for your designer, such as which brand colour to use for the button

You check it, change anything you like, copy it into your email platform (Klaviyo, Mailchimp and so on) and design it as usual.

The app runs **on your own computer** and opens in your web browser. Your brands and emails are saved on your computer only.

---

## 2. What you need

| You need | Why | Cost |
|---|---|---|
| A Windows 10 or 11 computer | The app runs on it | — |
| Internet connection | To reach the AI service | — |
| **Node.js** (free program) | The app needs it to run | Free |
| **A Claude API key** | Lets the app use Claude, the AI that writes | Pay per use, roughly $0.05–0.15 per email |
| *Optional:* an OpenRouter API key | Backup AI if Claude is ever unavailable | Pay per use |

> 💡 **What's an API key?** A long password that lets the app use an AI service on your account. You create it once and paste it into the app.

---

## 3. Install on Windows

### Step 1: Install Node.js

1. Go to **https://nodejs.org**.
2. Click the big button that says **LTS** (it means "long-term support", the stable version).
3. Open the downloaded file and click **Next** through the installer. Keep all the default options.
4. When it says **Finish**, you're done. You don't need to open anything.

✅ **Check:** press the **Windows key**, type `cmd`, press **Enter**. In the black window, type `node -v` and press **Enter**. You should see a version number such as `v24.18.0`. Close the window.

> If it says *"'node' is not recognized"*, restart your computer and try again.

### Step 2: Download the app

1. Go to **https://github.com/friendly912/brand-copywriter** (if the page says *404*, the repository is private: ask the owner to give your GitHub account access, or to send you the ZIP file).
2. Click the green **Code** button, then **Download ZIP**.
3. Open your **Downloads** folder, **right-click** the ZIP file and choose **Extract All…**, then click **Extract**.
4. Move the extracted folder somewhere easy to find, for example `C:\BrandCopywriter` or your Documents folder.

> ⚠️ Don't run the app from inside the ZIP file. Always extract it first.

### Step 3: Start the app

1. Open the app folder.
2. Double-click **`start.bat`**.
3. A black window opens. **The first time only**, it installs and prepares everything. This takes 1–3 minutes and shows a lot of text. That's normal.
4. When it's ready, your web browser opens the app automatically.

✅ **Check:** your browser shows **Brand Copywriter** with a **Brands** page, at the address `http://127.0.0.1:3000`.

> **"Windows protected your PC"?** Windows shows this for files downloaded from the internet. Click **More info**, then **Run anyway**.

> 🟡 **Keep the black window open** while you use the app. Closing it stops the app.

---

## 4. Get your API key

### Claude key (required)

1. Go to **https://platform.claude.com** and create an account (or sign in).
2. Add a payment method and some credit under **Billing**. $10–20 is plenty to start.
3. Go to **API keys** and click **Create key**. Give it a name like `Brand Copywriter`.
4. **Copy the key right away.** It starts with `sk-ant-` and is only shown once.

Now put it in the app:

1. In the app, click **Settings** at the top.
2. Paste the key into the **Claude API key** box and click **Save key**.
3. Click **Test connection**.

✅ **Check:** a green box says **Connected**.

> 🔒 Treat the key like a password. Don't share it or post it anywhere.

### OpenRouter key (optional backup)

If Claude is ever down or busy, the app can automatically use another AI through OpenRouter instead.

1. Create an account at **https://openrouter.ai**, add a little credit, and create a key under **Keys**.
2. In the app's **Settings**, find **OpenRouter (next option after Claude)**, paste the key and click **Save key**.
3. Click **Test OpenRouter**. You should see **Connected**.

You can leave the model as it is.

---

## 5. Try it with the sample brands

The app comes with three made-up brands so you can try everything before setting up your own.

1. Click **Brands** at the top.
2. Click **Load sample brands**.
3. Leave everything ticked and click **Import 3 sample brands**.
4. Click **Close**.

✅ **Check:** you see three brand cards: **Daybreak Coffee Co.**, **Ironclad Supply Co.** and **Luna & Fern**.

Each sounds very different: Luna & Fern is calm and gentle, Ironclad is short and blunt, and Daybreak is playful with lots of emoji. That makes it easy to see the app writing in different voices.

---

## 6. Write your first email

### Fill in the brief

1. On the **Luna & Fern** card, click **Write email**.
2. At the top left, open the **Sample brief** list and choose **Black Friday: 25% off sitewide**. The form fills itself in.
   (For your own emails, you type in the fields yourself. Every field is optional, but the more you give, the better the email.)
3. Click **Write email**.

A progress bar shows what's happening. A full email takes **20–60 seconds**.

✅ **Check:** the right side shows the finished email in blocks: **Subject lines & preview text**, **Headline**, body sections, **CTA & closing**, and **Design notes**.

### Make it yours

| To do this | Do this |
|---|---|
| **Pick a subject line** | Click the round button next to the one you like |
| **Change any text** | Click in the box and type. Changes save automatically |
| **Rewrite one part** | Click **↻ Rewrite** on that block. Optionally type what you want ("shorter", "more fun") or click a suggestion |
| **Keep a part you like** | Click **Lock** on that block. Locked parts never change |
| **Rewrite everything else** | Click **Rewrite whole email (keeps locked)** on the left |
| **Get an AI second opinion** | Click **✦ Review & improve**. It checks the email and fixes only what needs fixing |

> 🟠 If a coloured box appears above the email, it's pointing out something to check, such as a word the brand never uses, a subject line that's too long, or a `[placeholder]` you need to fill in. Click **Fix with AI** or edit the text yourself.

> **What's a `[placeholder]`?** When the AI needs a fact you didn't give (a discount code, a date), it writes something like `[discount code]` instead of making one up. Replace it with the real thing.

### Copy it into your email platform

1. Click **Copy text** (or **Copy Markdown** if your tool supports it).
2. Paste into Klaviyo, Mailchimp, a Google Doc, or wherever you build emails.

### Mark it as final

When you've sent the email, click **✓ Mark final**. The app saves it as a new example of the brand's voice, and it learns from the changes you made.

---

## 7. Set up your own brand

### Gather your materials first

| What | How many | Where to get it |
|---|---|---|
| **Past emails** | 5–10 or more; mix types (sales, welcome, newsletters…) | See "How to save an email" below |
| **Results** (optional) | For your best emails | Open or click rates from your email platform, e.g. "32% CTR" |
| **Style guide** (optional) | Any | A PDF, Word file or text describing the brand voice |
| **Product info** (optional) | Any | Product names, prices, key features |
| **Brand colours** | 3–6 | Colour codes like `#C97B63` from your brand guide |
| **Rules** | — | Words to never use, emoji or not, how emails are signed off |

**How to save an email** (choose any):

- **Copy and paste** the text. You can start with `Subject: …` and `Preview: …` lines.
- **Save as a web page:** open the email in your browser ("View in browser" link), press **Ctrl + S**, and save it as an **.html** file.
- **Screenshot** the email and save it as a .png or .jpg file.
- **.eml files** exported from your email program also work.

### Create the brand

1. Click **Brands**, then **+ New brand**. Type the name and a line about what the brand sells, then click **Create brand**.
2. **Tab 1. Past emails:** drag your email files into the box (or paste text), choose the **Email type** (or leave **Auto-detect**), and click **Add**.
   Star ☆ your best emails, and use **View → Edit** on an email to add **How it performed** (e.g. "44% open, 5.8% CTR").
3. **Tab 2. Brand documents** (optional): drop in your style guide and product info.
4. **Tab 3. Voice profile:** click **Build voice profile** and wait about a minute. Read what the AI wrote about your brand's voice. If something is off, click **Edit** and fix it. If you see **Open questions for you**, answer them by editing the profile.
5. **Tab 4. Rules & palette:** add your audience, email platform, colours, banned words, emoji rule and sign-off, then click **Save**.
6. Click **Write an email**. You're ready.

> 💡 **The more good examples, the better.** If the emails don't sound right yet, add more past emails, star the best ones, then go to **Voice profile** and click **Refresh with AI**.

---

## 8. Everyday use

### Start and stop

- **Start:** double-click **`start.bat`**. The browser opens by itself, and later starts take only a few seconds.
- **Stop:** close the black window.
- **Lost the browser tab?** Go to **http://127.0.0.1:3000** while the black window is open.

### Find old emails

Click **History** to see every email you've written. Search by words, or filter by brand. Click one to open it.

### Back up your work

Everything is stored in the **`data`** folder inside the app folder. To back up, **copy the `data` folder** somewhere safe (a USB stick or cloud drive).

To move to a new computer, install the app there, then copy your `data` folder into it.

### Update to a new version

1. Download and extract the new version (see [Step 2](#step-2-download-the-app)).
2. Copy the **`data`** folder from your old app folder into the new one.
3. Double-click **`rebuild.bat`** in the new folder once, and wait for **Done**.
4. From then on, use **`start.bat`** in the new folder as usual.

### Keep an eye on costs

**Settings → Spend** shows an estimate of this month's cost. You can lower costs in **Settings → Writing**:

- **Model:** *Claude Sonnet 5* costs about half as much as *Claude Opus 5*.
- **Effort:** *Low* is cheaper and faster; *High* is more careful.
- Leave **Review every new email automatically** off. It roughly doubles the cost per email; use **✦ Review & improve** only when you want it.

---

## 9. Troubleshooting

| Problem | What to do |
|---|---|
| *"Node.js is not installed"* when starting | Install Node.js ([Step 1](#step-1-install-nodejs)), restart the computer, and try again. |
| *"Windows protected your PC"* | Click **More info → Run anyway**. |
| The black window closes straight away | Make sure you extracted the ZIP first (Step 2) and are not running `start.bat` from inside it. Check Node.js is installed (Step 1). |
| Browser says *"This site can't be reached"* | Wait 10 seconds and refresh. Make sure the black window is still open. |
| Error mentioning **port 3000** or **EADDRINUSE** | The app is probably already running in another black window. Use that one, or close it and start again. If that doesn't help, restart the computer. |
| Yellow bar: *"No API key yet"* | Add your key in **Settings** ([section 4](#4-get-your-api-key)). |
| *"The Claude API key was rejected"* | Copy the key again from platform.claude.com and save it again. Check your account has credit. |
| *"Rate limited"* | Wait a minute and try again, or add an OpenRouter key as backup. |
| Emails don't sound like the brand | Add more (and better) past emails, star the best, add results, then **Refresh with AI** on the Voice profile tab. Try **Effort: High** in Settings. |
| A screenshot or PDF came out with mistakes | Open it in the list, click **View → Edit**, and correct the text. |
| Something is broken after updating | Double-click **`rebuild.bat`**, then **`start.bat`**. |
| *"os error 32"*, *"being used by another process"* or *"failed to rename file"* during the first start or a rebuild | Another program has the app's files open. Close **all** Brand Copywriter black windows, then run **`rebuild.bat`**. If the folder is inside **OneDrive or Dropbox**, move it out first (for example to `C:\BrandCopywriter`). Still failing? Restart the computer and run `rebuild.bat` again. |

Still stuck? Take a screenshot of the black window and the browser, and send them to whoever set the app up for you.

---

## 10. Mac and Linux

The app works the same way, but you start it from the **Terminal** instead of `start.bat`.

1. Install Node.js LTS from **https://nodejs.org** (Linux users can use their package manager).
2. Download and extract the app (Step 2).
3. Open **Terminal** in the app folder and run these one at a time (the first time only):
   ```
   npm install
   npm run build
   ```
4. Start the app:
   ```
   npm start
   ```
5. Open **http://127.0.0.1:3000** in your browser. Keep the Terminal open; press **Ctrl + C** in it to stop the app.

After an update, run `npm install` and `npm run build` again.

---

## 11. Words used in this guide

| Word | Meaning |
|---|---|
| **API key** | A private password that lets the app use an AI service and bill your account. |
| **Brief** | Your short description of the email you want: the goal, the offer, products, deadline. |
| **CTA** | "Call to action": the main button, e.g. *Shop the sale*. |
| **Preview text** | The grey line shown after the subject in most inboxes. Also called pre-header or pretext. |
| **Voice profile** | The app's written description of how a brand writes. It's built from your past emails and documents, and you can edit it. |
| **Lock** | Protects a block so rewrites don't change it. |
| **Final** | An email you've marked as done. It becomes a new example for the brand. |
| **OpenRouter** | A service that gives access to many AI models; used as a backup. |
| **Terminal / black window** | A text window where programs show their messages. The app's window must stay open while you use it. |
