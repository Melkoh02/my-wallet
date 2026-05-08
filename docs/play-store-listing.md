# Play Store listing copy

Source-of-truth for the Google Play Console listing. Update here first;
the Play Console fields are downstream copies. The Play Console has its
own character limits — we keep this file under those.

## App identity

| Field | Value |
|---|---|
| **App title** | Froggy Money: Expense Tracker |
| **Launcher name** (on device) | Froggy |
| **Short description** | _(80 chars max — pick one)_ |
| **Full description** | _(4000 chars max — see below)_ |
| **Category** | Finance |
| **Content rating** | Everyone _(complete the IARC questionnaire — there is no mature content)_ |
| **Target audience** | Adults (18+) — financial use case |
| **Default language** | English (US) |
| **Privacy policy URL** | _(see `/legal/privacy-policy.md` — host on GitHub Pages and put the URL here)_ |
| **Contact email** | _(your support address)_ |
| **Contact website** | <https://melkoh.dev> _(or wherever you prefer)_ |

---

## Short description options (80 chars max)

Pick one — they trade off tone differently:

1. **Direct**
   `Offline expense tracker with maps and places. No accounts, no ads, no cloud.`
   _(76 chars)_

2. **Friendly**
   `Track money offline. Tag what you bought, where. No accounts. With a frog.`
   _(74 chars)_

3. **Feature-led**
   `Personal finance, fully offline. Tag spending to places, see it on a map.`
   _(74 chars)_

My pick: **#3** — leads with the unique "spending on a map" angle while
still surfacing the privacy point. #2 has more personality if you want
the brand to lean playful.

---

## Full description (≤ 4000 chars)

Below is the version I'd ship. Paste this into the Play Console "Full
description" field as-is — Play Store renders it as plain text with
single line breaks preserved.

```text
Froggy is a personal finance tracker that lives entirely on your phone. No sign-up, no cloud sync, no servers, no ads, no subscription. Open the app, add your accounts, start tracking. Everything you enter stays on your device.

Money tracking that doesn't ask for your data:

• Multiple accounts. Cash, debit, credit, savings, investments, and loans — both directions (loans you took, loans you gave). Each account has its own currency.

• Multi-currency from day one. Spend in Euros while your salary lands in Dollars? Froggy stores the exchange rate at the moment you record each transaction, so old totals stay historically accurate even when rates move. Conversions to your display currency happen on-device.

• Categories and subcategories. Group your spending however you want. Suggested categories appear as one-tap chips above the picker — based on what you actually use, not a generic list.

• Monthly budgets. Set a cap per category (or per subcategory). A coloured progress bar tells you at a glance whether you're on track, close to the line, or over.

• Places, with a real map. Tag a transaction to a place ("My local cafe", "Tokyo trip", "Home"). The next time you record a transaction nearby, Froggy auto-picks the place from your saved list. Pan a map to set a place's location — no need to type coordinates.

• Spending heatmap. The Analytics tab includes a fullscreen map of your tagged expenses. Tap a hot spot to see exactly what you bought there. Toggle between "by amount" (where you spend the most money) and "by visits" (where you go most often).

• Recurring transactions. Salary, rent, subscriptions — schedule them once, Froggy creates the entries on the right days even if the app is closed.

• Cashback tracking. Mark a transaction as having received cashback (instant or pending), and Froggy tracks the receivable until you confirm it landed.

• Split bills. Add people to an expense, mark who's paid up. Froggy automatically opens loan accounts for each unpaid share so you can track who still owes you.

• Backups you control. Auto-backup daily to a folder you pick (Android external storage, your choice of cloud-sync target if you want one). Manual export to JSON anytime. Atomic restore — a partial failure never corrupts your data.

• Privacy mode. Two toggles: hide amounts behind dots, or show fake numbers entirely. Useful for showing the app on screen, screen-recording, or just casual privacy. Optional biometric/PIN gate on the Backups screen and on disabling the privacy mode itself.

• Five languages. English, Spanish, Portuguese, Japanese, Chinese.

What Froggy doesn't do:

• No accounts. Nothing to sign up for. No "verify your email" step.
• No cloud sync. We don't have a server to sync to. Your data is yours; we never see it.
• No ads. Not now, not later.
• No subscription. The app is free, and the features in front of you are all the features.
• No analytics. No crash reporters, no telemetry, no marketing SDKs of any kind. The build is clean.

The app uses your device's GPS only when you explicitly tag a place, and your contacts only when you open the split-bill contact picker. Network access is for two things: fetching live exchange rates when you have multi-currency accounts, and loading map tiles when you view a map. Neither sends any of your financial data anywhere.

Why "Froggy"? The icon takes inspiration from a particular fictional frog who happens to be a coin purse. We thought it captured the vibe better than another wallet icon.

Froggy is built openly. Source available, open issues, transparent changelog, no marketing fluff. If something breaks or could be better, file an issue.
```

**Character count**: ~3,150 (well under the 4,000 limit).

---

## Required Play Console assets — checklist

These are uploaded as image files in the Play Console. Sizes are the
modern (2024+) requirements:

| Asset | Size | Purpose |
|---|---|---|
| App icon | 512×512 PNG | Store listing icon. |
| Feature graphic | 1024×500 PNG | Banner at the top of the store page. Strong, brand-forward, very little text (Play Store may overlay UI on top). |
| Phone screenshots | min 2, max 8 — 1080×1920 (or similar 16:9 portrait) | The app in action. Order matters; first 3 do the heavy lifting. |
| 7-inch tablet screenshots (optional) | 1200×1920 | Skip for v1 — submit when iPad/tablet support is a target. |
| 10-inch tablet screenshots (optional) | 1600×2560 | Same — skip. |

### Suggested screenshot sequence (8 max — pick what fits)

1. **Home dashboard** — the "this is what the app does" shot. Show
   accounts, recent transactions, totals.
2. **Spending map heatmap** — the differentiator. Make sure it's
   colourful and the heatmap is visible at thumbnail size.
3. **Place picker on the transaction form** — auto-picked place + map.
4. **Place detail screen** — header card + transaction list.
5. **Budgets list with progress bars**.
6. **Analytics charts** — daily-spending or trend.
7. **Settings** — to surface the privacy toggles, currency picker, biometric gate.
8. _Optional_ multi-language screenshot, or backup screen, or split-bill flow.

### Feature-graphic suggestion

A wide banner with:
- Centred or left-aligned: stylised Froggy icon (cropped, slightly large)
- Right side: 3-4 word tagline ("Personal finance, fully offline." or "Where did your money go?")
- Background: a soft heatmap-orange-to-red gradient that nods to the spending-map feature

I can mock this up in SVG/Figma once the icon is chosen.

---

## Data Safety form — pre-filled answers

In the Play Console, **Data Safety** is a multi-step form. Every
question's answer for Froggy:

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **No.** Froggy does not collect or share any user data. |
| Is all of the user data collected by your app encrypted in transit? | **N/A** (no data is transmitted). _If forced to pick yes/no for the network-tile/exchange-rate calls, answer "Yes" — those go over HTTPS._ |
| Do you provide a way for users to request that their data be deleted? | **Yes** (uninstalling the app deletes all data; we don't hold any server-side). |

The form will then ask about specific data types (location, contacts,
financial info, etc.). For each, the answer is the same: **collected
on device only, not sent off device, not shared with third parties**.
The form has a checkbox for that exact case in most categories.

---

## Content rating questionnaire — answers

Run through the IARC questionnaire. Every question is "no" — Froggy
has no violence, no sexual content, no profanity, no gambling, no
controlled substances, no user-generated content, no chat, no
in-app purchases, no in-app ads. Expected rating: **Everyone**.

---

## Submission strategy

1. **Internal Testing track first.** Upload the AAB, add yourself + 2
   friends as testers. Instant rollout, no review wait. Test on a real
   device for a week.
2. **Closed testing** (optional) — if you want a few more eyes
   before going public, this track allows up to 100 testers and a
   review (~24 hours).
3. **Production** when you're confident. First production review takes
   1-7 days. Subsequent updates are usually under 24 hours.

Avoid skipping straight to Production — if the first review surfaces a
fixable issue (forgotten content rating, missing screenshot, target
SDK too low), you eat the full review queue twice.
