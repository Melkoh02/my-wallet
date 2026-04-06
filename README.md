# My Wallet

A fully offline personal finance tracker built with React Native and Expo.

Track your income, expenses, and transfers across multiple accounts and currencies — all stored locally on your device. No accounts, no servers, no internet required.

## Features

### Transactions
- Income, expense, and transfer types
- Categorize with categories and subcategories (many-to-many)
- Attach contacts from your address book
- Optional location stamps with reverse geocoding
- Cashback tracking with instant or deferred fulfillment
- Full edit and delete support

### Accounts
- 5 account types: Debit, Credit, Cash, Wallet, Savings
- Credit cards with inverted balance logic (expenses increase debt)
- Per-account currency (33 currencies supported)
- Net worth calculation with cross-currency conversion

### Analytics
- Monthly overview: income, expenses, net
- Category breakdown with proportional bars
- Daily spending chart
- Navigate between months

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
- Light and dark mode
- Custom themes with accent color and status bar style
- 5 languages: English, Spanish, Portuguese, Japanese, Chinese

### Data Management
- Automatic daily backups with configurable retention
- Manual backup, export (share as JSON), and import
- Atomic import with SQLite transaction rollback on failure
- Data persists across app updates

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
│   ├── atoms/              AppText, AppButton, AppInput, AppIcon, FAB, Chip, Divider, Switch
│   ├── molecules/          AmountDisplay, CategoryPill, DatePicker, TimePicker, EmptyState, etc.
│   ├── organisms/          TransactionForm, AccountForm, CategoryPicker, ContactPicker, etc.
│   └── templates/          ScreenLayout, ModalLayout, HeaderBar
├── db/
│   ├── schema/             Drizzle table definitions (11 tables)
│   ├── queries/            CRUD + business logic per entity
│   ├── migrations/         SQL migrations (inlined for Metro compatibility)
│   └── seed.ts             Default categories + settings
├── providers/              DatabaseProvider, ThemeProvider, PrivacyProvider, DataRefreshProvider
├── services/               Backup, location, contacts, exchange rates
├── hooks/                  useAccounts, useTransactions, useCategories, useRecurring, etc.
├── theme/                  Color palettes, spacing, typography, tokens
├── i18n/                   i18next config + 5 locale JSON files
├── constants/              Default categories, FAB actions, settings
└── utils/                  Currency/date formatting, date math
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

### Run on Android

```bash
npx expo run:android
```

### Run on iOS

```bash
npx expo run:ios
```

### Lint & Format

```bash
npm run lint
npm run format
```

## Download

Get the latest APK from [Releases](https://github.com/Melkoh02/my-wallet/releases).

## License

Private project by [melkoh.dev](https://melkoh.dev).
