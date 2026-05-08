# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0] - 2026-05-08

### Added
- **Map-based pin-drop in the place form** — replaces the manual address text input with a MapLibre-rendered map (OpenFreeMap positron tiles, no API key, no Google). Pan the map to drop a pin; the pin's location IS the camera centre. The "Use my current location" button still captures GPS and pans the map to the captured coords. **Address is now auto-derived**: a debounced 800 ms reverse-geocode runs whenever the user changes coords (map pan or GPS capture), populating a read-only address subtitle under the name. Resolution failure is silent — the place still saves without an address.
- **Spending map** — Analytics tab → "Spending map" card → fullscreen heatmap of place-tagged expenses. Default metric is **By amount** (sum in display currency); toggle to **By visits** for raw expense count. The heatmap normalises weights to 0..1 in JS so a single $5000 outlier doesn't wash out a hundred $5 entries; gradient and zoom-driven intensity / radius / opacity stay constant across both metrics. Three context banners surface approximate / missing-rate / excluded-no-coords states.
- **Tappable map markers + clusters** — a second clustered GeoJSON source paints individual place dots and cluster bubbles (with point-count labels) over the heatmap. Tap a cluster → camera eases to its expansion zoom, breaking it apart. Tap an individual dot → push the new place detail screen.
- **Place detail screen** — `/place/{id}` shows a place's header (name, address, coords, archived banner if applicable) plus every transaction tagged to that place, most-recent first. Pencil icon top-right pushes the existing edit form. Reachable from the Settings → Places list (tap a row) and from the spending heatmap (tap a dot).
- **"Show all in view" floating button** on the spending map — anchored bottom-centre. Tap to open a modal listing every place-tagged expense whose place's coords sit inside the current map bounds. Tap a row → transaction detail.

### Fixed
- **Place detail used to clobber the saved address on edit-load**. Opening an existing place triggered the reverse-geocode effect on the synthetic coord-set that came from the DB load, silently overwriting the saved address with whatever the geocoder returns now — and on de-Googled Android (Geocoder returns nothing) that meant the address column got reset to null on the next save. Reverse-geocode now only runs when the user actually moves the pin or captures GPS.
- **Transaction-detail delete didn't invalidate `places`**. `deleteTransaction` does decrement the linked place's `visit_count`, but the screen-level invalidation list missed `"places"`, so the picker's frequency-based sort stayed stale until something else bumped the revision. Aligned with what the transaction-form submit already does.
- **Heatmap silently crashed on mount on real devices**. The original implementation imperatively called `cameraRef.fitBounds` 100 ms after mount, which raced with the map style finishing loading and triggered a native crash for some users. Now the camera centre + zoom are computed from the data's bbox up front and passed via `MapView`'s `initialCenter` / `initialZoom` — no imperative camera op. Also stringifies the GeoJSON before passing to the source (some MapLibre RN bridges have known object-payload quirks on Android) and adds an explicit `source` prop on the heatmap layer.
- **Heatmap initial camera was too zoomed out**. Previously fit a bbox of every feature — a single rare-but-far-away place (one trip among hundreds of regular expenses) yanked the camera all the way out to a continental view. Now sorts features by weight and fits the camera to the dominant 80% of weight, so outliers don't pull the view away from where the activity actually is.
- **Transaction detail screen showed `locationName` instead of `placeName`**. After the v2.0 places migration, `enrichTransactionsBatch` resolves a single `placeName` field (preferring `place.name` via `place_id` and falling back to `locationName` for pre-migration rows) — but the detail screen was still reading the legacy column directly, missing the auto-picked place name on every new transaction. Switched to `placeName`.
- **`backfillPlaces` (one-time data migration in `dataMigrations.ts`) wasn't actually atomic**. Used `db.transaction(async (tx) => …)`, which both Drizzle SQLite drivers run in "sync" mode — async callback returns its Promise immediately, COMMIT fires, awaited body runs against a closed transaction (each insert auto-committing individually instead of all-or-nothing). Replaced with manual BEGIN/COMMIT via `db.run(sql\`...\`)`, matching the working pattern in `restoreData`. Pre-existing `placeId IS NULL` filter kept the bug benign in practice (the migration's idempotency saved it), but the broken pattern is now a documented `gotcha:` rather than a trap for future migrations.
- **`getTransactionsInBounds` returned every transaction type, not just expenses**. The "Show all in view" sheet would surface income / transfer rows that the (expense-only) heatmap doesn't paint, so the sheet's contents didn't match what the user was looking at. Filtered to expense for parity.
- **"Show all in view" no-op'd on first tap**. The viewport ref was null until the first `onRegionChange` fired (which doesn't happen until the user actually pans/zooms). Falls back to a world bbox now, so the first tap on a freshly-opened spending map populates the sheet.

### Internal
- **MapLibre + OpenFreeMap stack** — `@maplibre/maplibre-react-native` v11 with the Expo config plugin handles the native build; OpenFreeMap (free, no key, no account, OSM-based) handles the tile source. Single `MAP_STYLE_URL` constant in `src/components/molecules/MapView.tsx` so swapping providers is a one-line change. Network is required at view time; the GPS button is the offline fallback.
- **New utilities**: `src/utils/geo.ts` (Haversine + bounding-box helpers, antimeridian-aware), `src/utils/countryCenters.ts` (device-locale → country-centre fallback for "no GPS, no existing coords" first-mount state).
- **Two GeoJSON sources** back the spending map: a non-clustered one feeding the heatmap layer (so density renders accurately), and a clustered one (`cluster: true`, radius 50, max-zoom 14) feeding cluster circles + point-count symbols + individual dots. Clustering on the heatmap source would silently merge points and distort the gradient.
- **Reverse-geocode helper extracted** to `src/services/location.service.ts` as `reverseGeocodeCoords(lat, lng)` — used by both the GPS-capture path and the new map-pan path.
- **Circular import broken**: `convertRow` + `ConvertedRow` + `AggregateMeta` extracted from `queries/transactions.ts` into a new `queries/convert.ts`. Both `transactions.ts` (for internal use + re-export) and `places.ts` (`getPlacesAsGeoJSON`) now import directly from `convert.ts`. Existing call sites and tests keep working unchanged.
- **MapView wrapper** exposes both `onCenterChange` (where's the pin?) and `onRegionChange` (what's in view?) — picker uses the lighter callback, heatmap uses the new one for viewport tracking.
- **15 new tests** (heatmap query: count + amount metrics, stale-rate handling, coord-less and no-place exclusions, archived inclusion, income ignored; place query: filter + ordering + empty + no-place exclusion + antimeridian wrap + expense-only filter; backfillPlaces: 4 idempotency / boundary tests). 199 total (was 184 at v2.0.0).
- **Two cumulative code-review passes** over the cycle. Findings: silent-address-overwrite on edit-load (fixed), missing `places` invalidation on transaction delete (fixed), `db.transaction(async …)` broken-by-design pattern (replaced with manual BEGIN/COMMIT), circular import between places + transactions (extracted), `getTransactionsInBounds` not expense-filtered (fixed), `regionRef` null on first tap (fixed), `backups` export gap (intentional, now commented).
- **Docs**: glossary gains Place-detail and Spending-heatmap subsections (with the cluster-source separation, weight normalisation, and viewport sheet), flows §12.5 + §14.2 reflect the new triggers and edge cases, architecture's Map-stack documents the two-GeoJSON-source split and post-restore data-migration call.

### Technical Details
- New dependency: `@maplibre/maplibre-react-native ^11.0.3`. Expo SDK 55, RN 0.83, no other production dep changes.

### Added
- **Budgets** — per-category (or per-subcategory) monthly spending caps. New screen under Settings → Budgets, plus a creation modal that defaults the name to the category, follows your display currency by default (toggle to pin a specific currency), and shows a colour-graded progress bar (green → amber → red) on the list. Each row displays `spend / amount` with a percent-used label that respects privacy mode. The spend computation honours stored `rate_to_display` snapshots when stable and only falls back to today's rate (with the ≈ marker) for excluded rows; cross-currency budgets pinned to a non-display currency get a second-phase conversion at today's rate, marked approximate. Multi-subcategory transactions use the same `amount/N` split rule as the existing analytics aggregates so a row tagged across two budgets contributes proportionally to each instead of being double-counted. Soft-deleted target categories surface a banner inside the budget so the user knows to re-pick.
- **Places** — saved locations for tagging transactions. New screen under Settings → Places lists every saved place with its visit count; each row opens a form for renaming, capturing GPS via "Use my current location", or archiving / deleting. New transactions auto-pick the nearest saved place when GPS is captured (within a configurable radius — Settings → Auto-pick radius, defaults to 100 m, options 50 / 100 / 250 / 500 / 1000). When no place is in range, the form offers "Create one for here" (instant create from the GPS stamp + reverse-geocoded label, renameable later) or "Pick existing" (searchable picker over all active places). Archived places that were already selected on a transaction stay visible in the picker so the user can confirm what's currently set. Place data round-trips through backup / restore.
- **Categories moved to Settings** — the Categories tab is gone from the bottom bar; tap Settings → Categories to reach it. The bottom bar now shows Home / Transactions / Analytics / Accounts (four tabs, down from five), trading travel-distance for the Analytics tab that users actually visit more often. Categories functionality is unchanged — same screen, same FAB, same picker.

### Internal
- **Migration 0009 (`budgets` table)** + **migration 0010 (`places` table + `transactions.place_id` FK + index)**. Both additive; existing v1.x data is unaffected. `BACKUP_VERSION` stays at `1` (additive precedent — same as `cashback_rules` was added then dropped).
- **One-time `places_migrated` data migration** runs on first launch of v2.0: scans every transaction with non-null `latitude` or non-empty `locationName`, buckets them into Place records, and updates each transaction's `place_id`. Bucketing heuristic *over-splits rather than over-merges* — coords + name is the key, so two visits to the same address with different labels stay separate (manual merge is recoverable; an unwanted merge silently corrupts visit counts). The flag is written **inside** the same transaction as the inserts so a crash mid-migration can't double-create on the next boot, and the legacy-row query filters on `placeId IS NULL` so a re-run after backup restore is a no-op for already-linked rows.
- **One-time data migrations extracted** to `src/db/dataMigrations.ts` and called from both `DatabaseProvider`'s boot pipeline and `restoreData` after a successful import. Without the post-restore call, a user restoring a v1.x backup on v2.0 would see no Places (and no auto-pick) until the next cold start because the boot pipeline `useEffect` is keyed on schema-migration success and never re-fires.
- **`findNearestPlace`** is a two-stage filter: SQL bounding-box pre-filter via `idx_places_coords`, then JS Haversine refinement. Antimeridian-aware — queries near ±180° longitude drop the longitude filter and let Haversine see every row in the latitude band, so users near Fiji / NZ-east-coast aren't silently broken. Latitude is clamped to ±90 so polar queries don't produce a degenerate box.
- **`searchPlacesByName`** uses `lower()` on both sides of the LIKE so non-ASCII names (Japanese, Chinese, accented characters) match case-insensitively, and escapes `%` / `_` / `\` so a user typing "50%" gets a literal substring match instead of a wildcard.
- **`enrichTransactionsBatch`** now resolves a single `placeName` field (preferring `place.name` via `place_id` and falling back to legacy `locationName` for pre-migration rows) so consumers don't double-render a location.
- **Cross-cutting invalidations**: TransactionForm submit invalidates `places` (visit count drift affects picker order); display-currency change invalidates `budgets` (null-currency budgets follow display currency, so their resolvedCurrency / spend shifts).
- **Visit-count maintenance**: `createTransaction` increments, `deleteTransaction` decrements, and the edit path nudges the counter on `placeId` change. `processDueRecurring` carries a `gotcha:` comment because it inserts directly rather than via `createTransaction` — load-bearing only when a future schema adds `recurringTransactions.placeId`.
- **65 new tests** (geo, places-migration bucketing, places query layer including antimeridian + LIKE-escape + non-ASCII search, plus the existing budgets test suite) — 180 total, up from 116 in v1.10.0.
- **Documentation**: glossary gains Budgets and Places sections (definitions, spend computation, auto-pick + bucketing semantics, BACKUP_VERSION precedent, settings keys, DataRefresh entries); flows gains §14 Places (auto-pick, CRUD, legacy backfill); architecture's "One-time data migrations" + boot pipeline now point at `dataMigrations.ts`; merge-points adds a fixes-row reference and updates entries 11 (DatabaseProvider) and 12 (restoreData) to reflect the post-restore migration call.
- **Two cumulative code-review passes** caught: a places-migration idempotency hole (flag write outside the transaction would have allowed duplicate places after a crash); the `placeId IS NULL` legacy-row guard for restore-from-v1; antimeridian + LIKE wildcard issues; the post-restore data-migration gap; missing `places` invalidation on TransactionForm submit; missing `budgets` invalidation on display-currency change; archived-but-selected places hidden from the picker; double-tap "Create one for here" race. All BUG / HIGH findings fixed before tag.

### Technical Details
- New schema tables: `budgets` (migration 0009), `places` (migration 0010). New transactions column: `place_id` (nullable FK, indexed). All other tables unchanged.
- New utility module: `src/utils/geo.ts` (Haversine + bounding box, no external deps).
- Reused dependencies only — no new production deps in v2.0.0. The `expo-location` dependency from v1.x is now load-bearing for the place GPS-capture flow.

## [1.10.0] - 2026-05-06

### Added
- **Contacts list screen** (Settings → Contacts) — see every contact you've recorded a transaction with, sorted by most-recent activity, with transaction counts and dates. Tap a device-linked contact to drill into its full transaction history. Free-typed contacts (entered by name only, no device link) appear with a different visual cue and aren't navigable yet — contact-as-first-class lands in v2.0.

### Fixed
- **Loan interest accrual now actually runs**. `loan_borrowed` and `loan_lent` accounts with `interestRate` set were displaying the rate but never applying it, so a friend who borrowed $1000 at 5% APR a year ago still showed as owing $1000 instead of ~$1050. Daily compounding (the same shape as investments) now runs on app foreground. Sign-aware: borrowed loans grow more negative as the debt accrues; lent loans grow more positive. Settled (balance = 0) or sign-flipped loans (overpaid) skip the compound and just advance `lastInterestDate` so a later sign flip doesn't retroactively accrue.
- **Monthly recurring no longer skips short months**. A transaction set to repeat on the 31st previously skipped February entirely (Jan 31 → Mar 31 — JS auto-rolled `setMonth(+1)` from Jan 31 to Mar 3, then clamped to Mar 31). Now correctly clamps to Feb 28 (or 29 in leap years), then resumes on the 31st in long months: Jan 31 → Feb 28 → Mar 31 → Apr 30 → May 31. Same fix for yearly recurrings on Feb 29 (which used to auto-roll to Mar 1 in non-leap years).
- **Split-bill edit communicates the lock state**. Opening an originally-split expense in the edit form previously silently hid the split section with no explanation — users had no clue why their split data wasn't editable. Now shows a clear locked-state card listing the spawned loan accounts with instructions: "To modify the split, first delete these loan accounts: [list]; open Accounts, delete the loans listed above, then come back and edit this transaction." True split-edit (the unlock-and-recreate path) requires schema-level metadata and ships in v2.0.

### Internal
- **Test harness landed**. 116 unit + integration tests, was 0. Covers money math (`updateAccountBalance` × every direction × type, `getAccountsTotals` classification across all 8 account types, `convertRow`'s three states, `transferDestAmount`'s `toAmount ?? amount` rule), security (PIN hash + verify round-trip, salt regeneration), recurring catchup + 90-day cap + end-date deactivation + rate-stamping, `restoreData` atomic rollback (multi-row pre-population proves both delete *and* insert phases sit inside the rolled-back transaction), and the new investment + loan interest accrual. `jest-expo` preset + `better-sqlite3` for in-memory SQLite. Fixtures in `src/db/test-fixtures.ts`. Run via `npm test`. Suite ~1.1s.
- Investment + loan interest accrual extracted to `src/db/queries/interest.ts` with a shared `accrueOne` core. Per-type predicate (`b > 0` for investments, sign-aware for loans) decides whether to compound or just bump the date. The same compound formula handles both loan directions because the multiplier preserves sign.
- `AccountForm` now stamps `lastInterestDate` on creation for any accruing type (was only investment); legacy loans without a stamp compound from `createdAt` on first run, same shape as legacy investments.
- New `getSplitSourceInfo(txnId)` query in `src/db/queries/accounts.ts`: detects loan accounts spawned by a particular split-bill expense.
- New `getAllContactsWithActivity()` query in `src/db/queries/transactions.ts`: aggregates contacts from existing transactions; no schema change.
- Unused `currency` legacy seed removed from `DEFAULT_SETTINGS` (carry-over cleanup).
- 5 code-review passes across the branches caught 1 HIGH issue (orphaned mock state that would have bled across loan tests) + several MEDs (`onPinSubmit` memoisation, gate double-tap race, sort tie-break, free-typed contact UX cue) — all fixed before merge.

### Technical Details
- New dev deps: `jest`, `jest-expo`, `@types/jest`, `better-sqlite3`, `@types/better-sqlite3`. Production deps unchanged from v1.9.0.

## [1.9.0] - 2026-05-06

### Added
- **Linked account on loan create**: when adding a `loan_borrowed` or `loan_lent` account, you can now optionally pick a same-currency real account from the new "Linked account" picker. The form opens the loan at `balance: 0` and atomically creates the offsetting transfer (loan_borrowed → loan→real, loan_lent → real→loan), so you no longer have to record both the loan AND a separate income/expense for the matching cash movement. Replaces the prior two-step workflow. Optional and backwards-compatible — leave the field empty for the original "set initial balance directly" behaviour. Same-currency only in v1; create-only (not exposed on edit). The picker is hidden when no same-currency non-loan accounts exist.
- **Cashback destination auto-defaults to the from-account** on the new-expense form. Toggling cashback on auto-fills the destination to the transaction's source account; if you change the source account before save, the destination follows. The moment you manually pick a different destination from the modal, the auto-tracking stops and your choice persists. Editing an existing cashback transaction always preserves the saved destination — no auto-overrides on mount.
- **Security: biometric + PIN protection** for configurable actions:
  - New `Settings → Security` screen with two sections — *Authentication methods* (biometric Switch, Set/Change/Remove PIN) and *Protected actions* (Switches that gate specific behaviours).
  - **Biometric** via `expo-local-authentication` (Face ID / Touch ID / fingerprint). Switch is disabled with helper text when the device has no hardware or the user hasn't enrolled biometric at the OS level. Adds `NSFaceIDUsageDescription` to iOS Info.plist for App Store compliance.
  - **6-digit PIN** stored as `sha256("{salt}:{pin}")` with a 16-byte random salt per user (via `expo-crypto`). Two-phase setup flow with confirmation entry. Threat model: "casual peeker has the unlocked phone" — protects against visual peek, not designed for offline-attacker resistance against the settings table.
  - **Protected actions in v1**: (a) disabling the in-session "Random numbers" privacy mode (only the disabling direction is gated — turning random ON doesn't reduce protection), (b) opening the Backups screen.
  - When you remove all auth methods, the protected-toggle flags are cleared automatically so they don't silently reactivate when auth is configured again later.

### Fixed
- **Split-bill and cashback inputs scroll into view when the keyboard opens**. The form is in a Modal whose ModalLayout intentionally skips KeyboardAvoidingView on Android (adjustResize handles top-level content), but inputs deep in the form — split-bill rows and the cashback amount field — could still sit below the visible area. Added a ScrollView ref + `onFocus` handler that calls RN's `scrollResponderScrollNativeHandleToKeyboard` to scroll the focused input ~120px above the keyboard. No more typing blind.

### Internal
- **Documentation overhaul** continues from v1.8.3:
  - `docs/glossary.md` gains a Security section (auth methods, protected actions, threat model, `useAuthGate` hook contract) and 5 new Security settings keys in the table. Linked-flow notes added under `loan_borrowed` and `loan_lent`. Currency-key cleanup paragraph removed (the legacy seed is gone).
  - `docs/flows.md` adds §3.1.1 (loan with linked account), §9.7 (security setup), §9.8 (disabling random-numbers when protected), §9.9 (Backups when protected). §7.1 cashback flow notes the new smart default.
  - `docs/merge-points.md` adds entry #13 for `useAuthGate` (converges, invariants, touch radius).
  - `docs/architecture.md` services list now names `auth.service.ts`.
- **Internal cleanup**: dropped the unused `currency: "USD"` legacy seed from `DEFAULT_SETTINGS`. The runtime always reads `display_currency` (with a `?? "USD"` fallback in `getDisplayCurrency`); the legacy key was a noop on every install.
- **Code-review pass** on v1.9.0 caught a HIGH issue (orphaned protected-toggle DB flags after removing all auth) plus several MED issues (gate double-tap race, `onPinSubmit` not memoised, setup-mode error semantics) — all fixed before release. Sub-pixel `onPinCancel` memoisation, `inFlight` ref on the gate, and `useCallback` everywhere PIN-related.

### Technical Details
- New deps: `expo-local-authentication ~55.0.13`, `expo-crypto ~55.0.14`. Both Expo-blessed.
- The Expo config plugin `expo-local-authentication` was added to `app.config.ts`. Native config takes effect at the next prebuild (handled by `npm run android:release`).

## [1.8.3] - 2026-05-05

### Fixed
- **Split-bill "Already paid" path**: marking a person as already-paid in the split form used to leave the auto-created `loan_lent` account at `balance: −person.amount` (surfaces as a phantom liability — the user appeared to *owe* the friend right after the friend already paid back). Existing-loan + paid was broken too: a `&& !existing` guard skipped the settling transfer, so a paid split on an existing loan inflated it instead of staying flat. Both are fixed: the loan now always opens at `+person.amount` and the settling transfer fires on `person.paid` regardless of existing/new. Verified across all four (existing? × paid?) combinations. *Note*: existing rows are not migrated — historical split-bill loans created pre-fix retain whatever balance they had. Future splits work correctly.

### Removed
- **Unused `cashback_rules` table and `src/db/queries/cashback.ts`** — scaffolded in v1.0.0 for an automatic-rules cashback feature that was never wired to any UI. Migration 0008 drops the table from existing databases. Old backups containing a `cashbackRules` array are still importable; the field is silently ignored. The shipping cashback model (per-transaction toggle on the new-expense form) is unchanged.

### Internal
- **New canonical documentation under `docs/`**:
  - `glossary.md` — domain vocabulary, invariants, account types, currency snapshot fields, refresh entities, settings keys, error types
  - `flows.md` — user-facing flow inventory grouped by domain (lifecycle, transactions, accounts, recurring, backup, etc.); each flow has trigger / happy path / edge cases
  - `architecture.md` — provider stack, data flow, migration scheme, boot pipeline, file organisation, "where to look for X" extension recipes
  - `merge-points.md` — convergence points (transaction form, account form, balance math, conversion gate, restore) with their touch radius
- **Inline `// invariant:` / `// why:` / `// gotcha:` comments** at load-bearing sites: universal balance mutator, credit-card debt formula, FK-off check, account currency lock, three-state convertRow, captureRateForCurrency rate inversion, recurring catchup + 90-day cap + rate stamping, investment zero-balance guard, boot pipeline order, provider stack, atomic edit + atomic restore + delete order, CHUNK_SIZE limit, multi-subcategory link division.
- **Type-safety refactors in cross-currency code**:
  - `convertRow` now returns a discriminated union `{ state: "converted", value, usedTodaysRate } | { state: "excluded", currency }`. Collapsing the excluded state to a numeric zero won't compile.
  - `transferDestAmount(txn)` helper centralises the `txn.toAmount ?? txn.amount` pattern across all four call sites (createTransaction, deleteTransaction, edit-reverse, edit-apply).
- **Doc-staleness check**: `scripts/check-docs.sh` + `npm run check-docs` — non-blocking reminder when `src/` changes without matching `docs/` updates, with heuristic doc-target suggestions per area. Wired into the release flow in `CLAUDE.md`.
- **README.md**: new Documentation section pointing to the four `docs/` files; fixed stale "5 account types" → 8 (loans + investment).

## [1.8.2] - 2026-04-30

### Fixed
- Android `versionCode` was hardcoded to `1` and never bumped between releases. Sideload installs of v1.7.0/v1.8.0/v1.8.1 all advertised the same version code, so Android treated new APKs as same-version reinstalls and kept cached state from the prior install — meaning a device that had v1.8.0 installed could keep running the v1.8.0 code even after installing v1.8.1, with only the in-app version string updating from the freshly-loaded bundle. (This is why v1.8.1's launch-crash fix wasn't visibly applied for some users.) `versionCode` is now derived from the version string (`major*10000 + minor*100 + patch`), so future updates increment monotonically and Android invalidates caches on each upgrade.

## [1.8.1] - 2026-04-30

### Fixed
- App crashed on launch with `useTheme must be used within ThemeProvider`. `BackupSetupModal` was being rendered as a sibling of `DatabaseProvider`'s children, but `ThemeProvider` lives *inside* those children — so the modal called `useTheme()` outside the theme context and threw. The modal now renders inside `AppStack` (within `ThemeProvider`), with setup state exposed via the `DatabaseContext`. The modal still appears at the same point in the boot flow and still blocks the user via its no-op `onRequestClose`.

## [1.8.0] - 2026-04-30

### Added — External backup folder
- **Storage Access Framework integration on Android**: pick a folder once via the system file picker; auto-daily backups go into a `MyWallet` subfolder inside it that survives uninstall. Migrates existing internal backups into the chosen folder on first selection.
- **Files app integration on iOS** via `UIFileSharingEnabled` + `LSSupportsOpeningDocumentsInPlace` — backups in `documentDirectory` now show up in the Files app under On My iPhone › My Wallet.
- **First-launch setup gate** explains the storage choice and prompts for a folder (Android) or acknowledges the Files-app integration (iOS). Skip path requires a confirm dialog.
- **Backup folder row** in Backup settings shows current folder, change/clear actions, and a red warning banner on Android when no folder is selected or the SAF permission was revoked.
- `i18next` plural keys migrated to CLDR `_one`/`_other` (the legacy `_plural` suffix was inert under i18next 26).

### Added — Multi-currency overhaul
- **Per-row display in account currency**: transaction lists, transaction detail, recurring lists/detail, templates, and home upcoming all display each row in its own account's currency instead of swapping only the symbol.
- **Currency-aware aggregations**: `getMonthSummary`, `getDailySpending`, `getCategorySummary`, `getTrendData`, and `getTopContactsByMonth` now convert each row to display currency using a `CurrencyConverter` instead of summing raw amounts. Rows with no rate are excluded; aggregates report `missingRates` and `usedTodaysRate`.
- **Stable historical conversion**: new `transactions.currency`, `transactions.rate_to_display`, `transactions.display_currency_snapshot` (migration 0006, same on `recurring_transactions`) capture the currency + rate at insert time. Aggregations use stored rates when valid; only fall back to today's rate (with `≈`) for legacy rows or when the user has changed display currency since.
- **Cross-currency transfer dual-amount form** (migration 0007 adds `transactions.to_amount`): when source and destination accounts use different currencies, the form shows a second "Amount received" input — auto-filled from today's rate, user-overridable. Source side and destination side update with the correct currency-specific amounts. Fixes the long-standing phantom FX gain/loss bug for cross-currency transfers, including on edits.
- **Per-row dual display** (`TransactionAmount`): when a transaction's source currency differs from display currency, the row shows the display-currency value as primary (with `≈` if today's rate was used) and the source-currency value as a caption.
- **AccountCard dual-line**: foreign-currency accounts show display-currency equivalent above the account-currency original.
- **Display-currency change warning**: switching display currency on a multi-currency wallet now requires confirmation explaining that stored rates become stale and analytics totals will display at today's rate until newer transactions are recorded.
- **Account-currency lock**: editing an account's currency is blocked once any transaction references it (UI lock + query-layer guard via `AccountCurrencyLockedError`). Prevents silent corruption of stored rate snapshots.
- **Hard-delete guard on accounts**: deleting an account that has transactions is blocked at the query layer (`AccountInUseError`) since `expo-sqlite` runs with `PRAGMA foreign_keys = OFF`. The user is directed to archive instead.
- New analytics banner explains conversion state: appears only when rates were missing or today's rate was used as a fallback.
- New i18n strings in all 5 locales for the above (`amountSent`, `amountReceived`, `receivedAt`, `currencyLocked`, `changeCurrencyTitle`, `changeCurrencyMessage`, banner copy, etc.).

### Notes
- iOS `UIFileSharingEnabled` / `LSSupportsOpeningDocumentsInPlace` only take effect on a fresh native build — released APK has them; sideloading an existing iOS dev build won't.
- Existing transactions are backfilled with `currency = account.currency` on first launch after upgrade. `rate_to_display` and `display_currency_snapshot` are intentionally left NULL on legacy rows — the app falls back to today's rate (with `≈`) until a transaction is recorded post-upgrade.

## [1.7.0] - 2026-04-29

### Added
- **Net worth toggle** on accounts: each account can now be excluded from the net worth, total assets, and total liabilities calculation. Surfaced as a Switch on the account details screen and the create/edit form
- Small badge on `AccountCard` when an account is excluded from net worth (`minus-circle-outline` icon next to the name) so the exclusion is visible from the accounts list
- `accounts.includeInNetWorth`, `accounts.includeInNetWorthHint`, and `accounts.excluded` strings in all 5 locales
- `include_in_net_worth` column on `accounts` table (migration 0005), defaults to `true` so existing accounts are unaffected

### Changed
- `getAccountsTotals` skips accounts where `includeInNetWorth` is false — flag flows through to home tab net worth and analytics totals via the same query

## [1.6.0] - 2026-04-18

### Added
- **Analytics insights** card: savings rate, month-over-month expense change, and end-of-month expense projection (current month, mid-month)
- **6-month trend**: rolling window of income vs expense bars per month with net per row; empty months render as zero-height bars so gaps in activity are visible
- **Top Contacts** section on analytics: top 3 people by expense total for the viewed month with transaction count per contact
- **Automatically add location** setting, nested under Location Stamps — when enabled, new-transaction forms fetch GPS on mount without tapping
- **Help modal sections**: every screen's help now opens with Overview / How to use / Tips instead of a single paragraph, rewritten across all 8 help-enabled screens and translated into all 5 locales
- `getTrendData` and `getTopContactsByMonth` queries

### Changed
- Location field on the transaction form now has a titled label and renders as a bordered card when set, matching the rest of the form
- HelpModal takes a `helpKey` prop and pulls sectioned content from i18n; section headings live under `help.sections`
- HelpModal spacing loosened (bigger section gaps, heading-to-body breathing, larger line-height, more header padding)
- ModalLayout skips KeyboardAvoidingView on Android (the system's `adjustResize` handles it) and honours the bottom safe area on Android; iOS keeps `KeyboardAvoidingView behavior="padding"` with pageSheet handling its own bottom inset

### Fixed
- **Credit card limit adjustment**: when a credit card's limit changes on edit and the user hasn't touched the balance field, balance shifts by the limit delta so `debt = limit − balance` stays constant — matches what users mean when their bank raises or lowers a limit
- Auto-add-location didn't actually fire: the settings load asynchronously after the form mounts, so a mount-only effect always saw `false`. Fixed with a ref-guarded prop-reactive effect
- AccountForm "balance untouched" detection uses a touched ref instead of float equality, so retyping the same value no longer silently triggers the limit-delta shift
- Non-tab screens restored to top+bottom safe area (11 screens had locally overridden `ScreenLayout`'s default, undoing the v1.4.0 fix). Version label on Settings is no longer hidden behind the Android 3-button nav
- Transaction form bottom dead space: dropped excessive `paddingBottom`, removed Android's unnecessary KeyboardAvoidingView, trimmed container spacing so the Save button sits just above the gesture bar without a visible gap
- `@xmldom/xmldom` bumped to 0.8.13 via `npm audit fix` (transitive dev-only advisory)

## [1.5.0] - 2026-04-16

### Added
- **Help modal** on all 8 main screens (Home, Transactions, Categories, Analytics, Accounts, Recurring, Templates, Backup) — '?' icon in header opens friendly explanation text
- **HelpModal** molecule component — themed card with scrollable content, all 5 languages
- **HeaderBar leftIcon/onLeftPress** props for custom left icons
- **Credit card "Pay Card" button** on account detail — navigates to transfer form with card pre-filled as destination
- **FAB on account detail** — quick-add transaction with account pre-selected
- **Recurring transaction editing** — form supports loading by ID, edit button on detail screen
- Subcategory name translations on category detail screen
- Thousand separator formatting on recurring form amount input

### Changed
- Home screen: settings icon moved to left, help on right
- Recurring screen: header '+' replaced with FAB (consistent with other list screens)
- Accounts header: uses rightActions array for archive toggle + help icon
- ModalLayout: bottom safe area handled by page sheet (removes double padding)

### Fixed
- Pay Card auto-select excludes the credit card itself from "from" account (prevents from==to invalid state)
- Debt display always visible with AmountDisplay handling privacy (no longer hidden entirely when amounts masked)
- Split bill rounding reverted to Math.round with 2 decimals (Math.floor broke decimal currencies)

## [1.4.0] - 2026-04-15

### Added
- **Split debt display**: transaction detail shows linked loan debts with status (settled/remaining), tap to navigate to loan detail for payment
- **Instant paid toggle**: mark split bill people as already paid — creates loan at zero balance with immediate settling transfer
- **Category translations**: all 12 default categories and 45+ subcategories translated in all 5 languages via display-time lookup
- Thousand separator formatting on account form balance and credit limit inputs

### Changed
- ScreenLayout defaults to top+bottom safe area edges (fixes content hidden behind 3-button Android nav)
- Reduced form bottom padding from 48px to 24px across all forms (SafeAreaView already handles safe area)
- Split loan accounts store `originTransactionId` linking them to the originating expense

### Fixed
- Split bill rounding: uses Math.round with 2 decimals + remainder distribution (reverted Math.floor which broke decimal currencies)
- Split-created loans explicitly set `interestRate: null` and `lastInterestDate: null`

## [1.3.0] - 2026-04-12

### Added
- **CategoryChipPicker**: new inline chip-based category selector replaces dropdown-style picker across all forms
- **Recurring detail screen**: view all fields + list of generated transactions, navigate from list or home
- **Trigger Now**: manually fire a recurring transaction early (e.g. salary comes before scheduled date)
- **Smart upcoming**: home section filters by 30-day window and skips recently-fired recurring
- **Day/time scheduling**: monthly → day-of-month, weekly → day-of-week, daily → time-of-day
- **Changelog screen**: view release history in-app (Settings → Changelog), parses CHANGELOG.md
- Inline subcategory rename (tap name → edit → submit)
- Clear 'x' button on transaction search bar (dismisses keyboard)

### Changed
- Recurring form: frequency/account use modal pickers, all strings use i18n
- Filter screen: type selector uses same colored buttons as create transaction form
- Filter screen + template form use CategoryChipPicker
- Day of month: number input (1-31) instead of 31-item scrollable picker
- Months with fewer days auto-clamp (e.g. day 31 in Feb → 28/29)

### Fixed
- Subcategory delete now works (getCategoryById was not filtering inactive subcategories)
- getNextDate weekly/biweekly dayOfWeek no longer overshoots interval
- Subcategory rename guards against double-fire (onSubmitEditing + onBlur race)
- Recurring form screen title uses i18n instead of hardcoded English

## [1.2.0] - 2026-04-10

### Added
- **Loans**: borrowed and lent account types with counterparty (contact or manual), interest rate, due date
- **Loan payments**: "Make Payment" / "Receive Payment" button with transfer creation, "Pay Full" shortcut, "Settled" badge at zero
- **Investments**: account type with interest rate and daily compound interest auto-applied on app open
- **Transaction templates**: create reusable shortcuts for frequent transactions (Settings → Templates)
- **Template chips**: horizontal scrollable row at top of create transaction form, tap to pre-fill all fields
- **Split bill**: toggle section on expense form to split with others, each person via contact picker or manual name
- Split bill auto-creates loan_lent accounts for each person (or adds to existing if same contact)
- "Split evenly" button divides total equally among all people
- Templates screen with full CRUD (create, edit, delete)
- Templates included in backup export/restore
- Settings row for Templates management
- Due date on loans can be cleared back to unset

### Changed
- Net worth calculation handles loan_borrowed (negative = liability), loan_lent (positive = asset), and edge cases (overpayment in either direction)
- Investment `lastInterestDate` preserved on account edit (only set on creation)
- Transaction edit wrapped in SQLite transaction for atomicity (BEGIN/COMMIT/ROLLBACK)
- PaymentModal resets state (amount, account) on each open
- Split bill currency sourced from fresh DB query instead of hook state
- Backup export filename now includes time (matches auto-backup format)
- FAB account check queries DB directly instead of relying on hook state

### Fixed
- Loan overpayment capped at remaining balance with validation warning
- Investment interest no longer retroactively applied during zero-balance periods
- Loan balance displays as positive number in edit form (no negative sign confusion)
- Privacy mode respected in loan detail (debt display, payment remaining use AmountDisplay)
- Error handling: try/catch on transaction submit, payment modal, template form; fire-and-forget interest accrual has .catch
- Split person card border uses theme color instead of hardcoded value
- Template queries deduplicated (single enrichTemplates function)

## [1.1.1] - 2026-04-10

### Fixed
- Added 54 missing translation keys to Spanish, Portuguese, Japanese, and Chinese locales (privacy settings, filters, cashback, backup restore, contacts sections)

## [1.1.0] - 2026-04-09

### Added
- Infinite scroll on contact list with pagination
- Default account selection based on last transaction of the same type
- Autofocus on amount field when creating a new transaction
- Thousand separator formatting on amount input fields
- Category suggestions shown as tappable chips based on frequent usage per type
- Account-required modal when trying to add a transaction with no accounts (navigates to add account)
- Persistent release keystore for consistent APK signing across rebuilds
- Expo config plugin (`withReleaseSigning`) injects signing config on every prebuild
- Default themes seeded on first launch (Dark/Light Blue, Dark/Light Pink)
- New account currency defaults to display currency setting
- New translation keys: tabs, FAB labels, format strings, suggestion label, account-required modal
- Multi-select account/contact picker modals in transaction filters (replaces chip-based selectors)

### Changed
- Date and time fields moved right below transaction type selector (autocompleted fields grouped together)
- Account and contact fields now share one row in the transaction form
- Contact picker trigger matches SelectInput visual structure (label inside bordered box)
- Filter modal uses modal pickers for accounts and contacts (same style as create transaction)
- `formatCurrency` uses Intl default fraction digits per currency (no longer hardcodes USD decimals)
- `AmountDisplay` defaults to display currency from settings instead of hardcoded "USD"
- Analytics and home screens pass display currency to all `formatCurrency` calls
- Tab labels, FAB labels, `formatDate`, and `formatLastUpdated` use i18n instead of hardcoded English
- Account delete/archive confirmation uses themed `ConfirmModal` instead of native `Alert.alert`
- Account balance field uses grayed-out placeholder instead of default "0" value
- Removed "(optional)" text from contact field label
- FAB speed dial closes when navigating away via bottom tabs

### Fixed
- Deleting/archiving an account no longer navigates to a blank screen (routes to accounts tab)
- Currency symbol in analytics no longer shows "$" when accounts use a different currency (e.g. PYG)
- Amount field selection bug in account form (removed `selectTextOnFocus` hack)
- Dev build launch with expo-dev-client

### Important
- **Signing key change**: This release uses a new persistent release keystore. Users upgrading from v1.0.4 or earlier must uninstall the old app first (export a backup before updating, then import after). All future updates from v1.1.0 onward will preserve data seamlessly.

## [1.0.4] - 2026-04-09

### Fixed
- Net worth now shows negative sign when liabilities exceed assets (was displaying as positive)
- FAB speed-dial hit zones aligned to actual button positions (drag-to-select was offset)
- FAB hit-test uses touch-relative coordinates to avoid Android status bar offset
- Dev builds (`npm run android`) no longer overwrite the release APK — clean prebuild ensures correct package name

## [1.0.3] - 2026-04-08

### Changed
- Extracted shared `PALETTE_COLORS` and `SUPPORTED_CURRENCIES` constants (no more duplicate arrays)
- New `SelectInput` molecule — reusable select trigger used across transaction and account forms
- New `PickerModal<T>` molecule — generic searchable list picker, replaces inline modal implementations
- TransactionForm refactored to use SelectInput + PickerModal (removed 120-line inline AccountPickerModal)
- PickerModal resets search on both select and close

### Fixed
- Color picker in AccountForm, RecurringForm, ThemeForm: replaced `View` + `onTouchEnd` with `Pressable` + `onPress` (accessibility fix)
- Removed unused styles from TransactionFilterModal after CategoryPicker extraction
- Preserved `#607D8B` in palette to avoid breaking existing account color selections

## [1.0.2] - 2026-04-06

### Fixed
- Release APK no longer connects to Metro when dev build was previously used on the same device (separate URL schemes: `mywallet` for release, `mywallet-dev` for dev)
- Both dev and release builds can coexist on the same device without interference

### Changed
- Backup list: each backup now has a visible restore button (replaces hidden long-press)
- Backup list: each backup has a visible delete button
- Replaced raw backup directory path with explanatory note about private storage
- Extracted shared `restoreData()` function for atomic backup restoration
- Added `npm run android:release` script for one-command release builds

## [1.0.1] - 2026-04-06

### Fixed

#### Credit Card Balance (Breaking Change)
- Balance now represents **available credit**, not debt
- Debt is computed as `creditLimit - balance` (displayed on account detail)
- Expense decreases available credit, payment increases it (same direction as debit accounts)
- Net worth: credit card liability = debt, not raw balance
- Overpaid credit cards (balance > limit) correctly counted as assets
- One-time migration automatically converts existing credit card balances

#### UI/UX
- Eye toggle moved inside net worth card (no longer pushes title off-center)
- Balance field selects "0" on focus for easy replacement
- Display currency setting always visible (not hidden when single currency)
- Currency lists sorted alphabetically in settings and account form
- Reduced spacing around exchange rate update row
- Removed redundant net worth total from accounts list screen
- Subcategory input fills full width in category detail
- Removed empty fragment separator from accounts list

#### Contact Picker
- Shows all contacts immediately on open (no search required to see contacts)
- Frequents section: top 4 most-used contacts + last transaction contact
- Search filters the list while frequents remain visible

#### Accounts
- Separate Archive (soft-delete, restorable) and Delete (permanent) options with confirmation dialogs
- Archive icon in header toggles archived accounts view
- Restore button to un-archive accounts
- Account form label shows "Available Credit" for credit card type

#### Transactions
- Removed redundant Notes field (Description is sufficient)
- Filter modal reuses the existing CategoryPicker component

### Known Limitations
- App icon background color is set at build time and cannot be themed at runtime (Android OS limitation)

## [1.0.0] - 2026-04-06

Initial release of My Wallet.

### Added

#### Core
- 3 transaction types: income, expense, transfer
- 5 account types: debit, credit, cash, wallet, savings
- Categories with subcategories in a many-to-many relationship
- Every category auto-generates a "General" subcategory as a fallback
- Full CRUD for accounts, transactions, categories, and subcategories
- Transaction editing with balance reversal and re-application
- Transaction deletion with linked cashback cleanup
- Account archiving (soft delete)

#### Navigation & UI
- 5 bottom tabs: Home, Transactions, Categories, Analytics, Accounts
- 14 screens total with stack and modal presentations
- Speed dial FAB with drag-to-select for transaction type (Expense, Income, Transfer)
- Atomic design component library: atoms, molecules, organisms, templates
- Consistent HeaderBar across all screens
- SafeAreaView on all modals and screens
- KeyboardAvoidingView on all form modals
- Hardware back button support on all Android modals

#### Home Dashboard
- Net worth display with currency conversion
- Monthly income and expense summary cards
- Upcoming recurring transactions section
- Recent transactions with "See all" link
- Eye toggle to hide amounts (inside balance card)

#### Transaction History
- Date-grouped SectionList with sticky "Today" / "Yesterday" / date headers
- Text search across description and notes
- Advanced filter modal with 7 filter types:
  - Transaction type (multi-select)
  - Date range
  - Amount range
  - Contacts (multi-select)
  - From accounts (collapsible, multi-select)
  - To accounts (collapsible, multi-select)
  - Categories/subcategories (collapsible with badge counts)
- Filter count badge on the filter icon
- Infinite scroll pagination

#### Accounts
- Modal-based account type and currency selectors
- 33 supported currencies
- Color and icon customization
- Account detail screen with transaction history
- Net worth total on accounts list

#### Categories
- Category grid with subcategory counts
- Quick icon grid (19 common icons) + searchable modal with 7000+ MaterialCommunityIcons
- Custom icon shown prominently in grid when selected from search
- Color picker
- Inline subcategory management (add/delete)

#### Cashback
- Toggle-based cashback on expense transactions
- Percentage or flat amount mode (mutually exclusive)
- Live computed amount preview
- Cashback destination account selector
- Instant cashback toggle (auto-creates income transaction on save)
- Deferred cashback with "Confirm Cashback Received" button on transaction detail
- Bidirectional linking between expense and cashback income transactions
- Linked cashback cleaned up on edit or delete

#### Recurring Transactions
- 5 frequency options: daily, weekly, biweekly, monthly, yearly
- Optional end date
- Auto-processed on app foreground with 90-day catchup cap
- Pause/resume and delete
- Category and contact support

#### Contacts
- Integration with device address book via expo-contacts
- Searchable contact picker modal
- Contact transaction history screen
- Contact filter chips on transaction list

#### Location
- Optional location stamps on transactions (configurable in settings)
- Uses last known position first (instant), falls back to GPS
- Reverse geocoding for human-readable location names
- User-friendly error message when location services are disabled

#### Analytics
- Monthly overview: income, expenses, net (color-coded)
- Category breakdown with proportional colored bars
- Daily spending chart
- Month navigation with left/right arrows
- Locale-aware month names
- Respects privacy mode (hide amounts / random numbers)

#### Multi-Currency
- Per-account currency from 33 options
- Display currency setting for unified balance view
- Exchange rates from open.er-api.com (fetched once/day, only when needed)
- Manual refresh button with "last updated" timestamp
- Graceful offline fallback to cached rates
- Exchange rate section auto-hidden when all accounts use same currency

#### Privacy
- Hide amounts toggle (eye icon on home balance card)
- Random numbers mode (shows fake amounts app-wide)
- Both modes have configurable defaults (activate on app open)
- AmountDisplay component respects both modes everywhere

#### Themes
- Light and dark mode following system preference
- User-created themes with custom accent color
- Status bar style control per theme (light, dark, auto)
- Activate, reset to system default, or delete themes

#### Internationalization
- 5 languages: English, Spanish, Portuguese, Japanese, Chinese
- Auto-detects device language on first launch
- Language selector in settings with persistent choice
- All user-visible strings extracted to translation files

#### Data Management
- Automatic daily backup on app foreground (skips if already done today)
- Configurable backup retention (1–10, default 2)
- Manual backup trigger
- Export via system share sheet (JSON)
- Import from file picker with validation
- Atomic import wrapped in SQLite transaction (rollback on failure)
- Backup history with file size, date, type (auto/manual)
- Backup directory path displayed in settings

#### Database
- SQLite via expo-sqlite with Drizzle ORM
- 11 tables: accounts, categories, subcategories, transactions, transaction_subcategories, recurring_transactions, recurring_subcategories, cashback_rules, themes, settings, backups
- Type-safe schema with inferred TypeScript types
- Auto-migration on app startup
- Seed data: 12 default categories with 50+ subcategories
- Batch-enriched transaction queries (3 queries total, not N+1)
- Chunked queries for SQLite's 999-variable limit

#### Developer Experience
- ESLint + Prettier + EditorConfig
- Conventional commit messages throughout
- Drizzle Kit for migration generation
- Custom Metro SQL transformer (inlined migrations)

### Technical Details
- React Native 0.83.4 + Expo SDK 55
- React 19.2 with React Compiler experiment enabled
- TypeScript 5.9 in strict mode
- Expo Router with typed routes
- React Native Reanimated 4.2 for animations
- Package: `dev.melkoh.mywallet`

[2.1.0]: https://github.com/Melkoh02/my-wallet/releases/tag/v2.1.0
[2.0.0]: https://github.com/Melkoh02/my-wallet/releases/tag/v2.0.0
[1.10.0]: https://github.com/Melkoh02/my-wallet/releases/tag/v1.10.0
[1.9.0]: https://github.com/Melkoh02/my-wallet/releases/tag/v1.9.0
[1.8.3]: https://github.com/Melkoh02/my-wallet/releases/tag/v1.8.3
[1.8.2]: https://github.com/Melkoh02/my-wallet/releases/tag/v1.8.2
[1.8.1]: https://github.com/Melkoh02/my-wallet/releases/tag/v1.8.1
[1.8.0]: https://github.com/Melkoh02/my-wallet/releases/tag/v1.8.0
[1.7.0]: https://github.com/Melkoh02/my-wallet/releases/tag/v1.7.0
[1.6.0]: https://github.com/Melkoh02/my-wallet/releases/tag/v1.6.0
[1.5.0]: https://github.com/Melkoh02/my-wallet/releases/tag/v1.5.0
[1.4.0]: https://github.com/Melkoh02/my-wallet/releases/tag/v1.4.0
[1.3.0]: https://github.com/Melkoh02/my-wallet/releases/tag/v1.3.0
[1.2.0]: https://github.com/Melkoh02/my-wallet/releases/tag/v1.2.0
[1.1.1]: https://github.com/Melkoh02/my-wallet/releases/tag/v1.1.1
[1.1.0]: https://github.com/Melkoh02/my-wallet/releases/tag/v1.1.0
[1.0.4]: https://github.com/Melkoh02/my-wallet/releases/tag/v1.0.4
[1.0.3]: https://github.com/Melkoh02/my-wallet/releases/tag/v1.0.3
[1.0.2]: https://github.com/Melkoh02/my-wallet/releases/tag/v1.0.2
[1.0.1]: https://github.com/Melkoh02/my-wallet/releases/tag/v1.0.1
[1.0.0]: https://github.com/Melkoh02/my-wallet/releases/tag/v1.0.0
