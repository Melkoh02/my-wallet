# Claude Code Instructions

## Project Overview
Froggy (Play Store: "Froggy Money: Expense Tracker") — a fully offline personal finance tracker built with React Native (0.83) + Expo SDK 55 + TypeScript strict mode. Drizzle ORM with expo-sqlite for persistence. File-based routing via Expo Router. Android package: `dev.melkoh.froggy`. iOS bundle: `dev.melkoh.froggy`. Repo URL stays `Melkoh02/my-wallet` for now (not renamed).

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
7. Build artefacts. Two paths, used together for releases that need both:
   - **APK (sideload distribution + GitHub Releases)**: `npm run android:release` → `android/app/build/outputs/apk/release/app-release.apk`. Used for direct sideload installs to friends + the GitHub Releases asset.
   - **AAB (Google Play)**: `npm run android:bundle` → `android/app/build/outputs/bundle/release/app-release.aab`. Required by Play Store for new apps.
   - IMPORTANT: Do NOT set APP_VARIANT for release builds. The prebuild must use production config.
   - Dev builds use `npm run android` which sets APP_VARIANT=development (different package name + scheme).
8. Copy artefacts: `cp android/app/build/outputs/apk/release/app-release.apk froggy-vX.Y.Z.apk` and (when releasing to Play) `cp android/app/build/outputs/bundle/release/app-release.aab froggy-vX.Y.Z.aab`
9. Push main: `git push origin main`
10. Sync develop: `git checkout develop && git merge main && git push origin develop`
11. Create GitHub release: `gh release create vX.Y.Z ./froggy-vX.Y.Z.apk -t "vX.Y.Z — <title>" -F /tmp/release-notes.md`
12. Upload AAB to Play Console (manual via web — Internal Testing track first, then promote to Production once validated).
13. Clean up: `rm froggy-vX.Y.Z.apk froggy-vX.Y.Z.aab`

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

## Documentation

The canonical project docs live in `docs/`:

- **`docs/glossary.md`** — domain vocabulary, invariants, account-type semantics, currency snapshot fields, refresh entities, settings keys, error types.
- **`docs/flows.md`** — user-facing flow inventory grouped by domain. Each flow has trigger → happy path → edge cases.
- **`docs/architecture.md`** — provider stack, data flow on a mutation, migration scheme, boot pipeline, file organization.
- **`docs/merge-points.md`** — the places where many flows converge (transaction form, account form, `updateAccountBalance`, `convertRow`, `processDueRecurring`, `restoreData`, etc.). Each entry lists what converges, the invariants, and the "touch radius" — what else breaks if you change it carelessly.

After implementing a fix or feature, update the docs **only when the change is user-visible or affects shared vocabulary or wiring** — don't open the docs for pure internal refactors.

Update `docs/glossary.md` when:
- A new account type, transaction type, or settings key is added or renamed.
- An invariant or computation rule changes (e.g. how `debt` is derived, what `balance` means for a new account type, currency snapshot semantics).
- A new entity gets a `DataRefresh` key, or an existing one is removed.
- A new error class is thrown to the UI, or an existing one is renamed/removed.

Update `docs/flows.md` when:
- A new screen, modal, or user-facing action ships (or one is removed).
- A flow's trigger changes (e.g. a button moves, a gesture is added, a default is reordered).
- A new edge case is discovered that QA should test for (off-happy-path behavior, error states, race conditions).
- A smart default changes (e.g. account auto-selection, suggested categories).

Update `docs/architecture.md` when:
- Provider order changes or a new provider is added.
- The boot pipeline ordering changes or a new one-time data migration is added.
- The migration scheme (drizzle source → inlined `migrations.js`) changes.

Update `docs/merge-points.md` when:
- A new convergence point appears (e.g. a new central form, a new universal mutator, a new boot-time task).
- The "touch radius" of an existing merge point changes (a new flow now feeds into it, or one stops feeding into it).
- A new cross-table invariant is introduced.

Keep doc edits surgical: edit only the affected sub-section, don't paraphrase nearby content. If a flow no longer exists, delete its section instead of leaving a "deprecated" note.

Don't add doc-style narration in code comments. Code comments only mark non-obvious invariants (`// invariant:`), reasons for surprising choices (`// why:`), or platform/library gotchas (`// gotcha:`). One short line each. Reference the docs only when the explanation genuinely lives there.

### Doc-staleness check

Before merging a feat/fix branch into `develop`, and before cutting a release from `develop` to `main`, run:

```bash
npm run check-docs
```

The script (`scripts/check-docs.sh`) is non-blocking — it just lists `src/` files that changed and which docs are likely candidates if any were missed. If the change is a pure refactor / visual / test-only change, ignore the warning and continue. Otherwise update the docs per the rules above before merging.

## Testing

Tests live next to the source as `*.test.ts` (Jest convention). Run with `npm test` (single run) or `npm run test:watch` (TDD loop). The harness uses:
- **`jest-expo`** preset for the runner.
- **`better-sqlite3`** + **`drizzle-orm/better-sqlite3`** for in-memory DB integration tests. Tests import a swappable test client via `@/db/test-client` (`setupTestDb`, `resetTestDb`, `getTestDb`) and `jest.mock("@/db/client", ...)` redirects production code to the test DB.
- `jest.setup.ts` mocks the Expo native modules (`expo-localization`, `expo-local-authentication`, `expo-crypto`, `expo-sqlite`) with Node-friendly stubs.

What we test:
- Money math at the unit level — every direction × type combination of `updateAccountBalance`, every account-type classification in `getAccountsTotals`, the three-state `convertRow` behaviour, `transferDestAmount`'s `toAmount ?? amount` rule.
- DB-touching invariants — `createTransaction` currency snapshot capture, `deleteTransaction` reversal, `processDueRecurring` catchup + 90-day cap + rate-stamping rule, `restoreData` atomic rollback on insert error.
- Security — PIN hash round-trip, salt regeneration, hex-format salt.

What we don't test (yet): React components, hooks, screens, navigation flows. Add these as the surface area justifies the cost.

When changing money-math code, **run `npm test` before committing**. Failing tests usually mean either the code broke an invariant the docs documented, or the docs and code drifted — fix whichever is wrong, not the test.

There are no documented test skips at the moment — if you add one, also add a line here pointing at the fix branch / issue and the expected behaviour the test asserts.

## Quality Checklist
Before any commit:
1. `npm run format` — Prettier
2. `npm run lint` — ESLint (must be clean, warnings OK for pre-existing issues only)
3. `npm test` — Jest (must be green; documented `it.skip` is OK)
4. If the change is user-visible or shifts shared vocabulary, update `docs/` per the rules in the Documentation section.

Before merging a feat/fix branch into `develop`:
5. `npm run check-docs` — non-blocking reminder; review and update docs if the suggested files apply.

Before any release:
6. `npm run check-docs` against `develop..main` — confirms cumulative doc coverage for the release.
7. Run code reviewer agent on changed files.
8. Fix all BUG and HIGH severity issues.
9. Test on physical Android device.
10. Update version everywhere.
11. Update CHANGELOG.md.
