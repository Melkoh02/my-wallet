# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
