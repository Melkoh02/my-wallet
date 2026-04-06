# Claude Code Instructions

## Project Overview
My Wallet — a fully offline personal finance tracker built with React Native (0.83) + Expo SDK 55 + TypeScript strict mode. Drizzle ORM with expo-sqlite for persistence. File-based routing via Expo Router.

## Git Workflow

### Branches
- `main` — stable releases only. Never push directly. Only receives merges from `develop`.
- `develop` — integration branch. All work merges here first before going to `main`.
- `fix/<name>` — bug fix branches. Branch from `develop`, merge back into `develop`.
- `feat/<name>` — feature branches. Branch from `develop`, merge back into `develop`.

### Branch Lifecycle

**For bug fixes (e.g., fixing a crash, correcting a calculation):**
1. `git checkout develop && git checkout -b fix/credit-card-balance`
2. Make changes, commit.
3. When done: merge into `develop`. Do NOT merge directly into `main`.

**For features (e.g., adding budgets, adding reports):**
1. `git checkout develop && git checkout -b feat/budgets`
2. Make changes, commit.
3. When done: merge into `develop`. Do NOT merge directly into `main`.

**Multiple branches can coexist on `develop`.** Features and fixes accumulate on `develop` until the user decides to cut a release. There is no schedule — the user explicitly says when to release.

### Versioning (Semantic Versioning)

The version number is decided at release time, not when creating branches. Look at everything on `develop` since the last release tag and apply these rules:

- **Patch (X.Y.Z+1)** — only bug fixes, no new features. Example: 1.0.1 → 1.0.2.
- **Minor (X.Y+1.0)** — new features added, existing features still work the same. Example: 1.0.2 → 1.1.0.
- **Major (X+1.0.0)** — breaking changes that could affect user data or require manual intervention. Example: 1.1.0 → 2.0.0.

When in doubt, ask the user what version they want.

### Release Process

Only start this when the user explicitly says to release.

1. Determine version number based on changes since last release (see Versioning above).
2. On `develop`, ensure all feature/fix branches are merged and everything is tested.
3. Update version in three places:
   - `package.json` → `"version": "X.Y.Z"`
   - `app.config.ts` → `version: "X.Y.Z"`
   - `src/app/settings/index.tsx` → version display string
4. Commit version bump on `develop`: `git commit -m "chore: bump version to vX.Y.Z"`
5. Merge to main: `git checkout main && git merge develop --no-ff -m "release: vX.Y.Z"`
6. Update `CHANGELOG.md` on main:
   - Add new section above the previous version (follow Keep a Changelog format).
   - Add release link at the bottom of the file.
   - Commit: `git commit -m "docs: update CHANGELOG for vX.Y.Z"`
7. Build APK: `npm run android:release` (this runs prebuild WITHOUT APP_VARIANT, then assembleRelease)
   - IMPORTANT: Do NOT set APP_VARIANT for release builds. The prebuild must use production config.
   - Dev builds use `npm run android` which sets APP_VARIANT=development (different package name + scheme).
8. Copy APK: `cp android/app/build/outputs/apk/release/app-release.apk my-wallet-vX.Y.Z.apk`
9. Push main: `git push origin main`
10. Sync develop: `git checkout develop && git merge main && git push origin develop`
11. Create GitHub release: `gh release create vX.Y.Z ./my-wallet-vX.Y.Z.apk -t "vX.Y.Z — <title>" -F /tmp/release-notes.md`
12. Clean up: `rm my-wallet-vX.Y.Z.apk`

### Commit Messages
Use conventional commits, no co-author line:
- `feat:` — new feature
- `fix:` — bug fix
- `refactor:` — code restructure without behavior change
- `perf:` — performance improvement
- `docs:` — documentation only
- `chore:` — build/config changes

## Code Standards

### Architecture
- Atomic design: `atoms/` → `molecules/` → `organisms/` → `templates/`
- Screens live in `src/app/` (Expo Router file-based routing)
- Business logic in `src/db/queries/`, services in `src/services/`
- State: React Context providers (Theme, Privacy, DataRefresh). No Redux/Zustand.
- Data refresh: `useDataRefresh().invalidate("entity")` after mutations.

### Patterns
- All user-visible strings must use `useTranslation()` from react-i18next. Keys in `src/i18n/locales/en.json`. Update all 5 locale files (en, es, pt, ja, zh).
- All amounts must go through `AmountDisplay` component (respects privacy mode).
- All modals must have `onRequestClose` (Android back button) and `SafeAreaView`.
- Forms inside modals use `ModalLayout` (includes KeyboardAvoidingView).
- Account selectors use modal pickers (not inline chips).
- Use `AppInput`, `AppText`, `AppButton`, `AppIcon` atoms — never raw RN components for UI.
- Colors always from `useTheme().colors` — never hardcoded.

### Database
- Schema: `src/db/schema/` (Drizzle table definitions). 11 tables.
- Migrations: inlined in `src/db/migrations/migrations.js` (Metro can't import .sql).
- After schema changes: `npx drizzle-kit generate`, then manually inline the SQL into migrations.js.
- Seed data: `src/db/seed.ts` runs on first launch.
- One-time data migrations: add to `src/providers/DatabaseProvider.tsx`, gate with a settings flag.

### Credit Card Logic
- `balance` = available credit (positive = can still spend).
- `debt` = `creditLimit - balance` (computed, never stored).
- All account types use the same delta direction: expense decreases, income increases.
- Net worth: liability = debt for credit cards. Overpaid cards count as assets.

### Privacy
- `hideAmounts`: shows "••••" instead of numbers.
- `randomNumbers`: shows fake amounts (via `maskAmount()`).
- Both have configurable defaults (activate on app open) stored in settings.

### Backup
- Auto daily backup on app foreground (gated by settings).
- Import wrapped in SQLite transaction (rollback on failure).
- Export via expo-sharing.

## Quality Checklist
Before any commit:
1. `npm run format` — Prettier
2. `npm run lint` — ESLint (must be clean, warnings OK for pre-existing issues only)

Before any release:
3. Run code reviewer agent on changed files.
4. Fix all BUG and HIGH severity issues.
5. Test on physical Android device.
6. Update version everywhere.
7. Update CHANGELOG.md.
