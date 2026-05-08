# Froggy — Money: Expense Tracker

A fully offline personal finance tracker built with React Native and Expo.

Track your income, expenses, and transfers across multiple accounts and currencies — all stored locally on your device. No accounts, no servers, no internet required.

> **About the rebrand**: this project was previously called "My Wallet". Starting v2.2, it ships as "Froggy" on the device launcher and "Froggy Money: Expense Tracker" on the Play Store. Android package is `dev.melkoh.froggy`.

## Documentation

If you're new here, read in this order:

1. **[`docs/glossary.md`](docs/glossary.md)** — domain vocabulary, invariants, and the non-obvious rules (credit-card balance/debt inversion, currency snapshot fields, refresh entities, settings keys). Start here. Most surprising behavior in the codebase has its "why" recorded.
2. **[`docs/flows.md`](docs/flows.md)** — every user-facing flow, grouped by domain. Each flow has trigger → happy path → edge cases. Useful for QA and for "what does this app actually do?".
3. **[`docs/architecture.md`](docs/architecture.md)** — provider stack, data flow on a mutation, migration scheme, boot pipeline. Read before changing anything load-bearing.
4. **[`docs/merge-points.md`](docs/merge-points.md)** — the places where many flows converge (transaction form, account form, balance math, currency conversion gate, boot pipeline, restore). Read this when planning a change to figure out what *else* you might be touching.

`CHANGELOG.md` documents what shipped in each version. `CLAUDE.md` is for the AI assistant — humans usually don't need to read it, but it documents project rules and the doc-update discipline.

## Features

### Transactions
- Income, expense, and transfer types
- Categorize with categories and subcategories (many-to-many)
- Smart defaults: account and category suggestions based on recent usage
- Thousand separator formatting on amount fields
- Attach contacts from your address book
- Optional location stamps with reverse geocoding
- Cashback tracking with instant or deferred fulfillment
- Full edit and delete support

### Accounts
- 8 account types: Debit, Credit, Cash, Wallet, Savings, Loan Borrowed, Loan Lent, Investment
- Credit cards: balance = available credit, debt computed as limit − balance
- Loans: counterparty (contact or manual), optional interest rate and due date
- Investments: optional annual interest rate with daily compound accrual on app open
- Per-account currency (33 currencies supported)
- Net worth calculation with cross-currency conversion (per-account opt-out)
- Account required guard — prompts to create an account before first transaction

### Analytics
- Monthly overview: income, expenses, net
- Category breakdown with proportional bars
- Daily spending chart
- Navigate between months
- Respects display currency setting

### Recurring Transactions
- Daily, weekly, biweekly, monthly, yearly frequencies
- Auto-processed on app open (90-day catchup cap)
- Pause, resume, and delete

### Multi-Currency
- Display currency setting with automatic conversion
- Exchange rates fetched once per day (only when multiple currencies exist)
- Graceful offline fallback to cached rates

### Privacy
- Hide amounts with eye toggle
- Random numbers mode (shows fake amounts everywhere)
- Both modes configurable to activate on app open

### Customization
- Light and dark mode with system default option
- Custom themes with accent color and status bar style
- Default themes seeded on first launch
- 5 languages: English, Spanish, Portuguese, Japanese, Chinese

### Data Management
- Automatic daily backups with configurable retention
- Manual backup, export (share as JSON), and import
- Atomic import with SQLite transaction rollback on failure
- Data persists across app updates (persistent release signing key)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React Native 0.83 + Expo SDK 55 |
| Language | TypeScript (strict mode) |
| Navigation | Expo Router (file-based) |
| Database | SQLite via expo-sqlite |
| ORM | Drizzle ORM (type-safe schema + migrations) |
| State | React Context (Theme, Privacy, Data Refresh) |
| Icons | MaterialCommunityIcons (7000+) |
| Animations | React Native Reanimated |
| i18n | i18next + react-i18next + expo-localization |

## Project Structure

```
src/
├── app/                    Expo Router screens (file-based routing)
│   ├── (tabs)/             Bottom tab screens (Home, Transactions, Categories, Analytics, Accounts)
│   ├── account/            Account detail + form
│   ├── transaction/        Transaction detail + form
│   ├── category/           Category detail + form
│   ├── recurring/          Recurring list + form
│   ├── contact/            Contact transaction history
│   └── settings/           Settings, themes, backup
├── components/
│   ├── atoms/              AppText, AppButton, AppInput, AppIcon, FAB, Chip, ConfirmModal, Divider
│   ├── molecules/          AmountDisplay, SelectInput, PickerModal, DatePicker, TimePicker, etc.
│   ├── organisms/          TransactionForm, AccountForm, CategoryPicker, ContactPicker, etc.
│   └── templates/          ScreenLayout, ModalLayout, HeaderBar
├── db/
│   ├── schema/             Drizzle table definitions (11 tables)
│   ├── queries/            CRUD + business logic per entity
│   ├── migrations/         SQL migrations (inlined for Metro compatibility)
│   └── seed.ts             Default categories, settings, and themes
├── providers/              DatabaseProvider, ThemeProvider, PrivacyProvider, DataRefreshProvider
├── services/               Backup, location, contacts, exchange rates
├── hooks/                  useAccounts, useTransactions, useCategories, useRecurring, etc.
├── theme/                  Color palettes, spacing, typography, tokens
├── i18n/                   i18next config + 5 locale JSON files
├── constants/              Currencies, palette colors, FAB actions
├── plugins/                Expo config plugins (release signing)
└── utils/                  Currency/date formatting, amount input helpers
```

## Getting Started

### Prerequisites

- Node.js 18+
- Android Studio with SDK (for Android builds)
- Xcode (for iOS builds, macOS only)

### Install

```bash
git clone https://github.com/Melkoh02/my-wallet.git
cd my-wallet
npm install
```

### Development Build

```bash
npm run android          # Dev build (development variant)
```

### Release builds

Two artefacts produced from the same prebuild output, used together for releases that need both:

```bash
npm run android:release  # APK → android/app/build/outputs/apk/release/app-release.apk
npm run android:bundle   # AAB → android/app/build/outputs/bundle/release/app-release.aab
```

- **APK**: sideload distribution (the GitHub Releases asset that friends drag onto a device).
- **AAB**: Google Play Store upload (Play requires AABs for new apps).

Release builds are signed with `release.keystore` (project root). Passwords are in `keystore.properties` (gitignored). See `plugins/withReleaseSigning.js` for how signing is injected at prebuild time.

### Lint & Format

```bash
npm run lint
npm run format
```

## Download

Get the latest APK from [Releases](https://github.com/Melkoh02/my-wallet/releases).

## License

Private project by [melkoh.dev](https://melkoh.dev).
