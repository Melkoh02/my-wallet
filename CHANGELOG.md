# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.0.3]: https://github.com/Melkoh02/my-wallet/releases/tag/v1.0.3
[1.0.2]: https://github.com/Melkoh02/my-wallet/releases/tag/v1.0.2
[1.0.1]: https://github.com/Melkoh02/my-wallet/releases/tag/v1.0.1
[1.0.0]: https://github.com/Melkoh02/my-wallet/releases/tag/v1.0.0
