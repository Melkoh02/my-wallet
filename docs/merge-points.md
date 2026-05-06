# Merge Points

The places where many flows converge. **Touch one of these and you've touched all the things listed under "Converges here" — including ones that don't appear obvious from grepping.** Built for the question "what else am I changing without realizing it?"

This is the first doc to read when planning a change to a load-bearing area. Each entry's "Touch radius" tells you what other flows or invariants you're putting at risk.

---

## How to use this doc

Each entry has:
- **File** — where the merge point lives.
- **Converges here** — the inputs, concerns, or responsibilities that meet at this point.
- **Invariants** — rules that must hold (also in `glossary.md`; cross-referenced here).
- **Touch radius** — what *else* breaks if you change this carelessly. Read this before refactoring.
- **Tested by** — the `flows.md` sections that exercise this point. Run them mentally (or by QA) after any change here.

---

## UI merge points

### 1. Transaction form

**File**: `src/app/transaction/form.tsx` (the route handler) + `src/components/organisms/TransactionForm.tsx` (the form UI).

**Converges here**:
- Three transaction types (expense / income / transfer) sharing one form.
- Cross-currency dual-amount inputs (`amount` + `toAmount`) for transfers between accounts of different currencies.
- Account picker (filtered to active accounts only).
- Category multi-select via subcategories, with "Suggested" chips driven by `getFrequentCategoriesByType`.
- Contact picker (with permission caching at the service level).
- Location service (manual button or auto-fetch on mount, gated by two settings flags).
- Cashback toggles (instant vs pending) which create or defer a linked income row.
- Split-bill module which creates `loan_lent` accounts and optional settling transfers.
- Template apply chip (pre-fills any subset of fields).
- Currency snapshot capture (in `createTransaction`) and balance updates (`updateAccountBalance`).
- Atomic edit path wrapped in `BEGIN TRANSACTION` / `COMMIT` / `ROLLBACK`.
- Linked-transaction cleanup (deletes the linked cashback row before re-applying edits).
- Smart defaults: last account by type, most-recent contact, today's date + now's time.

**Invariants**:
1. Same delta direction across all account types (`updateAccountBalance`). Expense decreases, income increases. Credit cards are not special-cased.
2. Cross-currency transfer credits destination in `toAmount` (destination currency); same-currency uses `amount`. All four call sites (createTransaction, deleteTransaction, edit-reverse, edit-apply) go through the `transferDestAmount(txn)` helper — never read `toAmount` directly.
3. Edit must be atomic: reverse → mutate → apply, all inside `BEGIN/COMMIT/ROLLBACK`. A naked sequence leaves balances and rows desynced on partial failure.
4. Currency snapshot fields (`currency`, `rateToDisplay`, `displayCurrencySnapshot`) captured at insert. Don't rewrite them on edit (would falsify history) — see glossary § "Currency snapshot fields".
5. Instant-cashback creates a linked income row; deleting/editing the original must clean the link.
6. Split-bill block only runs for new transactions (`!params.id`). Editing an originally-split expense does NOT recompute loan accounts — known gap, intentional.

**Touch radius**:
- Any change here affects: balance computation on the source account, balance computation on the destination account (transfers), `linkedTransactionId` integrity, the visible balance on Home / Accounts / Account detail, every analytics aggregate (via row inserts), the auto-suggest chips on subsequent forms (frequents change), recurring rows (no — but they pass through `processDueRecurring` which has its own copy of the rate-capture logic — keep them in sync).
- Adding a new field to a transaction means: schema column → migration → `createTransaction` write → edit-path write → `enrichTransactionsBatch` read → `TransactionFilterModal` if filterable → backup export/restore (free if you used the table directly).

**Tested by**: `flows.md` §2.1, §2.2, §2.3, §2.4, §2.5, §2.6, §2.7, §2.10, §7.1, §7.2.

---

### 2. Account form + Account detail

**Files**:
- `src/app/account/form.tsx` + `src/components/organisms/AccountForm.tsx` (create / edit / archive / delete).
- `src/app/account/[id].tsx` (detail screen with type-specific actions).

**Converges here**:
- Type-specific field sets (credit limit, loan counterparty + interest rate + due date, investment interest rate).
- Currency lock detection (`accountHasTransactions` queries on every load).
- Credit-card limit-delta logic when balance is left untouched on edit.
- Archive (soft) vs hard delete branching, with `AccountInUseError` when references exist.
- Pay Card / Make Payment / Receive Payment / Pay Full action modals — all funnel into `createTransaction` with `type = "transfer"`.
- Quick-add FAB (single-action) pre-filled with this account.
- Counterparty resolution (contact ID + name snapshot).

**Invariants**:
1. Account currency cannot change once any transaction (source, transfer dest, or cashback dest) references it. `AccountCurrencyLockedError` enforces this at the query layer.
2. Hard-delete is blocked at the query layer when references exist (`AccountInUseError`). FK clauses don't enforce this — `expo-sqlite` runs with `PRAGMA foreign_keys = OFF`.
3. Credit-card limit-delta: when `creditLimit` changes and balance is *untouched* (touched-ref, not float equality), `balance` shifts by the delta so `debt = limit − balance` stays constant.
4. Pay Card's "from" picker must exclude the card itself.
5. PaymentModal resets state on every open (so a half-filled previous attempt doesn't leak).

**Touch radius**:
- Account create/edit affects: `getAccountsTotals` (net worth + assets + liabilities), every form's account picker, every aggregate's "missing rates" set if currency changes, the balance card on Home, the account list on Accounts tab, the cashback destination picker (if the account is set as a destination on any pending transaction).
- Adding a new account type means: glossary § "Account types in detail" + the `getAccountsTotals` classification block + `AccountForm` field switch + `Account[id]` action switch + i18n labels in all 5 locales + every type-filtered query (the FAB no-account guard, account currency defaults, etc.).

**Tested by**: `flows.md` §3.1, §3.2, §3.3, §3.4, §3.5.

---

### 3. Settings index

**File**: `src/app/settings/index.tsx`.

**Converges here**:
- Display currency change (warns historical aggregates will mark approximate; updates the `display_currency` setting).
- Manual exchange rate refresh.
- Language change (re-renders all i18n; persists `language` setting).
- Privacy default toggles.
- Location toggle + auto-location sub-toggle.
- Navigation portal to themes, backup, recurring, templates, changelog (sub-screens, each with their own merge surface).

**Invariants**:
1. Changing display currency does NOT mutate transaction rows. It only changes the read-side: aggregates fall back to today's rate (with `≈`) for any row whose `displayCurrencySnapshot` no longer matches.
2. Privacy default toggles only affect *next launch*. Within the session the user toggles freely; defaults restore on cold start.

**Touch radius**:
- Display currency change → every analytics aggregate, the home balance card, the per-row dual display, the account totals on the Accounts tab.
- Language change → every screen re-renders. Translation keys live in `src/i18n/locales/*.json`. Adding a string requires updating all 5 locale files.

**Tested by**: `flows.md` §9.1, §9.3, §9.4, §9.5.

---

## Data merge points

### 4. `updateAccountBalance` — the universal balance mutator

**File**: `src/db/queries/accounts.ts`.

**Converges here**:
- Every transaction insert / update / delete eventually calls this (sometimes twice, for transfers).
- Recurring catchup loops call it once per generated row.
- Investment interest accrual writes balance directly (does NOT go through this function — it's a non-transaction balance write).
- Loan payment modals call this via the transfer they create.

**Invariants**:
1. **Same delta direction for all account types.** Expense → `delta = -amount`. Income → `delta = +amount`. Transfer source → `delta = -amount`. Transfer destination → `delta = +amount` (or `+toAmount` for cross-currency, supplied by the caller).
2. Credit cards are NOT special-cased here. The semantic flip ("balance = available credit" instead of debt) is handled by what the user types in, not by this function. The caller is the same as for any other account.

**Touch radius**:
- Changing the delta math here breaks every transaction type, every account type, and every form path that mutates a transaction. The blast radius is the entire app.
- If you're tempted to special-case an account type here, you're almost certainly approaching the problem from the wrong angle. The semantic flip lives in the user's mental model + UI labels (`accounts.availableCredit` vs `accounts.currentBalance`); it does NOT live in the delta math.

**Tested by**: every transaction flow (`flows.md` §2.*).

---

### 5. `createTransaction` and the currency snapshot capture

**File**: `src/db/queries/transactions.ts`.

**Converges here**:
- Source account currency lookup.
- Rate capture via `captureRateForCurrency`.
- The actual row insert.
- Subcategory link inserts.
- Source-side balance update.
- Destination-side balance update for transfers (with `toAmount` for cross-currency).

**Invariants**:
1. Currency + rate fields are captured at insert time and treated as immutable thereafter. Editing a transaction does NOT re-capture (would falsify history).
2. If the rate is unavailable (offline + no cache), the function still inserts the row with `rateToDisplay = null`. Aggregates surface this via `missingRates`.
3. **The stamping rule is reproduced in three call sites**: this function, `processDueRecurring`, and `triggerRecurringNow` (both in `src/db/queries/recurring.ts`). They share the underlying `captureRateForCurrency` service, but each decides *which* row gets the rate stamped — `processDueRecurring` intentionally stamps only today's catchup row (see merge point #7). When changing the rule, audit all three sites.

**Touch radius**:
- Every transaction-creating screen: the form, recurring catchup, recurring trigger-now, instant-cashback secondary insert, split-bill settling transfers.
- Every aggregate query that reads currency/rate columns: `getMonthSummary`, `getDailySpending`, `getCategorySummary`, `getTrendData`, `getTopContactsByMonth`.

**Tested by**: `flows.md` §2.1–2.5, §2.10, §5.2, §5.4, §7.1.

---

### 6. `convertRow` and `CurrencyConverter` — the conversion gate

**Files**: `src/db/queries/transactions.ts` (`convertRow`); `src/services/exchangeRate.service.ts` (`CurrencyConverter`).

**Converges here**:
- Every aggregate that needs to sum across currencies.
- The "approximate" (`≈`) banner state per aggregate.
- The "missing rates" excluded-currencies state per aggregate.

**Invariants**:
1. `convertRow` returns a tagged union: `{ state: "converted", value, usedTodaysRate } | { state: "excluded", currency }`. The three semantic states (stable / approximate / excluded) are encoded in `state` + `usedTodaysRate`. Type-enforced — collapsing `excluded` to a numeric zero won't compile.
2. `convertRow` never silently converts at face value when no rate is available. Excluding a row is the correct behavior; mixing currencies at face value would corrupt aggregates.
3. `CurrencyConverter` pre-loads display currency + rates *once*, so callers can iterate over many rows synchronously. Don't `await` rate lookups inside aggregate hot loops.

**Touch radius**:
- Adding a new aggregate: it must be `CurrencyConverter`-aware, must `convertRow` each row, and must surface `missingRates` + `usedTodaysRate` to the UI. Every existing aggregate (in `transactions.ts`) is the template.
- Changing the three-state behavior changes every screen's totals at once. UI banners depend on this exact contract.

**Tested by**: `flows.md` §12.* (analytics), §1.2 (foreground rate fetch), §9.1 (display currency change).

---

### 7. `processDueRecurring` and the catchup loop

**File**: `src/db/queries/recurring.ts`.

**Converges here**:
- The 90-day catchup cap.
- Per-item rate capture (one snapshot, used differently for today vs. backdated rows).
- End-date enforcement (auto-deactivates the rule).
- `nextDate` advancement using `getNextDate` with frequency + dayOfMonth/dayOfWeek.
- Subcategory link copy from the recurring row to each generated transaction.
- Balance update via `updateAccountBalance` per generated row.

**Invariants**:
1. Catchup is capped at 90 days. Past the cap, only one transaction (today) is created and `nextDate` is skipped to today's-next.
2. Rate fields are stamped only on the row dated today. Backdated catchup rows leave `rateToDisplay` and `displayCurrencySnapshot` NULL on purpose — today's rate ≠ rate at the row's dated date, so aggregates correctly mark them approximate.
3. End-date: when the next computed date passes `endDate`, the rule deactivates (`isActive = false`).
4. Currency snapshot logic is duplicated from `createTransaction` (see merge point #5). Keep them in sync.

**Touch radius**:
- Triggered on every app foreground. Every change here runs against every active recurring rule on every cold start.
- Affects: balances of every account referenced by an active rule, the transaction list, the home recent-transactions list, every aggregate that includes today's date.

**Tested by**: `flows.md` §1.2, §5.2, §5.4.

---

### 8. `getAccountsTotals` — the net worth source of truth

**File**: `src/db/queries/accounts.ts`.

**Converges here**:
- Per-account-type classification (credit → debt vs overpaid → liability vs asset; loan_borrowed → owed vs overpaid → liability vs asset; everything else → balance sign).
- The `includeInNetWorth` filter.
- Cross-currency conversion via the supplied `convertFn`.

**Invariants**:
1. Credit liability = `creditLimit − balance` (debt is computed, never stored). Overpaid card (debt < 0) → asset.
2. `loan_borrowed` < 0 → liability; > 0 → overpaid → asset. (Inverse of every other account type's "balance is asset.")
3. `loan_lent` follows normal sign convention (positive = asset).
4. Accounts with `includeInNetWorth = false` are skipped entirely (don't appear in either total).

**Touch radius**:
- Net worth on Home, total assets and total liabilities anywhere they appear, the analytics insights card.
- Adding a new account type: this function's classification block must learn it. There is no fallback — unknown types currently fall through the `else` branch and are treated like cash, which may or may not be correct.

**Tested by**: `flows.md` §3.1 (each account type once), §3.5 (limit-delta keeps debt constant).

---

### 9. `AmountDisplay` — the universal number renderer

**File**: `src/components/molecules/AmountDisplay.tsx`.

**Converges here**:
- Privacy mask state (hide vs random vs real).
- Currency symbol resolution via `formatCurrency`.
- Sign prefix (`+` for income, `-` for expense / negative).
- Approximate prefix (`≈` for cross-currency aggregates using today's rate).

**Invariants**:
1. `currency` is required. There is no silent fallback to a global default — every caller must pass the actual currency of the amount (account currency for per-row, display currency for already-converted aggregates). This forces currency mismatches to surface at the type level.
2. `hideAmounts` wins over `randomNumbers`: when both are on, the user sees `••••`.
3. `maskAmount` is stable per session — same real number → same fake number until cold start.

**Touch radius**:
- Every screen that shows a number. Adding a new variant or feature here changes everything at once.

**Tested by**: `flows.md` §10.1, §10.2.

---

### 10. `DataRefreshProvider` — the invalidation hub

**File**: `src/providers/DataRefreshProvider.tsx`.

**Converges here**:
- One revision counter per entity.
- One `invalidate(...keys)` that bumps each named counter.
- Every query hook subscribes to its entity's counter and re-fetches when it bumps.

**Invariants**:
1. Every mutation must call `invalidate(...)` for affected entities. Forgetting this leaves screens stale — the most common bug class in this codebase.
2. Each entity's revision counter is monotonic (only ever increases). Never reset.

**Touch radius**:
- Adding a new entity: add to the `EntityKey` union, add to the initial-state object, update the table in `glossary.md`, and the `invalidateAll` helper in `src/app/settings/backup.tsx` (the restore path bumps everything).
- Removing an entity: same in reverse, plus grep every `invalidate("entityname")` call site.

**Tested by**: indirect — every flow that mutates state and expects screens to refresh.

---

## Lifecycle merge points

### 11. `DatabaseProvider` — the boot pipeline

**File**: `src/providers/DatabaseProvider.tsx`.

**Converges here**:
- Drizzle migrations.
- `seed()` (default categories + subcategories + settings).
- Three one-time data migrations (credit balance flip, default themes, transaction currency backfill).
- The backup-setup gate.
- Four foreground tasks (recurring catchup, investment interest, auto backup, exchange rate refresh).

**Invariants**:
1. Order is load-bearing. See `architecture.md` § "Boot pipeline" for the full chain.
2. One-time data migrations are gated by settings flags for idempotency. Reruns are no-ops.
3. Foreground tasks run only after the backup-setup gate is passed (so the user can't mutate behind the modal).
4. `BackupSetupModal` is rendered inside `AppStack` (within `ThemeProvider`) but its state lives in `DatabaseContext`. Don't move the rendering — see `architecture.md` § "Provider stack".

**Touch radius**:
- Every cold start. Slowing this down or breaking ordering breaks app boot for every user.
- Adding a new one-time migration: pattern is documented in `architecture.md` § "One-time data migrations".

**Tested by**: `flows.md` §1.1, §1.2.

---

### 12. `restoreData` — the destructive import

**File**: `src/services/backup.service.ts`.

**Converges here**:
- Both "Restore Backup" (in-app history) and "Import" (file picker) call this.
- Wraps the entire delete-then-insert sequence in a SQLite transaction.
- Validates backup format (`version`, `accounts`, `transactions`) before the transaction begins.

**Invariants**:
1. Atomic: any insert error rolls back to the state before the call. The user's existing data is never partially overwritten.
2. Delete order = reverse FK dependency order. Insert order = FK dependency order. (Even though FKs are off, the dependency order avoids transient broken references mid-import.)
3. Adding a new entity to the backup means: include in `exportAllData`, include in `restoreData` deletes (right place by dependency order), include in `restoreData` inserts (right place by dependency order). Skipping a table means it's silently lost on import.

**Touch radius**:
- Every user who restores or imports. Bugs here destroy data — review with extra care.
- Backup format compatibility: bumping the structure without bumping `BACKUP_VERSION` breaks restoring older exports.

**Tested by**: `flows.md` §8.4, §8.5, plus the round-trip cross-cutting test in §14.

---

### 13. `useAuthGate` — the protected-action gate

**Files**: `src/hooks/useAuthGate.ts` (the hook), `src/services/auth.service.ts` (biometric + PIN primitives), `src/components/molecules/PinEntryModal.tsx` (the PIN UI).

**Converges here**:
- All paths that perform a protected action (currently: disabling random-numbers, opening Backups).
- Reading the per-action protected setting (`security_protected_*`).
- Biometric availability (hardware check + enrollment check + user-enabled flag).
- PIN verification (hash compare).
- The PIN modal's verify flow.

**Invariants**:
1. Gate order is biometric → PIN → fall-through. If biometric is configured and succeeds, no PIN prompt is shown.
2. When the protected setting is "true" but no auth method is configured, the gate falls through and runs the callback. The Settings screen disables protected toggles in that state, but the hook itself stays defensive.
3. PIN hash is `sha256("{salt}:{pin}")` with a colon delimiter; salt is 16 random bytes per user. Threat model is "casual peek"; not designed for offline-attacker resistance — see `glossary.md` § Security.

**Touch radius**:
- Adding a new protected action: extend `ProtectedAction`, register a settings key (`security_protected_<name>`), add a Switch on `settings/security`, wrap the action's call site with `useAuthGate(name).guard(callback)`, render the matching `<PinEntryModal>` near the call site.
- Changing the gate order or fall-through behaviour affects every protected call site at once. Test with: biometric+PIN, biometric only, PIN only, neither, while the protected setting toggles on/off.
- The PIN modal is rendered per-call-site (each `useAuthGate` call has its own modal state). Sharing one modal across actions would be a refactor — currently fine because at most one gate is active at a time.

**Tested by**: `flows.md` §9.7, §9.8, §9.9.

---

## Quick-reference: changing X breaks Y

| If you change... | You should re-test or re-read... |
| --- | --- |
| `updateAccountBalance` | Every transaction flow + every account type |
| `convertRow` / `CurrencyConverter` | Every analytics aggregate, the home month summary, account totals |
| `getAccountsTotals` | Net worth display, accounts list totals, analytics insights |
| `processDueRecurring` | Recurring rules, app foreground, the 90-day cap behavior |
| `restoreData` | The atomic-import invariant, every entity's data |
| Provider order in `_layout.tsx` | The whole app — context resolution at boot |
| `DataRefreshProvider`'s `EntityKey` | Every `invalidate` call site, the backup restore `invalidateAll` |
| `AmountDisplay` | Every number anywhere in the UI |
| Boot pipeline ordering | First launch, every cold start, the backup-setup gate |
| `useAuthGate` order or fall-through | Every protected-action call site (random-toggle, Backups, future) |
