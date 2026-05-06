# Flows

User-facing scenarios this app supports. Written for QA and for anyone trying to understand what My Wallet *does* without reading the code. Vocabulary like "balance", "debt", "approximate", "currency snapshot" is defined in `glossary.md`.

> **How to read a flow**
> Each flow has: a **name**, a **trigger** (how the user gets there), the **happy path**, and **edge cases** worth probing. Where a flow merges with another, it's called out under "Touches".
>
> Code references are file paths only, no line numbers — line numbers rot. If a flow goes missing, fix it here in the next PR.

---

## Table of contents

- [App lifecycle](#1-app-lifecycle)
- [Transactions](#2-transactions)
- [Accounts](#3-accounts)
- [Categories](#4-categories)
- [Recurring transactions](#5-recurring-transactions)
- [Templates](#6-templates)
- [Cashback](#7-cashback)
- [Backup, restore, import, export](#8-backup-restore-import-export)
- [Settings](#9-settings)
- [Privacy](#10-privacy)
- [Themes](#11-themes)
- [Analytics](#12-analytics)
- [Contacts](#13-contacts)
- [Cross-cutting test ideas](#14-cross-cutting-test-ideas)

---

## 1. App lifecycle

### 1.1 First launch

1. Stack is gated by `DatabaseProvider`. Migrations run, then `seed` populates default categories + subcategories + settings.
2. One-time data migrations run (idempotent, gated by settings flags): credit-card balance flip, default themes, transaction-currency backfill.
3. `BackupSetupModal` appears on top of the first screen.
4. User picks an Android external folder *or* taps "Skip — use app storage anyway" *or* (iOS) reads the explanation and taps "Got it".
5. Setting `backup_setup_done = "true"`. Modal dismisses.
6. App lands on the Home tab. Default categories visible from Categories tab. No accounts yet.

**Edge cases**
- User force-quits during the setup modal → next launch shows it again.
- User picks a folder, then revokes the permission in Android settings → next backup attempt logs "permission lost"; UI surfaces the "folderRevoked" warning. User must repick.
- Existing v1.0.0 install upgrading to v1.0.1+ → the credit-balance migration runs once; check that visible card balances match expected debt-vs-available semantics afterward.

### 1.2 Each app foreground

After migrations + seed + backup-setup gate are clear, the provider runs (in this order):
1. `processDueRecurring` — creates any due recurring transactions (capped at 90 days).
2. `applyInvestmentInterest` — compounds investment accounts.
3. `checkAndRunAutoBackup` — once-a-day auto-backup (skips if already backed up today).
4. `checkAndFetchRates` — refreshes exchange rate cache if stale + needed.

**Touches**: every entity. Stale rates → analytics shows "≈" markers. Network down → catchup still works (rate capture leaves NULLs, surfaced as approximate). Long offline (90+ days) → recurring catchup creates only one row dated today.

**Edge cases**
- App opened, immediately closed before async tasks finish → next foreground retries from where it left off (each step is idempotent).
- Investment account interest never hits a day where balance > 0 → `lastInterestDate` keeps advancing, so reactivating it later doesn't compound across the dormant period.

---

## 2. Transactions

### 2.0 Launching the new-transaction form (FAB gestures)

The `+` button on Home, Transactions, and Accounts is a **speed-dial FAB** with three actions: Expense (red, ↑), Income (green, ↓), Transfer (purple, ↔). Two interaction modes — both produce the same result, the user can use whichever feels natural:

- **Tap-to-open, then tap-to-pick.** Tap the `+` to expand the menu; the three actions slide up. Tap any action to open the new-transaction form pre-typed to that type. Tap the `+` again, or tap the dimmed backdrop, to close.
- **Press-and-drag.** Press the `+`, the menu expands immediately, and without lifting the finger, slide up to the action you want. The hovered item highlights with its color. Release on an action to fire it; release on empty space to cancel. The hit-test clamps: dragging above all items selects the topmost; dragging between FAB and bottom item selects the bottom one — so you don't have to be precise.

The FAB on account-detail and category-detail screens is a single-action button (just opens the relevant form pre-filled). Speed-dial only appears where the action set has more than one option.

**Touches**: the chosen type is passed via `?type=expense|income|transfer` to the form route. From account-detail, `?accountId=` is also passed. The "no accounts" guard runs before navigation: tapping any speed-dial action with zero active accounts opens the "Account Required" modal instead of the form.

**Edge cases**
- Navigating away (tab change, back gesture) while the speed-dial is open → it auto-closes (the FAB watches `useIsFocused`).
- Drag interaction is gated behind a 10px movement threshold, so a slow tap won't be misclassified as a drag.

### 2.1 Create an expense
**Trigger**: FAB on Home / Transactions / Accounts → "Expense", or from an account detail's quick-add, or by applying a template.

1. Form opens as a modal. Type defaults to `expense` (or the FAB's chosen type). Amount field auto-focuses.
2. **Smart defaults pre-fill the form**:
   - Account defaults to the account used on the user's most recent transaction *of this same type* (`getLastAccountByType`).
   - Subcategory chips show the user's most-frequent subcategories for this type (`getFrequentCategoriesByType`, top 3) as one-tap "Suggested" chips above the picker.
   - Contact defaults to the most-recently-used contact (`getLastUsedContact`).
   - Date defaults to today; time defaults to now.
3. User fills amount, optionally adjusts account / subcategories / contact / date / location / notes.
4. On save, `createTransaction` captures currency + rate-to-display, inserts the row, applies `delta = −amount` to the source account, writes subcategory links, then calls `invalidate("transactions", "accounts")`.
5. Modal closes; recent list and balance card update.

**Touches**: source account balance; transaction list; analytics totals; net worth.

**Edge cases**
- No accounts exist → FAB opens "Add Account" prompt instead of the form.
- User picks an archived account → not possible; archived accounts are filtered out of the picker.
- Source account currency differs from display currency and exchange rate fetch failed earlier → row is created with `rateToDisplay = NULL`; analytics excludes it from totals and lists its currency under "Couldn't get exchange rate for…".
- User adds a contact that the device has since removed → `contactName` is snapshot, so the name persists. Re-querying contacts pickers won't return it.

### 2.2 Create an income
Same as expense, but type = `income`. `delta = +amount`.

### 2.3 Create a transfer (same currency)
1. Type = `transfer`. User picks "From Account" and "To Account".
2. One amount field; `toAmount` stays NULL.
3. On save: `−amount` on source, `+amount` on destination.

**Edge cases**
- From and To are the same account → the form's Save button stays disabled (no inline error message; the user just can't submit).
- One of the accounts is archived → not in pickers.

### 2.4 Create a transfer (cross-currency)
1. Form detects different currencies between From and To accounts. Shows two amount fields: "Amount sent" and "Amount received".
2. On save, `amount` (source ccy) and `toAmount` (dest ccy) both stored. Source side debited by `amount`; destination side credited by `toAmount`.

**Edge cases**
- Editing an existing cross-currency transfer: when reversing the old balance, the destination side uses `existing.toAmount ?? existing.amount` — same fallback when applying the new balance. Test by editing a cross-currency transfer's amount and confirming both balances move correctly.
- Deleting a cross-currency transfer reverses both sides correctly.

### 2.5 Create a transaction with location
**Trigger**: same as 2.1, requires `location_enabled = true` in Settings.

1. "Add Location" button appears under the form.
2. If `auto_add_location = true`, the form fetches automatically on open.
3. `getCurrentLocation` requests permission, tries last-known position first, falls back to a fresh fix with `Accuracy.Low`. Reverse-geocodes for a human name.
4. Coordinates + name stored on the transaction.

**Edge cases**
- Permission denied → friendly message ("Could not get location. Make sure location services are enabled."). Transaction can still be saved without a stamp.
- Reverse geocode fails → coords are kept, name is undefined.
- Auto-add fails silently if `location_enabled` is off (the toggle gates the whole feature).

### 2.6 Edit a transaction
**Trigger**: tap a row in the transaction list, then "Edit".

1. Form pre-populated from the existing row + its subcategory links.
2. Save runs in a SQLite transaction: reverse old balance → update fields → replace subcategory links → apply new balance. Commits atomically; any error rolls back so the row + balance can never desync.
3. Cross-currency transfers correctly reverse the destination side using the *old* `toAmount`, then apply with the *new* `toAmount`.
4. If the original had a `linkedTransactionId` (cashback link), the linked row is deleted before the update — editing an "instant cashback" expense forgets the cashback unless re-toggled in the edit.

**Edge cases**
- User changes the type during edit (e.g. expense → transfer): the reversal-then-apply pattern handles this, but the test path is worth exercising.
- User changes the source account during edit: old account loses the amount; new account gains it.
- User changes the source account to one in a different currency: the stored `currency` / `rateToDisplay` snapshot is **not** rewritten today (only on insert). This is a known tradeoff — historical aggregates remain stable, but the row's currency displayed in the list comes from `accountCurrency` (the join) so it does match the new account's currency.

### 2.7 Delete a transaction
**Trigger**: transaction detail screen → Delete.

1. Confirms ("This action cannot be undone").
2. `deleteTransaction` reverses the balance(s), deletes subcategory links (cascade), deletes the row.

**Edge cases**
- Deleting an "instant cashback" expense → the linked cashback income row is also deleted (link cleanup).
- Deleting a recurring-generated transaction does *not* affect the parent recurring rule's `nextDate`; the rule keeps generating per its schedule.

### 2.8 Filter & search transactions
**Trigger**: Transactions tab → search bar / filter icon.

1. Search bar matches `description` and `notes` (case-insensitive `LIKE %q%`).
2. Filter modal: type, date range, amount range, accounts (from/to), contacts, subcategories.
3. Apply → the list refetches with the merged filters; filter icon shows the active count badge.
4. Subcategory filters with > 900 matches fall back to the first 900 (SQLite variable limit). Rare, but possible at scale.

### 2.9 Pagination on the transaction list
- Default `limit = 30`, scroll triggers `offset += 30` re-queries. No infinite-scroll cap.

**Edge cases**
- New transaction added while scrolling → list invalidates and resets.

### 2.10 Split bill (split an expense among others)
**Trigger**: New Transaction (expense only) → "Split with Others" toggle.

1. User adds people: each is either a contact (from picker) or a free-typed name. Per person: amount they owe, optional "Already paid" checkbox.
2. "Split evenly" button divides the total equally; rounding uses `Math.round` to 2 decimals with remainder distribution so totals reconcile exactly across decimal currencies.
3. On save:
   - The original expense is created normally (source debited by the full amount).
   - For each person, a `loan_lent` account is created (or reused if one already exists for the same `counterpartyContactId`). The new loan account's currency matches the source account's currency. `originTransactionId` on the loan account links it back to the originating expense — used by the transaction-detail screen's "Split debt display" to show settled/remaining status per person.
   - Loan accounts created via split explicitly set `interestRate: null` and `lastInterestDate: null` (so investment-style compounding doesn't accidentally apply to a friend's IOU).
   - The loan **always opens at `+person.amount`** (friend owes user). If `person.paid` is set, a settling transfer is created from the loan account to the source account, draining the loan back to `0` and refunding the source by `person.amount`. Final state: settled loan + correctly-debited source. (Pre-2026-05 builds had a bug here — the loan opened at `0` and the transfer drove it to `−amount`, surfacing as a phantom liability in net worth. Fixed in the 2026-05-05 cleanup.)

**Touches**: `transactions`, `accounts` (potentially many new `loan_lent`), `transactions` again for settling transfers.

**Edge cases**
- Re-splitting with the same contact who already has a `loan_lent` account → existing account is reused; their balance increases by the new amount (no second account created). If "Already paid" is also set, the settling transfer still fires — drains the existing loan back to its prior balance and refunds the source. Net effect on the existing loan = $0.
- Free-typed person (no contactId) → always creates a new loan account; no de-duplication.
- Split toggle is only available on expense type; switching the form to income/transfer hides it.
- Splitting on edit is **not** supported — the split-bill block only runs for new transactions (`!params.id`). Editing an expense that was originally split doesn't recompute the loan accounts.

---

## 3. Accounts

### 3.1 Create an account
**Trigger**: Accounts tab FAB, or "Add Account" modal from no-accounts prompt.

1. User picks a type (credit / debit / savings / wallet / cash / loan_borrowed / loan_lent / investment).
2. Fields shown depend on the type:
   - All: name, institution, color, icon, currency, includeInNetWorth.
   - `credit`: creditLimit, initialBalance (= initial available credit).
   - `loan_borrowed` / `loan_lent`: counterparty (typed or picked from contacts), interestRate, dueDate, loanAmount, **optional Linked account** (see 3.1.1).
   - `investment`: interestRate (annual %).
3. Save → `accounts` invalidates → account appears in the list.

**Edge cases**
- Currency picker locked = false on a brand-new account. After the first transaction lands, it becomes locked (see 3.4).
- Creating a `loan_borrowed` with a positive starting balance is technically allowed but means "lender owes me from day one" — usually a data-entry mistake.

### 3.1.1 Loan with a linked real account (optional)
**Trigger**: New Account form → type = `loan_borrowed` or `loan_lent` → pick a non-loan account in the same currency from the **Linked account** picker.

When a linked account is set, the loan account opens at `balance: 0` and an atomic transfer is created on save so the user doesn't have to record the inflow/outflow manually:

- **Borrowed**: transfer FROM loan TO linked account. End state: loan = `-loanAmount`, linked = `+loanAmount`. Models "the lender wired me the money into my checking account."
- **Lent**: transfer FROM linked account TO loan. End state: linked = `-loanAmount`, loan = `+loanAmount`. Models "I sent the money to the borrower from my checking account."

Both writes happen inside `BEGIN/COMMIT/ROLLBACK` — partial failure rolls back so neither side ends up out of sync.

**Touches**: `accounts`, `transactions`. Both invalidate together.

**Edge cases**
- The linked-account picker only appears when at least one same-currency non-loan account exists. With a brand-new install (no other accounts), the field is hidden — the user falls back to setting initial balance directly.
- Changing the loan currency or switching type away from a loan resets the linked-account selection.
- Linked is **create-only**: the field doesn't appear when editing an existing loan. To add money to an existing loan account after the fact, create a transfer manually.
- Cross-currency linking is not supported in v1 — the picker filters out accounts in different currencies. (Cross-currency loan disbursement adds `toAmount` UX complexity that's out of scope for now.)

### 3.2 Account detail screen
Shows balance/debt/available credit (depending on type), transactions for this account, and type-specific action buttons:
- **`credit`**: "Pay Card" → opens a payment flow that creates a transfer from a chosen debit/cash account to this card. The "from" picker **excludes the card itself** so the user can't accidentally create a `from == to` transfer.
- **`loan_borrowed`**: "Make Payment" → transfer from a debit/cash account to this loan account (raises balance toward zero). "Pay Full" computes the remaining and pre-fills.
- **`loan_lent`**: "Receive Payment" → transfer from this loan account to the chosen receiving account. "Pay Full" pre-fills the remaining.
- **All types**: quick-add expense / income / transfer pre-filled with this account.

**Edge cases**
- "Pay Full" amount exceeds remaining (shouldn't, but if user typed a value first) → "Amount exceeds remaining balance" inline error. Loan overpayment is capped at the remaining balance with a warning.
- After "Pay Card" or "Make Payment", balances of *both* sides update because it's a transfer; net worth adjusts accordingly.
- The PaymentModal resets its state (amount, picked from-account) on every open — re-opening doesn't carry over a half-filled previous attempt.

### 3.3 Archive vs delete an account

**Archive**
1. Account form → "Archive Account".
2. Sets `isActive = false`. Hidden from the main list; "Show Archived" toggle in the header reveals them.
3. Restore = `isActive = true`.

**Delete**
1. Account form → "Delete Account" → confirm.
2. If any transaction references this account (source, transfer destination, or cashback destination), `deleteAccountPermanently` throws `AccountInUseError`. The form catches it and shows the "Can't delete — archive instead" modal.
3. Otherwise the row is removed.

**Edge cases**
- Account is the cashback destination on someone else's card's expense → still blocks delete.
- Foreign keys are *not* enforced by SQLite by default in expo-sqlite. The check is in code; a malformed external import that bypasses the check could orphan rows.

### 3.4 Edit an account's currency (blocked path)
1. User opens account form for an existing account; currency picker is **locked** if any transaction (regular, transfer dest, cashback dest) references it.
2. If the user somehow submits a currency change anyway (shouldn't be reachable), `updateAccount` throws `AccountCurrencyLockedError` and a "Can't change currency" modal appears.
3. Workaround: archive the account, create a new one in the new currency.

### 3.5 Edit a credit card's limit (limit-delta behavior)
**Trigger**: Account form for a credit card → change `creditLimit`, leave the balance field untouched.

1. Form detects that the limit changed and the balance input was not interacted with (touched-ref, not float equality — retyping the same value doesn't trigger).
2. On save, `balance` is shifted by the limit delta so that `debt = creditLimit − balance` stays constant. From the user's POV: "the bank raised my limit by 1M; my debt didn't change, my available credit just went up by 1M."

**Edge cases**
- User changes both limit *and* balance → the touched-ref is set, no auto-shift; the user's explicit balance wins.
- User retypes the same balance value → ref is set as a side-effect, no auto-shift fires. Acceptable trade — it's the safer direction.

### 3.6 Cross-currency on account detail
- Account totals always display in the account's own currency.
- The home/analytics screens convert into the user's display currency.

---

## 4. Categories

### 4.1 Create a category
**Trigger**: Categories tab FAB.

1. Form: name, color, icon (icon picker has a search), isIncome / isExpense flags.
2. On save, the category is created with `isSystem = false` and a `General` subcategory is auto-inserted.

### 4.2 Edit a category
- System categories: rename / icon / color allowed.
- Hard delete blocked for system categories (no-op). User-created: soft-deleted via `isActive = false`.

### 4.3 Manage subcategories
**Trigger**: Category detail screen.

1. Add a new subcategory (name only).
2. Rename a subcategory by tapping its name (inline edit).
3. Delete a non-`General` subcategory → soft-deleted. Past transactions referencing it still display the link in their subcategory list.

**Edge cases**
- Trying to delete `General` → `deleteSubcategory` is a no-op for `isGeneral = true` rows.
- A transaction with multiple subcategories spanning two categories: `getCategorySummary` divides the row's amount by the link count to avoid double-counting.

---

## 5. Recurring transactions

### 5.1 Create a recurring rule
**Trigger**: Settings → Recurring Transactions → FAB.

1. Form: type (income / expense), amount, description, account, frequency, next date, optional end date, optional dayOfMonth/dayOfWeek/timeOfDay.
2. Currency + rate are captured at create-time, same as regular transactions.

### 5.2 Auto-trigger on app foreground
See 1.2. `processDueRecurring` walks active rows where `nextDate ≤ today`:
- For each item, captures *one* rate snapshot (today's), then loops creating one transaction per missed period until `nextDate > today`.
- Only the row dated today gets the captured rate stamped; backdated rows leave rate fields NULL.
- If gap > 90 days, creates only one transaction (today) and skips the rest.
- If end date passed, the rule deactivates after the final occurrence.

**Edge cases**
- App foregrounded multiple times in one day → second run finds `nextDate > today` and does nothing.
- User changes device clock backwards → rules with a `nextDate` after the new "today" simply won't trigger until the date catches up. Don't lean on this for QA — clock-tampering is out of scope.
- Recurring rule's account is archived → catchup still creates the transaction; balances on the archived account update. (Worth deciding if this is desired.)

### 5.3 Pause / resume
**Trigger**: Recurring detail → Pause toggle.

- Pause: `isActive = false`. Catchup skips it.
- Resume: `isActive = true`. Next foreground will catchup any periods missed *while paused* (subject to the 90-day cap).

### 5.4 Trigger now
**Trigger**: Recurring detail → "Trigger Now" → confirm.

1. Creates one transaction for today (with today's rate captured).
2. Advances `nextDate` to the next occurrence after today.
3. Deactivates if past `endDate`.

### 5.5 Edit / delete a recurring rule
- Edit: form like create, prepopulated.
- Delete: removes the rule and its subcategory links (cascade). **Past generated transactions remain.**

### 5.6 Smart upcoming on Home
The Home "Upcoming" list filters to `nextDate ≤ 30 days from today`, then drops items whose last generated transaction was less than half a frequency-period ago — keeps items from showing twice in quick succession after manual triggers.

---

## 6. Templates

### 6.1 Create a template
**Trigger**: Settings → Templates → FAB.

Form: name, icon, type, amount, description, account, optional subcategories + contact. All fields optional except name + type.

### 6.2 Apply a template in the new-transaction form
**Trigger**: at the top of the New Transaction modal, a horizontal strip of template chips.

1. Tap a chip → form fields populate from the template.
2. User can edit any field before saving.
3. Saving creates a normal transaction; **no link** to the template (templates are starting points, not parents).

### 6.3 Edit / delete templates
Standard CRUD via the template list screen.

---

## 7. Cashback

> **Cashback is per-transaction only.** No rules engine ships. All cashback flows go through the new-expense form.

### 7.1 Instant cashback on a single expense
**Trigger**: New transaction (expense) → "Instant cashback" toggle on, "Confirm Cashback Received" on.

1. User picks mode (flat or %), enters value, picks the cashback destination account.
2. **Smart default**: when cashback is toggled on (and the user hasn't manually picked a destination), the destination defaults to the **from-account** of the transaction. If the user later changes the from-account before save, the destination follows — until the user picks a specific destination from the modal, at which point the auto-tracking stops.
3. On save, the form creates **two** rows:
   - The expense itself, with `cashbackAmount` populated.
   - An income row in the destination account (description: "Cashback: …"), linked back via `linkedTransactionId`.
4. Editing the original cashback expense deletes the old linked row and re-creates it from the edited form values; deleting the original cascades the link.

### 7.2 Pending cashback (mark as received later)
**Trigger**: same form, "Confirm Cashback Received" toggle off.

1. Expense saves with `cashbackAmount` and `cashbackAccountId` set, but no income row.
2. From the transaction detail screen, user taps "Confirm Cashback Received" → the linked income row is created in the cashback destination account at that point.

**Edge cases**
- Editing a pending cashback transaction's destination account before confirming — the new value persists and the eventual confirm uses it.
- Privacy mode is respected throughout: pending and confirmed amounts route through `AmountDisplay`.

---

## 8. Backup, restore, import, export

### 8.1 Auto backup
- Runs on app foreground if `backup_enabled = "true"` and no auto backup exists with today's date.
- File written to the user's chosen folder (Android SAF) or the app's `documents/backups/` (iOS or no folder set).
- Pruned to `backup_keep_count` most recent (default 2). Old files deleted from disk; rows removed from `backups`.

### 8.2 Manual backup
**Trigger**: Settings → Backup → "Backup Now".

- Creates a non-pruned (`isAuto = false`) backup. Counts toward visible history but not toward the keep-count cap.

### 8.3 Export (share)
**Trigger**: Settings → Backup → "Export (Share)".

- Writes the JSON to the cache directory and opens the system share sheet. User picks a target (cloud storage, email, etc.). The cache file is ephemeral — no row added to `backups`.

### 8.4 Restore from a backup file in the app
**Trigger**: Backup history list → tap a backup → Restore → confirm.

1. Reads the file content (SAF or local).
2. `restoreData` runs inside `BEGIN TRANSACTION`: deletes every table in dependency order, inserts from the backup, COMMIT. Any error → ROLLBACK; current data untouched.

**Edge cases**
- Backup file moved/deleted in the user's file manager (SAF) → restore fails with "Backup file not found or no longer accessible". Row remains in `backups` until the user deletes it.
- File is not a valid backup (missing `version`, `accounts`, or `transactions`) → "Invalid backup file format".
- User rotates devices: copy the backup file out via Export, sideload to the new device, use Import.

### 8.5 Import a backup file from disk
**Trigger**: Settings → Backup → "Import".

1. Document picker (JSON only).
2. Confirms the destructive replace.
3. Same `restoreData` path as 8.4.

### 8.6 Pick / change / clear the Android external folder
**Trigger**: Settings → Backup → Backup folder.

- **Pick**: `requestDirectoryPermissionsAsync` SAF flow → finds or creates a `MyWallet` subfolder inside the chosen directory → persists the URI. Existing internal-storage backups are migrated (`migrateLegacyBackupsToFolder`) — copied to the new folder, internal copy deleted, DB row updated. Stale rows (file gone) are removed.
- **Change**: same as Pick. Older backups stay in their original location (the migration only runs on the *current* internal-storage rows; backups already in another SAF folder don't get re-moved).
- **Clear**: erases `backup_folder_uri`. New backups go to internal storage. Existing backups are *not* moved back.
- **Permission revoked externally**: the next attempt to read or list fails. UI shows "Permission to the backup folder was lost. Pick it again."

### 8.7 First-launch backup setup gate
1. After migrations + seed, if `backup_setup_done` is unset, the modal appears blocking the app.
2. User chooses a folder (Android), reads the iOS explanation, or skips with confirm.
3. Setting flips to `"true"`; modal dismisses; foreground tasks (recurring catchup, auto backup, etc.) finally run.

---

## 9. Settings

### 9.1 Change display currency
**Trigger**: Settings → Display Currency.

1. Picker shows supported currencies.
2. Changing it shows a confirmation: "Switching from X to Y will mark older transactions as approximate…".
3. On confirm: setting is updated; aggregates re-query; rows whose `displayCurrencySnapshot` ≠ the new currency fall back to today's rate (UI shows "≈" banner).

**Edge cases**
- Multi-currency portfolio + offline at switch time → analytics may exclude rows whose currency has no rate available; user sees "Couldn't get exchange rate for Z".

### 9.2 Update exchange rates manually
**Trigger**: Settings → "Update exchange rates".

- Hits the API regardless of cache age. On success: cache updated, "Last updated: now". On failure: "Update Failed".

### 9.3 Change language
**Trigger**: Settings → Language.

- Switches `i18next` instance and persists the choice. Five locales: en, es, pt, ja, zh.
- All user-visible strings re-render via `useTranslation`. Default categories use translation keys, so they retitle too.

### 9.4 Toggle privacy defaults
**Trigger**: Settings → Privacy.

- "Hide amounts on open" → `privacy_hide_default`. Activates on every app launch.
- "Random numbers on open" → `privacy_random_default`. Same.
- These are *defaults* — within a session the user toggles freely (eye icon on Home, etc.) and the in-session state is what's actually shown.

### 9.5 Toggle location & auto-location
**Trigger**: Settings → Location Stamps + sub-toggle Auto.

- Location off → no location button on the form.
- Location on, auto off → button visible, fetches on tap.
- Location on, auto on → fetches on form open.

### 9.6 Open Recurring / Templates / Themes / Backup / Changelog
Each is its own screen reachable from Settings. Recurring and Templates have their own FABs; Themes and Backup are managed inline.

### 9.7 Security: biometric + PIN setup
**Trigger**: Settings → Security.

1. **Authentication methods**:
   - **Biometric** Switch — disabled with helper text when the device has no biometric hardware or the user hasn't enrolled biometric at the OS level. Otherwise toggling on writes `security_biometric_enabled = "true"`.
   - **Set / Change PIN** row → opens `PinEntryModal` in setup mode. The user enters the PIN twice; mismatch resets to phase 1 with a "PINs don't match" error. On a confirmed match, the PIN is hashed (`sha256(salt + pin)` with a fresh 16-byte salt) and stored.
   - **Remove PIN** row → confirm dialog explains the consequences ("if biometric also fails, protected actions will run without auth"), then clears the hash + salt.
2. **Protected actions** section — each its own Switch. Switches are disabled with a hint when neither biometric nor PIN is configured. Toggle on writes `security_protected_<action> = "true"`.

**Edge cases**
- Toggling biometric on when hardware is present but not enrolled: the switch refuses to flip; helper text directs the user to OS settings.
- Removing the PIN while biometric is also off effectively disables all protections — the gate hook falls through and runs callbacks unconditionally. The confirm dialog spells this out.
- The "random by default" toggle is *not* protected (only affects future cold starts).

### 9.8 Disabling random-numbers (when protected)
**Trigger**: Settings → Privacy → "Random numbers" → toggle off, with `security_protected_random_toggle = "true"` and at least one auth method configured.

1. The toggle's onValueChange detects the off direction and calls `useAuthGate("random_toggle").guard(...)`.
2. If biometric is on + enrolled, the OS biometric prompt appears.
3. If biometric isn't configured or fails/cancels, and a PIN is set, `PinEntryModal` opens in verify mode.
4. On success, the random-numbers privacy mode turns off. On cancel, the switch remains in the original (on) position.

Turning random ON is unprotected — it increases protection.

### 9.9 Opening Backups (when protected)
**Trigger**: Settings → Backup row → tapping it, with `security_protected_backup = "true"`.

Same gate flow as 9.8: biometric → PIN → navigate. On cancel, navigation is aborted. The Backup screen itself is unchanged once opened.

---

## 10. Privacy

### 10.1 Hide amounts in-session
**Trigger**: eye icon on the Home balance card.

- All `AmountDisplay` instances show `••••`. Real numbers preserved in storage; only render is masked.

### 10.2 Random numbers in-session
**Trigger**: Settings → Privacy → Random numbers (toggle).

- `maskAmount` returns a stable random number per real amount per session (same expense always shows the same fake number while the app is open). Magnitude preserved.
- Restart app → fresh mapping.

**Edge cases**
- Both toggles on simultaneously → "hide" wins; user sees `••••` and the random mapping is irrelevant until they hide is off.

---

## 11. Themes

### 11.1 Activate a built-in theme
**Trigger**: Settings → Themes → tap a theme.

- `setThemeId(id)` flips `isActive` flags so only this row is true and writes `active_theme_id`.
- All `useTheme()` consumers re-render with the new palette. Status bar style follows the theme.

### 11.2 Reset to system default
**Trigger**: Settings → Themes → Reset.

- `setThemeId(null)` deactivates all themes; clears `active_theme_id`. Theme follows device's `useColorScheme`.

### 11.3 Create a custom theme
**Trigger**: Settings → Themes → Create New Theme.

- Form: name, mode (light/dark), accent color, status bar style (light/dark/auto).
- Saved like any other theme; user can activate it from the list.

### 11.4 Delete a custom theme
**Trigger**: Theme row → Delete.

- Hard delete. If the deleted theme was active, the user falls back to system.

---

## 12. Analytics

### 12.1 Browse months
**Trigger**: Analytics tab → arrows to navigate.

- Each month: total income, total expense, net, daily-spending chart, top categories, top contacts.
- Multi-currency rows are converted via stored rate; rows without a stored rate fall back to today's (banner: "Totals converted at today's rate"); rows with no rate available are excluded ("Couldn't get exchange rate for X").

### 12.2 Six-month trend
- Last 6 months income/expense bars. Months with no activity render as zero rather than gaps.

### 12.3 Insights (savings rate, vs last month, projected end of month)
- Computed from the current month's running totals.
- Projected end-of-month is a linear extrapolation: `(currentExpenses / daysSoFar) × daysInMonth`. Sensitive early in the month.

### 12.4 Top contacts (this month)
- Aggregates expenses with a `contactId`, sums per contact, returns top N. Groups by contact ID, not name (so rename-after-split still groups correctly).

---

## 13. Contacts

### 13.1 Pick a contact during transaction creation
**Trigger**: New Transaction → Contact field.

1. First open requests `expo-contacts` permission. Result cached in module state (`_hasPermission`) for the session.
2. The picker loads the **first page** of device contacts (`PAGE_SIZE = 50`) immediately, in parallel with the frequents query — so the user sees results without typing.
3. "Frequents" section: derived from prior transactions, capped at 5 — top 4 most-used contacts plus the contact from the most recent transaction (skipped if it duplicates a frequent).
4. Scrolling near the bottom of the contact list triggers `loadMore` for the next page (infinite scroll). When the device runs out of contacts, the cursor stops.
5. Typing ≥ 2 characters switches to **server-side search** via `searchContacts(query)` (calls `Contacts.getContactsAsync({ name: query })` against the device, page size 20). This *replaces* the paged list, not filters it; clearing the search restores the paginated list.

**Edge cases**
- Permission denied → "Contact permission denied" message. User can still type a name (free text) — but this path lives in split-bill rather than the standard contact picker.
- Device contact deleted later → still appears in "Frequents" because it's derived from `transactions.contactName` snapshots, not the device address book.
- Searching with < 2 characters → no-op (the search service short-circuits empty/short queries).

### 13.2 Contact detail screen
**Trigger**: tap a contact name on a transaction row → contact detail screen.

- Lists transactions for that contact.

---

## 14. Cross-cutting test ideas

These touch multiple flows. Worth running periodically:

- **Round-trip a backup**: create a complex state (multi-currency, credit card, loan, recurring, cashback), export, import on a fresh install, verify everything matches.
- **Cross-currency edit**: create a USD→EUR transfer, edit the amount, confirm both balances move correctly. Then change the source account to a third currency and confirm.
- **Missing rate path**: airplane mode + first install + foreign-currency account → analytics totals; confirm "Couldn't get exchange rate" appears.
- **90-day catchup cap**: set a daily recurring with a `nextDate` 120 days ago → next foreground creates exactly one transaction (today) and bumps `nextDate`.
- **Account currency lock**: create an account, add a transaction, try to change its currency → blocked.
- **Account hard-delete blocked**: same as above but try to delete → blocked with txn count.
- **System category protection**: try to delete a default category → no-op; subcategory `General` likewise can't be deleted.
- **Privacy eye toggle**: hide amounts; navigate Home → Transactions → Analytics → Account detail; confirm every number is masked.
- **Random numbers stability**: same expense viewed in two screens within the session shows the same fake number.
- **Folder permission revoked**: pick external folder, revoke in OS settings, return to app → next backup fails gracefully; UI tells user to repick.
- **Investment compounding gap**: leave an investment account dormant for 30 days, then add a positive balance → no retroactive interest applied for the dormant period.
- **Linked-cashback edit**: edit an instant-cashback expense and turn the toggle off → linked income row deleted.
- **Split bill**: create an expense split among 3 people (one already paid) → 2 new `loan_lent` accounts created, 1 settling transfer, original expense unchanged; net worth impact is the un-paid portion.
