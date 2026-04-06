import { createContext, useContext, useEffect, useState } from "react";
import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { accounts, settings } from "@/db/schema";
import { seed } from "@/db/seed";
import { processDueRecurring } from "@/db/queries/recurring";
import { checkAndRunAutoBackup } from "@/services/backup.service";
import { checkAndFetchRates } from "@/services/exchangeRate.service";
import migrationData from "@/db/migrations/migrations";

type DatabaseContextValue = {
  isReady: boolean;
};

const DatabaseContext = createContext<DatabaseContextValue>({ isReady: false });

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

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const { success, error } = useMigrations(db, migrationData);
  const [isSeeded, setIsSeeded] = useState(false);

  useEffect(() => {
    if (!success) return;
    seed(db)
      .then(() => migrateCreditCardBalances())
      .then(() => setIsSeeded(true));
  }, [success]);

  useEffect(() => {
    if (!isSeeded) return;
    processDueRecurring().then((count) => {
      if (count > 0) {
        console.log(`Processed ${count} recurring transaction(s)`);
      }
    });
    checkAndRunAutoBackup().then((didBackup) => {
      if (didBackup) {
        console.log("Auto backup completed");
      }
    });
    checkAndFetchRates();
  }, [isSeeded]);

  if (error) {
    throw new Error(`Database migration failed: ${error.message}`);
  }

  if (!success || !isSeeded) {
    return null;
  }

  return <DatabaseContext.Provider value={{ isReady: true }}>{children}</DatabaseContext.Provider>;
}

export function useDatabase() {
  return useContext(DatabaseContext);
}
