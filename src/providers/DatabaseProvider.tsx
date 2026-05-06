import { createContext, useContext, useEffect, useState } from "react";
import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import { and, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { accounts, places, settings, themes, transactions } from "@/db/schema";
import { seed } from "@/db/seed";
import { processDueRecurring } from "@/db/queries/recurring";
import { applyInvestmentInterest, applyLoanInterest } from "@/db/queries/interest";
import { checkAndRunAutoBackup, BACKUP_SETUP_DONE_KEY } from "@/services/backup.service";
import { checkAndFetchRates } from "@/services/exchangeRate.service";
import { getSetting } from "@/db/queries/settings";
import { bucketLegacyLocations } from "@/utils/placesMigration";
import migrationData from "@/db/migrations/migrations";

type DatabaseContextValue = {
  isReady: boolean;
  needsBackupSetup: boolean;
  dismissBackupSetup: () => void;
};

const DatabaseContext = createContext<DatabaseContextValue>({
  isReady: false,
  needsBackupSetup: false,
  dismissBackupSetup: () => {},
});

/**
 * One-time migration: convert credit card balances from "debt" semantics
 * to "available credit" semantics. In v1.0.0, balance represented debt
 * (expense increased it). In v1.0.1+, balance represents available credit
 * (expense decreases it). For existing credit cards: newBalance = creditLimit - oldBalance.
 */
async function migrateCreditCardBalances() {
  const [flag] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, "credit_balance_migrated"));
  if (flag) return; // Already migrated

  const creditAccounts = await db.select().from(accounts).where(eq(accounts.type, "credit"));

  for (const acc of creditAccounts) {
    // creditLimit should always be set for credit cards, but handle the edge case:
    // if no limit was set, treat the old balance as pure debt → available = 0 - oldBalance
    const limit = acc.creditLimit ?? 0;
    const newBalance = limit - acc.balance;
    await db.update(accounts).set({ balance: newBalance }).where(eq(accounts.id, acc.id));
  }

  await db
    .insert(settings)
    .values({ key: "credit_balance_migrated", value: "true" })
    .onConflictDoNothing();
}

/**
 * One-time backfill: copy account.currency into transactions.currency and
 * recurring_transactions.currency for rows created before Phase 2 (where the
 * column was added nullable). rate_to_display and display_currency_snapshot
 * are intentionally left NULL — we don't have historical rate data, so
 * aggregations will fall back to today's rate (with an ≈ marker) for those
 * rows. Future inserts capture all three fields at insert time.
 */
async function backfillTransactionCurrency() {
  const [flag] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, "txn_currency_backfilled"));
  if (flag) return;

  await db.run(sql`
    UPDATE transactions
    SET currency = (SELECT currency FROM accounts WHERE accounts.id = transactions.account_id)
    WHERE currency IS NULL
  `);
  await db.run(sql`
    UPDATE recurring_transactions
    SET currency = (SELECT currency FROM accounts WHERE accounts.id = recurring_transactions.account_id)
    WHERE currency IS NULL
  `);

  await db
    .insert(settings)
    .values({ key: "txn_currency_backfilled", value: "true" })
    .onConflictDoNothing();
}

/**
 * One-time backfill: convert legacy `transactions.{latitude,longitude,locationName}`
 * rows into Place records and link each transaction to the matching place via
 * `place_id`. Added in v2.0 alongside migration 0010.
 *
 * The legacy columns stay in the schema as a fallback for any row this
 * migration somehow misses; new writes go through `place_id` only. Bucketing
 * heuristic lives in `utils/placesMigration` and is unit-tested separately.
 */
async function backfillPlaces() {
  const [flag] = await db.select().from(settings).where(eq(settings.key, "places_migrated"));
  if (flag) return;

  // why: only consider rows that don't yet have a place_id. After a backup
  // restore from v1 we may rerun this migration against transactions that
  // were already linked in the previous install — the placeId IS NULL guard
  // keeps the rerun a no-op for already-linked rows and prevents duplicate
  // place creation.
  const legacyRows = await db
    .select({
      id: transactions.id,
      latitude: transactions.latitude,
      longitude: transactions.longitude,
      locationName: transactions.locationName,
    })
    .from(transactions)
    .where(
      and(
        isNull(transactions.placeId),
        or(
          isNotNull(transactions.latitude),
          and(isNotNull(transactions.locationName), ne(transactions.locationName, "")),
        ),
      ),
    );

  const buckets = bucketLegacyLocations(legacyRows);

  // invariant: place inserts AND the flag write must commit together.
  // Without the flag inside the transaction, a crash between commit and
  // flag-write would re-run the migration on next boot, creating duplicate
  // place records (the bucketer doesn't know which rows are already linked).
  await db.transaction(async (tx) => {
    for (const bucket of buckets) {
      const inserted = await tx
        .insert(places)
        .values({
          name: bucket.name,
          latitude: bucket.latitude,
          longitude: bucket.longitude,
          source: "migrated",
          visitCount: bucket.transactionIds.length,
        })
        .returning({ id: places.id });
      const placeId = inserted[0].id;

      await tx
        .update(transactions)
        .set({ placeId })
        .where(inArray(transactions.id, bucket.transactionIds));
    }
    await tx
      .insert(settings)
      .values({ key: "places_migrated", value: "true" })
      .onConflictDoNothing();
  });
}

const DEFAULT_THEMES = [
  { name: "Dark Blue", mode: "dark", accentColor: "#3B82F6", statusBarStyle: "light" },
  { name: "Light Blue", mode: "light", accentColor: "#3B82F6", statusBarStyle: "dark" },
  { name: "Dark Pink", mode: "dark", accentColor: "#EC4899", statusBarStyle: "light" },
  { name: "Light Pink", mode: "light", accentColor: "#EC4899", statusBarStyle: "dark" },
] as const;

async function seedDefaultThemes() {
  const [flag] = await db.select().from(settings).where(eq(settings.key, "default_themes_seeded"));
  if (flag) return;

  for (const theme of DEFAULT_THEMES) {
    await db.insert(themes).values(theme);
  }

  await db
    .insert(settings)
    .values({ key: "default_themes_seeded", value: "true" })
    .onConflictDoNothing();
}

// Investment + loan interest accrual lives in src/db/queries/interest.ts so
// it can be unit-tested. Foreground task wiring stays here.

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const { success, error } = useMigrations(db, migrationData);
  const [isSeeded, setIsSeeded] = useState(false);
  const [needsBackupSetup, setNeedsBackupSetup] = useState<boolean | null>(null);

  // invariant: order is load-bearing. schema migrations → seed → one-time data migrations →
  // backup setup gate → foreground tasks. data migrations rely on schema, foreground tasks
  // rely on data. each one-time migration is gated by a settings flag for idempotency.
  // see docs/architecture.md § boot pipeline.
  useEffect(() => {
    if (!success) return;
    seed(db)
      .then(() => migrateCreditCardBalances())
      .then(() => seedDefaultThemes())
      .then(() => backfillTransactionCurrency())
      .then(() => backfillPlaces())
      .then(() => setIsSeeded(true));
  }, [success]);

  useEffect(() => {
    if (!isSeeded) return;
    getSetting(BACKUP_SETUP_DONE_KEY).then((v) => setNeedsBackupSetup(v !== "true"));
  }, [isSeeded]);

  useEffect(() => {
    if (!isSeeded || needsBackupSetup !== false) return;
    processDueRecurring().then((count) => {
      if (count > 0) {
        console.log(`Processed ${count} recurring transaction(s)`);
      }
    });
    applyInvestmentInterest().catch((e) => console.warn("Investment interest failed:", e));
    applyLoanInterest().catch((e) => console.warn("Loan interest failed:", e));
    checkAndRunAutoBackup().then((didBackup) => {
      if (didBackup) {
        console.log("Auto backup completed");
      }
    });
    checkAndFetchRates();
  }, [isSeeded, needsBackupSetup]);

  if (error) {
    throw new Error(`Database migration failed: ${error.message}`);
  }

  if (!success || !isSeeded || needsBackupSetup === null) {
    return null;
  }

  // The modal itself is rendered inside AppStack — outside this provider but
  // inside ThemeProvider — because BackupSetupModal calls useTheme(). Keeping
  // the gate state here lets DatabaseProvider sit at the top of the tree
  // (must wrap ThemeProvider since ThemeProvider queries the DB on mount).
  return (
    <DatabaseContext.Provider
      value={{
        isReady: true,
        needsBackupSetup,
        dismissBackupSetup: () => setNeedsBackupSetup(false),
      }}
    >
      {children}
    </DatabaseContext.Provider>
  );
}

export function useDatabase() {
  return useContext(DatabaseContext);
}
