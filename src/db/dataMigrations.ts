import { and, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { accounts, places, settings, themes, transactions } from "@/db/schema";
import { bucketLegacyLocations } from "@/utils/placesMigration";

/**
 * One-time data migrations run after schema migrations and seed. Each function
 * is idempotent (gated by a `settings` flag) so it can run on every boot AND
 * after a backup restore (which clears the settings table).
 *
 * Lives in its own module so `restoreData` in backup.service.ts can re-run
 * the chain after import — without this, restoring a v1.x backup on v2.0
 * would leave the user without Places until the next cold start because the
 * boot-pipeline `useEffect` is keyed on schema-migration success and never
 * re-fires.
 */

/**
 * v1.0.1 flip: credit card balance went from "debt" semantics to "available
 * credit" semantics. For existing credit cards: newBalance = creditLimit - oldBalance.
 */
export async function migrateCreditCardBalances() {
  const [flag] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, "credit_balance_migrated"));
  if (flag) return;

  const creditAccounts = await db.select().from(accounts).where(eq(accounts.type, "credit"));
  for (const acc of creditAccounts) {
    const limit = acc.creditLimit ?? 0;
    const newBalance = limit - acc.balance;
    await db.update(accounts).set({ balance: newBalance }).where(eq(accounts.id, acc.id));
  }

  await db
    .insert(settings)
    .values({ key: "credit_balance_migrated", value: "true" })
    .onConflictDoNothing();
}

const DEFAULT_THEMES = [
  { name: "Dark Blue", mode: "dark", accentColor: "#3B82F6", statusBarStyle: "light" },
  { name: "Light Blue", mode: "light", accentColor: "#3B82F6", statusBarStyle: "dark" },
  { name: "Dark Pink", mode: "dark", accentColor: "#EC4899", statusBarStyle: "light" },
  { name: "Light Pink", mode: "light", accentColor: "#EC4899", statusBarStyle: "dark" },
] as const;

export async function seedDefaultThemes() {
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

/**
 * Phase-2 backfill: copy account.currency into transactions.currency and
 * recurring_transactions.currency for rows created before the column existed.
 * `rate_to_display` and `display_currency_snapshot` stay NULL — aggregations
 * fall back to today's rate (with the ≈ marker) for those rows.
 */
export async function backfillTransactionCurrency() {
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
 * v2.0 backfill: convert legacy `transactions.{latitude,longitude,locationName}`
 * into Place records and link each transaction via `place_id`. The legacy
 * columns stay alive as fallback for any row this misses. Bucketing heuristic
 * is in `utils/placesMigration` (unit-tested).
 */
export async function backfillPlaces() {
  const [flag] = await db.select().from(settings).where(eq(settings.key, "places_migrated"));
  if (flag) return;

  // why: only rows that aren't already linked. Re-running this after a v1
  // backup restore must not duplicate-create places against transactions that
  // already carry a placeId (from the install before the restore).
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

  // invariant: place inserts AND the flag write commit together. A crash
  // between commit and flag write would re-run the migration on next boot —
  // and without the placeId IS NULL guard above, that meant duplicate places.
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

/**
 * Run every one-time data migration in the load-bearing order. Idempotent
 * via per-migration flags; safe to call on every boot AND after a backup
 * restore (which clears the flag table). Order: credit-balance flip →
 * default themes → currency backfill → places backfill.
 */
export async function runDataMigrations(): Promise<void> {
  await migrateCreditCardBalances();
  await seedDefaultThemes();
  await backfillTransactionCurrency();
  await backfillPlaces();
}
