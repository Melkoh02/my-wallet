# Glossary

The vocabulary the rest of the codebase assumes you already know. Read this before `flows.md` or `architecture.md`.

> **Conventions**
> Field names in this doc reference actual columns/fields in the source — search them by name to find usages. Anywhere a value is "computed, not stored", the canonical formula is given here.

---

## Money & balances

### `balance`
A signed number on every account that always represents *the account's value from the user's perspective*. Across **all** account types, **expense decreases balance, income increases it.** No special-cased delta directions. The interpretation of the number changes by account type, but the direction of every transaction does not.

> **Account type strings**: the canonical union and constants live at `src/types/enums.ts` (`AccountType`). The `accounts.type` column is `text`, but every type-filtered query, every form switch, and the classification block in `getAccountsTotals` reads from this union. When you add or rename a type, start there.

| Account type    | What `balance` means                                    | Sign in normal use |
| --------------- | ------------------------------------------------------- | ------------------ |
| `debit`         | Funds in the account                                    | ≥ 0                |
| `cash`          | Cash on hand                                            | ≥ 0                |
| `wallet`        | Cash in a wallet/e-wallet                               | ≥ 0                |
| `savings`       | Funds in the account                                    | ≥ 0                |
| `credit`        | **Available credit** (limit minus debt)                 | ≥ 0; negative if overpaid |
| `loan_borrowed` | The user's net position vs. the lender                  | ≤ 0 while owed; > 0 if overpaid |
| `loan_lent`     | What the counterparty still owes the user               | ≥ 0; < 0 if user overpaid the counterparty |
| `investment`    | Current value of the investment                         | ≥ 0                |

### `debt` (credit cards)
**`debt = creditLimit − balance`**. Computed on the fly, never stored. A credit card with `creditLimit = 12_000_000` and `balance = 5_000_000` has `debt = 7_000_000`. If `balance > creditLimit`, the card is overpaid (negative debt → counts as an asset in net worth).

### Net worth
Sum of all accounts where `includeInNetWorth = true`, converted to display currency. The classification rules are in `getAccountsTotals`:
- `credit`: `debt > 0` → liability; `debt < 0` → asset (overpaid card).
- `loan_borrowed`: `balance < 0` → liability; `balance > 0` → asset (overpaid loan).
- Everything else: `balance ≥ 0` → asset; `balance < 0` → liability.

`netWorth = totalAssets − totalLiabilities`. Negative net worth is meaningful — it means the user owes more than they have.

### `includeInNetWorth`
Per-account opt-out. The account still tracks its own transactions and balance; it just doesn't roll into net worth or the home screen totals. Used for accounts the user wants to track separately (e.g. someone else's card you carry, an experiment).

---

## Account types in detail

### `loan_borrowed`
Money the user **owes**. Created with a starting `balance` typically negative (e.g. user borrowed 1000 → balance = −1000). Receiving money from the lender (income) makes it more negative; paying the lender (expense / transfer out from a debit account) makes it less negative. When `balance` crosses 0 the loan is settled; positive means the user overpaid (lender owes them money). Optional fields: `interestRate`, `dueDate`, `counterparty`, `counterpartyContactId`.

> **Interest accrual** (`applyLoanInterest` in `src/db/queries/interest.ts`): when `interestRate` is set, the daily-compound formula `balance × (1 + rate/100/365)^days` runs on each app foreground. The same multiplier preserves sign — `-1000 × 1.05 = -1050` — so a single formula handles both loan directions. Settled (`balance = 0`) or overpaid (`balance > 0` for borrowed) loans skip the compound and just advance `lastInterestDate`, so a future sign flip doesn't retroactively accrue. New loans stamp `lastInterestDate` at creation; legacy loans (interestRate set, lastInterestDate null) compound from `createdAt` on their first run.

> **Linked-account create flow**: at create time, AccountForm has an optional "Linked account" picker for `loan_borrowed` and `loan_lent`. If set, the loan account opens at `0` and an atomic transfer is created — `loan_borrowed` ⇒ transfer FROM loan TO linked (loan ends at `-amount`, linked at `+amount`), modelling "the lender deposited the money into my real account." Avoids the prior workflow of creating the loan AND a separate income transaction. Same-currency only in v1; create-only (not exposed on edit). See `flows.md` §3.1.1.

### `loan_lent`
Money the user **lent out**. Starts positive (user lent 1000 → balance = 1000). Payments from the counterparty are recorded as transfers *into* the user's debit/cash account, drawing this account's balance down toward zero. A `loan_lent` account is also created automatically by **Split Bill** for each owing person.

> **Interest accrual**: same `applyLoanInterest` as `loan_borrowed` — the canonical "owed" sign flips (positive for `loan_lent`), but the formula and skip logic mirror exactly. See `loan_borrowed` above.

> **Linked-account create flow**: same as `loan_borrowed` (above), but the transfer goes the other way — FROM the linked real account TO the loan (linked at `-amount`, loan at `+amount`), modelling "I sent the money to the borrower from my checking account."

### `credit`
Card with a `creditLimit` and a `balance` representing **available credit, not debt**. This inversion is the single most non-obvious thing in the codebase — see the migration note below.
- Spending on the card → expense → balance decreases (less credit available).
- Paying the card → transfer from debit/cash → balance increases (more credit freed up).
- Cashback payouts and refunds → income → balance increases.

> **Limit adjustment on edit**: when the user edits a credit card and changes `creditLimit` *without touching the balance field*, `balance` is shifted by the limit delta so that `debt = creditLimit − balance` stays constant. This matches the user's intent when their bank raises or lowers the limit ("my debt didn't change, my available credit did"). The "didn't touch the balance field" is detected by a touched-ref, not float equality, so retyping the same value doesn't silently trigger the shift. (See changelog v1.6.0.)

> **Historical note**: in v1.0.0, `balance` for credit cards meant *debt* (expense increased it). v1.0.1 inverted the semantics. The one-time migration `migrateCreditCardBalances` in `DatabaseProvider.tsx` (gated by the `credit_balance_migrated` setting) flipped existing rows: `newBalance = creditLimit − oldBalance`. Don't reintroduce the old semantics without rerunning a migration.

### `investment`
Has an optional `interestRate` (annual %). On every app foreground, `applyInvestmentInterest` (in `src/db/queries/interest.ts`) compounds daily: `newBalance = balance × (1 + rate/100/365) ^ days`, where `days` is `today − lastInterestDate`. Zero or negative balance just advances `lastInterestDate` without compounding (so the account doesn't accrue retroactive interest after a withdrawal-to-zero). Shares the `accrueOne` core with `applyLoanInterest`; the type-specific predicate decides "compound or just bump the date."

---

## Transactions

### Types
- `expense` — outflow from the source account. `delta = −amount` on `accountId`.
- `income` — inflow into the source account. `delta = +amount` on `accountId`.
- `transfer` — moves between two accounts. `delta = −amount` on `accountId`, `+amount` (or `+toAmount` for cross-currency) on `toAccountId`.

### `amount` vs `toAmount`
- `amount` is always in the source account's currency (`accountId.currency`).
- `toAmount` is set **only on cross-currency transfers**: it's the amount that landed in the destination account, in *that account's* currency. NULL for same-currency transfers and non-transfer rows.
- When applying or reversing a transfer's destination side, callers must use the **`transferDestAmount(txn)` helper** in `src/db/queries/transactions.ts`. It returns `txn.toAmount ?? txn.amount` and centralises the rule across all four call sites (createTransaction, deleteTransaction, edit-reverse, edit-apply). Don't reach into `txn.toAmount` directly at the call site — collapsing the fallback corrupts one currency case or the other.

### Currency snapshot fields
Three columns on every transaction (`currency`, `rateToDisplay`, `displayCurrencySnapshot`), captured at insert time by `captureRateForCurrency`. Together they make historical aggregations stable:
- **`currency`** — source currency at insert time. Backfilled from `accounts.currency` for pre-Phase-2 rows by `backfillTransactionCurrency`.
- **`rateToDisplay`** — multiplier such that `amountInDisplay = amount × rateToDisplay`. NULL when no rate was available, or for backdated catchup rows.
- **`displayCurrencySnapshot`** — the display currency at the moment `rateToDisplay` was captured. Lets `convertRow` detect when the user has since changed display currency (stored rate no longer applies → fall back to today's rate, marked approximate).

### Three states a row can be in during conversion (`convertRow`)
The function returns a tagged union (`{ state: "converted", value, usedTodaysRate } | { state: "excluded", currency }`) that maps to three semantic outcomes:
1. **Stable.** `state: "converted"`, `usedTodaysRate: false`. Stored rate matched today's display currency. Use the stored rate.
2. **Approximate.** `state: "converted"`, `usedTodaysRate: true`. Stored rate missing or snapshot outdated; today's rate used as fallback. Aggregate surfaces `usedTodaysRate: true` so UIs show the "≈" banner.
3. **Excluded.** `state: "excluded"`. No rate available at all. Row is dropped from the total; `currency` (when not null) is added to `missingRates` so the UI lists the excluded currencies.

The tagged union is enforced at the type level — collapsing `excluded` to a numeric zero won't compile.

### `linkedTransactionId`
Soft pointer between two transactions that semantically belong together. Used by **instant cashback** (links the original expense to the cashback income row) and to keep edits/deletes consistent: editing the original deletes the old linked row before recreating; deleting the original cascades the link target.

### `recurringId`
Set on transactions generated by `processDueRecurring` or `triggerRecurringNow`. The recurring detail screen uses this to list "Generated Transactions". Manual transactions never have it.

---

## Categories & subcategories

A category has many subcategories. Each subcategory belongs to exactly one category. **Transactions link to subcategories, not categories** (via `transaction_subcategories`).

- Every category — including ones the user creates — gets a `General` subcategory automatically (`isGeneral = true`). It's the safe default and **cannot be deleted**.
- Categories seeded on first launch have `isSystem = true`. They can be edited (rename/icon/color) but not hard-deleted; `deleteCategory` for a system category is a no-op. User-created categories are soft-deleted (`isActive = false`).
- A transaction can have multiple subcategories (`transactionSubcategories` is many-to-many). When that happens, `getCategorySummary` divides the amount by the number of links so the row isn't double-counted across categories.
- Categories carry `isIncome` and `isExpense` as independent booleans — a category can be one, the other, or both.

---

## Recurring transactions

### Lifecycle
Created with a `frequency` (`daily | weekly | biweekly | monthly | yearly`), a starting `nextDate`, and optional `endDate`, `dayOfMonth`, `dayOfWeek`, `timeOfDay`. The form pre-captures currency + rate the same way regular transactions do.

### Catchup (`processDueRecurring`)
Runs on every app foreground (after seed/migrations, only when backup setup is dismissed). Walks all active rows where `nextDate ≤ today` and creates one transaction per missed occurrence, advancing `nextDate` each time.

- **Cap: `MAX_CATCHUP_DAYS = 90`.** If `nextDate` is more than 90 days behind, the catchup creates **only one** transaction (dated today) and skips ahead — protects against runaway entry creation after a long offline period.
- **Rate capture on catchup**: a single rate is captured *once per item* before the loop. Only the row dated today gets the captured rate stamped; backdated rows leave the rate fields NULL on purpose, so aggregations correctly mark them approximate (today's rate ≠ rate at the date the row is dated).
- **End date enforcement**: when the next computed date passes `endDate`, the recurring row is deactivated (`isActive = false`).

### `triggerRecurringNow`
User-invoked from the recurring detail screen ("Trigger Now"). Creates one transaction for today, captures today's rate, and advances `nextDate` to the next occurrence after today. Useful when a salary or bill arrives early.

### Smart upcoming (`getSmartUpcoming`)
The home screen's "Upcoming" list. Filters to active items with `nextDate` within 30 days, then drops any whose last generated transaction was less than half a period ago — prevents the same item from showing twice in quick succession after a manual trigger.

---

## Templates

Quick-fill shortcuts for the new-transaction form. A template is a frozen snapshot of fields (type, amount, account, category, contact, etc.). Picking one in the form pre-fills those fields; the user can still edit before saving. Templates **don't auto-generate transactions** — that's recurring's job. A transaction created from a template is just a normal transaction with no link back.

---

## Cashback

Cashback is **defined per transaction**, not by any rule engine. There are exactly two modes, both set on the new-expense form:

1. **Instant cashback**. User toggles "Instant cashback" while creating an expense, picks flat-or-percentage and a destination account. On save, `transaction/form.tsx` writes *two* rows: the expense itself and a linked income row in the destination account, joined via `linkedTransactionId`. Editing or deleting the original cleans up the link target.
2. **Pending cashback**. Same fields are filled in, but the income row isn't created yet. The expense carries `cashbackAmount` and `cashbackAccountId`; from the transaction detail screen, the user later confirms receipt and the linked income row is created at that point.

### Cashback receipt direction
Cashback is **always income to the cashback destination account**. The destination is often the same card the expense was charged on, in which case `cashbackAccountId === accountId` — but the model is still "expense out, income in" as separate rows.

---

## Privacy modes

### `hideAmounts`
UI-only. `AmountDisplay` renders `••••` instead of the number. The underlying data is unchanged.

### `randomNumbers`
UI-only. `maskAmount(real)` returns a stable fake number for that real amount within a session (cached in `randomCache`). Same input → same output for the duration of the app process. Magnitude is roughly preserved — the fake is drawn from `[0.1×magnitude, 2.1×magnitude]`, so a 5-digit input might emit a 4-, 5-, or 6-digit fake. Restart the app and the mapping is fresh.

### Defaults on open
`privacy_hide_default` and `privacy_random_default` settings (booleans-as-strings). When `true`, the corresponding flag activates each time the app launches, regardless of where the user left it.

---

## Currency & exchange rates

### Display currency
Per-user setting (`display_currency`, default `USD`). Every total — net worth, month income/expense, analytics, account totals — is converted to this currency before being shown. New databases don't seed this key — `getDisplayCurrency` falls back to `USD` when unset, so the seed would be redundant.

### `CurrencyConverter` (`exchangeRate.service.ts`)
Pre-loads display currency + rates **once** so aggregate queries can convert synchronously over many rows. `convert(amount, fromCurrency)` divides by the rate (since the API expresses rates as "1 displayCurrency = N fromCurrency"). `hasRateFor` lets callers detect missing rates.

### Rate fetch policy
`getExchangeRates` returns cached rates if cached base matches display currency and cache age < 24h. Otherwise fetches from `open.er-api.com` (no API key). On fetch failure, falls back to **stale cache** if available; only falls back to 1:1 as a last resort. `checkAndFetchRates` runs on app foreground only when at least one account uses a non-display currency.

### Rate capture at insert (`captureRateForCurrency`)
Stores `rateToDisplay = 1 / apiRate` so multiplication is forward-conversion. Returns `rateToDisplay = null` when no rate is available — the row's amount is still recorded, but aggregates will exclude it (or fall back to today's rate later).

### Approximate marker
Aggregates return `usedTodaysRate: boolean` and `missingRates: string[]`. Screens use them to show:
- A "totals converted at today's rate" banner when `usedTodaysRate`.
- A list like "Couldn't get exchange rate for ARS, JPY" when `missingRates` is non-empty.

### Currency lock on accounts (`AccountCurrencyLockedError`)
Once an account has *any* transaction (regular, transfer destination, or cashback destination), its currency cannot be changed. Changing it would silently invalidate every linked transaction's stored `rateToDisplay`. Workaround: archive the account and create a new one in the new currency.

---

## Accounts: archive vs delete

- **Archive** (`archiveAccount`): sets `isActive = false`. Account hidden from main lists; transactions remain. Reversible (`unarchiveAccount`).
- **Delete** (`deleteAccountPermanently`): hard-deletes the row. **Refused** (throws `AccountInUseError` with the txn count) if any transaction references the account as source, transfer destination, or cashback destination.

> **Why the manual check**: `expo-sqlite` leaves `PRAGMA foreign_keys = OFF` by default, so the FK clauses in the schema don't actually prevent orphans. The query layer enforces it instead.

---

## Backups

### File format
Single JSON file: `{ version: 1, exportedAt, accounts, categories, subcategories, transactions, transactionSubcategories, recurringTransactions, recurringSubcategories, themes, settings, templates, templateSubcategories }`. `BACKUP_VERSION = 1` — bump if the format changes. (Older backups created before v1.8.x include a `cashbackRules` array; the import path silently ignores it now that the table is gone.)

### Auto vs manual
- **Auto** (`isAuto = true`): created by `checkAndRunAutoBackup` on app foreground when `backup_enabled = "true"` and there's no auto backup dated today. Pruned to `backup_keep_count` (default `2`) most recent.
- **Manual** (`isAuto = false`): "Backup Now" button. Not subject to the keep-count prune.
- Both are tracked in the `backups` table with `filename`, `filePath`, `sizeBytes`.

### Storage location
- **Default (Android & iOS)**: app-private `documentDirectory/backups/`. Lost on uninstall.
- **Android with SAF folder**: user picks an external folder; the service creates/reuses a `MyWallet` subfolder inside it (`pickBackupFolder`) and stores the SAF tree URI in `backup_folder_uri`. Survives uninstall. `migrateLegacyBackupsToFolder` copies prior internal backups into the new folder when the user picks one.
- **iOS**: backups land in the app's Files-app-visible directory; no SAF equivalent. The setup modal's iOS variant explains this.

### Restore (`restoreData`)
**Wraps the whole import in a SQLite transaction**. Deletes every table in dependency order, then inserts in the reverse order. On any error, the transaction rolls back — *no partial state*. Used by both "Restore Backup" (pre-existing backup row) and "Import" (user-picked file).

### Backup setup gate
On first launch (or when `backup_setup_done` is unset), `DatabaseProvider` flips `needsBackupSetup` and `BackupSetupModal` blocks the main app stack. The user picks a folder (Android) or just acknowledges (iOS), then setting flips to `"true"` and the gate releases.

---

## Settings keys

Stored in the `settings` table, every value is a string.

| Key                        | Purpose                                      | Default                |
| -------------------------- | -------------------------------------------- | ---------------------- |
| `display_currency`         | Display currency code                        | `USD` (via fallback)   |
| `active_theme_id`          | ID of currently active theme; empty = system | `""`                   |
| `backup_enabled`           | Auto-backup on/off                           | `"true"`               |
| `backup_time`              | Reserved (auto-backup time-of-day)           | `"02:00"`              |
| `backup_keep_count`        | How many auto backups to retain              | `"2"`                  |
| `backup_folder_uri`        | Android SAF tree URI for external folder     | unset                  |
| `backup_setup_done`        | First-launch backup setup gate               | unset → `"true"`       |
| `location_enabled`         | Show "Add Location" on transaction form      | `"false"`              |
| `auto_add_location`        | Fetch location automatically on each new txn | unset (off)            |
| `places_auto_radius_m`     | Auto-pick radius for nearby saved places (m) | `"100"`                |
| `privacy_hide_default`     | Activate hideAmounts on app open             | unset (off)            |
| `privacy_random_default`   | Activate randomNumbers on app open           | unset (off)            |
| `language`                 | Active locale code                           | device locale          |
| `exchange_rates_cache`     | Cached `{base, rates, updatedAt}` JSON       | unset                  |
| **Security**               |                                              |                        |
| `security_biometric_enabled`     | Use biometric (Face ID / Touch ID / fingerprint) for protected actions | unset (off) |
| `security_pin_hash`              | SHA-256 hex of `salt:pin`. Empty string when no PIN set | unset                  |
| `security_pin_salt`              | 16-byte random hex salt paired with `security_pin_hash` | unset                  |
| `security_protected_random_toggle` | Require auth when turning the in-session "random numbers" toggle off | unset (off) |
| `security_protected_backup`      | Require auth when opening the Backups screen | unset (off)            |
| **One-time data flags**    |                                              |                        |
| `credit_balance_migrated`  | v1.0.1 credit-balance semantic flip          | set once               |
| `txn_currency_backfilled`  | Phase-2 currency column backfill             | set once               |
| `default_themes_seeded`    | Default themes inserted                      | set once               |
| `places_migrated`          | v2.0 backfill of legacy location data → places | set once             |

> Adding a new setting? Use `getSetting`/`setSetting` from `src/db/queries/settings.ts`. If it has a default for new installs, register it in `DEFAULT_SETTINGS`. If it ships with a one-time data migration, add a flag here and a migration function in `DatabaseProvider.tsx`.

---

## Budgets

Per-category (or per-subcategory) monthly spending caps. Each budget is a row in the `budgets` table with:

- **`name`** — user-facing label, defaults to the category's name on create.
- **`categoryId`** + optional **`subcategoryId`** — when subcategory is null the budget covers every subcategory of the category. When set, only that specific subcategory's transactions count.
- **`amount`** — the monthly cap.
- **`currency`** — `null` means "follow display currency" (interpretation of `amount` shifts when the user switches display); a code like `"USD"` pins it.
- **`period`** — `"monthly"` only in v2.0. Reserved for future `"weekly"` / `"yearly"`.

### Spend computation (`getBudgetsWithSpend`)

For each active budget:
1. Pull every `expense` transaction in the current calendar month.
2. Filter to those tagged with the budget's category (or specific subcategory).
3. Apply the **`amount/N` split rule** (same as `getCategorySummary`): a transaction tagged in N subcategories contributes `amount × matching/total` to each affected budget — multi-tagged rows aren't double-counted across categories.
4. Convert each row to the budget's resolved currency in two phases:
   - **Phase 1** — `convertRow` does source → display. Honours stored `rateToDisplay` when stable; falls back to today's rate when stale (sets `usedTodaysRate=true`); excludes the row entirely when no rate is available (adds source currency to `missingRates`).
   - **Phase 2** — if the budget pins a currency different from display, multiply the display value by today's `rates[targetCcy]`. Always sets `approximate=true` on this hop because it's today's rate, not historical.
5. Sum into `spend`. Compute `remaining = amount − spend` and `percentUsed = spend / amount × 100` (capped at 9999 to keep the UI safe).

The `BudgetWithSpend` row carries `approximate`, `missingRates`, `resolvedCurrency`, and pre-resolved `categoryName`/`subcategoryName` so the list screen renders without further joins.

### `BACKUP_VERSION`
Adding the `budgets` table is **additive** — existing v1.x backups don't include a `budgets` array, and the import path tolerates its absence (`if (data.budgets?.length) ...`). `BACKUP_VERSION` stays at `1`. Same precedent as when `cashback_rules` was added in v1.0.0 then removed in v1.8.x without a version bump.

## Places

Saved locations for tagging transactions. A place is a row in the `places` table with:

- **`name`** — user-facing label.
- **`latitude`** / **`longitude`** — optional. A place without coords (e.g., a free-typed name like "Online") never gets auto-picked but still works as a manual tag.
- **`address`** — display-only text auto-derived from `latitude`/`longitude` via reverse-geocoding (`Location.reverseGeocodeAsync` on Apple Maps / Android Geocoder). The place form has no manual address input — the column is populated automatically when coords change (debounced 800 ms) and cleared when coords are removed. Resolution failure is silent: address stays null, the place still saves.
- **`source`** — `"manual"` (user typed a name), `"geocoded"` (captured from current GPS or address lookup), or `"migrated"` (imported from legacy `transactions.locationName` during the v2.0 backfill).
- **`visitCount`** — denormalised count of transactions linked via `transactions.place_id`. Maintained imperatively by `createTransaction` / `deleteTransaction`; the live JOIN-based count returned by `getPlacesWithStats()` is the source of truth for the list screen, so any drift only affects picker sort order, not displayed totals.
- **`isActive`** — soft-delete flag. Archived places stay in the DB so transactions still resolve their name; they're hidden from pickers and the list. `archivePlace` flips this to false; `unarchivePlace` flips it back.

### Auto-pick (`findNearestPlace`)

Two-stage filter that runs on every transaction-form GPS capture:
1. **SQL bounding-box pre-filter** using `idx_places_coords` — narrows the candidate set without paying the Haversine cost per row. The box is computed from the centre's latitude (looser than per-edge), but that just lets a few extra candidates through to the JS pass; it never excludes a real match.
2. **JS Haversine refinement** — computes true great-circle distance (`utils/geo.ts`) and returns the nearest place ≤ `radiusM`.

Radius is configurable in Settings (`places_auto_radius_m`, default 100 m). Discrete options: 50, 100, 250, 500, 1000 m.

### Legacy fallback

Existing `transactions.{latitude,longitude,locationName}` columns stay alive. New writes go through `place_id`; legacy columns are populated only on the GPS-capture path so any future code still finds coords. `enrichTransactionsBatch` resolves a single `placeName` field by preferring `place.name` (when `place_id` is set) and falling back to `locationName` for pre-migration rows.

### One-time backfill (`backfillPlaces` in DatabaseProvider)

Gated by the `places_migrated` settings flag. Heuristic in `utils/placesMigration` (unit-tested separately):

- Coord-rich rows bucket by `(round(lat,4), round(lng,4), name.toLowerCase())` ≈ 11 m precision. Same coords with different labels stay split — *over-split rather than over-merge* because manual merging is cheap and an unwanted merge silently corrupts visit counts.
- Name-only rows bucket case-insensitively.
- Each bucket becomes one place with `source = "migrated"` and an initial `visitCount` matching the bucket size.
- Transactions in the bucket get their `place_id` updated in a single transaction.

### `BACKUP_VERSION`
Adding the `places` table is **additive** — same precedent as `budgets`. `BACKUP_VERSION` stays at `1`. The import path tolerates a missing `places` array (`if (data.places?.length) ...`). Place inserts run **before** transactions so FKs resolve in the right order during restore.

## DataRefresh entities

`DataRefreshProvider` exposes `revisions: Record<EntityKey, number>` and `invalidate(...keys)`. The eight keys, and what triggers them:

| Entity         | Bumped by                                                                        |
| -------------- | -------------------------------------------------------------------------------- |
| `accounts`     | account create/edit/archive/delete; any transaction mutation; account-level actions (Pay Card / Make Payment) |
| `transactions` | transaction create/edit/delete; recurring trigger                                |
| `categories`   | category/subcategory create/edit/delete                                          |
| `recurring`    | recurring create/edit/delete; pause toggle; trigger now                          |
| `budgets`      | budget create/edit/delete                                                         |
| `places`       | place create/edit/archive/unarchive/delete                                       |
| `themes`       | theme create/edit/delete/activate                                                |
| `settings`     | any settings mutation; backup folder change                                      |
| `backups`      | backup create/delete                                                             |
| `templates`    | template create/edit/delete                                                      |

Hooks like `useAccounts`, `useTransactions`, `useCategories`, etc. listen to their entity's revision and re-query when it changes. Code that mutates a table **must** call `invalidate(...)` for the affected entities, or screens will show stale data.

---

## Themes

A theme is `{ name, mode: 'light' | 'dark', accentColor, statusBarStyle: 'light' | 'dark' | 'auto' }`. `setThemeId(id | null)`:
- `id` → flips `isActive` flags so only this theme is active, writes `active_theme_id`.
- `null` → all themes inactive; the app falls back to the device's `useColorScheme()`.

Four default themes are inserted once via `seedDefaultThemes` (Dark/Light × Blue/Pink), gated by `default_themes_seeded`.

---

## Contacts

Pulled lazily from device contacts via `expo-contacts`. The app **never copies contacts into its DB** — it stores `contactId` (device-side ID) and `contactName` (snapshot at insert time, so it survives if the contact is later deleted). Permission status is cached in module state (`_hasPermission`) for the session.

`getFrequentContacts` and `getLastUsedContact` aggregate over `transactions` rows that have `contactId` set, so even contacts the user has since removed from their device still appear if past transactions reference them.

---

## Conventions used in code

### Date / time
- `date`: `YYYY-MM-DD` string (sortable lexically).
- `time`: `HH:mm` string.
- Ordering by `date DESC, time DESC` is the canonical "most recent first".

### Money
- All amounts are JS `number` (real). Two-decimal rounding is applied at the boundaries that need it (cashback computation, investment interest). No bigint, no decimal lib — stays JSON-friendly for backups.

### IDs
- Database row IDs are `integer` autoincrement.
- Contact IDs are device-supplied strings (kept as `text`).

### Soft delete vs hard delete
- Categories / subcategories: soft delete via `isActive = false` (so transactions still show their category history).
- Cashback rules: soft delete via `isActive = false` (rule history matters less, but kept consistent).
- Accounts: hard delete only when no transactions reference them; otherwise archive (`isActive = false`).
- Recurring transactions, themes, templates, transactions: hard delete.

---

## Security: biometric + PIN

The app gates a configurable set of "protected actions" behind biometric authentication (Face ID / Touch ID / fingerprint via `expo-local-authentication`) with a 6-digit PIN as fallback.

### Authentication methods
- **Biometric** — toggle on `security_biometric_enabled`. Only effective when the device has hardware AND the user has enrolled at the OS level. The Settings screen disables the switch with helper text when either check fails.
- **PIN** — 6 digits, stored as `sha256("{salt}:{pin}")` (colon delimiter) with a 16-byte random `salt` per user. Set/change/remove from `settings/security`.

> **Threat model**: a casual peeker who has the unlocked phone tries to bypass random-numbers / backups in seconds. SHA-256 + salt is enough to prevent visual peek, *not* to resist a determined attacker who exfiltrates the settings table. Don't lean on this for actual confidentiality of stored data.

### Protected actions
Each protected action is its own setting key (`security_protected_*`). The Settings screen has switches for the available actions; switches are disabled with a hint when no auth method is configured. Currently:
- `security_protected_random_toggle` — gates *disabling* the in-session random-numbers toggle. Turning random ON is unprotected (it increases protection).
- `security_protected_backup` — gates opening the Backups screen.

### `useAuthGate(action)` hook
Returns `{ guard, pinModal }`. Call `guard(callback)` before running the protected action; the callback runs only after auth passes (or immediately if the action isn't marked protected). Order is biometric (when enabled + hardware + enrolled) → PIN (when set) → fall-through. The `pinModal` props are spread onto a `<PinEntryModal>` rendered by the consumer.

When `setting === "true"` but no auth method is configured, the gate falls through and runs the callback. The Settings screen blocks this state by disabling the protected toggles when no auth exists, but the gate stays defensive.

## Error types worth knowing

| Class                          | Where thrown                              | UI handling                                       |
| ------------------------------ | ----------------------------------------- | ------------------------------------------------- |
| `AccountInUseError`            | `deleteAccountPermanently`                | Swap the delete dialog for "archive instead"      |
| `AccountCurrencyLockedError`   | `updateAccount` when currency change attempted with txns present | Show "currencyLockedTitle" modal |
