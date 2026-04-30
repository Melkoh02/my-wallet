import { createContext, useContext, useEffect, useState } from "react";
import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import { eq, and, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { accounts, settings, themes } from "@/db/schema";
import { seed } from "@/db/seed";
import { processDueRecurring } from "@/db/queries/recurring";
import { checkAndRunAutoBackup, BACKUP_SETUP_DONE_KEY } from "@/services/backup.service";
import { checkAndFetchRates } from "@/services/exchangeRate.service";
import { getSetting } from "@/db/queries/settings";
import { BackupSetupModal } from "@/components/organisms/BackupSetupModal";
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

/**
 * Apply compound interest to investment accounts.
 * Runs on each app foreground. Uses daily compounding:
 * newBalance = balance * (1 + rate/100/365) ^ days
 */
async function applyInvestmentInterest() {
  const today = new Date().toISOString().slice(0, 10);
  const investmentAccounts = await db
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.type, "investment"),
        eq(accounts.isActive, true),
        isNotNull(accounts.interestRate),
      ),
    );

  for (const acc of investmentAccounts) {
    if (!acc.interestRate) continue;
    const lastDate = acc.lastInterestDate ?? acc.createdAt.slice(0, 10);
    if (lastDate >= today) continue;

    // Always advance the date to prevent retroactive interest on zero-balance periods
    if (acc.balance <= 0) {
      await db.update(accounts).set({ lastInterestDate: today }).where(eq(accounts.id, acc.id));
      continue;
    }

    const days = Math.floor((new Date(today).getTime() - new Date(lastDate).getTime()) / 86400000);
    if (days <= 0) continue;

    const dailyRate = acc.interestRate / 100 / 365;
    const newBalance = acc.balance * Math.pow(1 + dailyRate, days);
    const rounded = Math.round(newBalance * 100) / 100;

    await db
      .update(accounts)
      .set({ balance: rounded, lastInterestDate: today })
      .where(eq(accounts.id, acc.id));
  }
}

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const { success, error } = useMigrations(db, migrationData);
  const [isSeeded, setIsSeeded] = useState(false);
  const [needsBackupSetup, setNeedsBackupSetup] = useState<boolean | null>(null);

  useEffect(() => {
    if (!success) return;
    seed(db)
      .then(() => migrateCreditCardBalances())
      .then(() => seedDefaultThemes())
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

  return (
    <DatabaseContext.Provider value={{ isReady: true }}>
      {children}
      <BackupSetupModal visible={needsBackupSetup} onComplete={() => setNeedsBackupSetup(false)} />
    </DatabaseContext.Provider>
  );
}

export function useDatabase() {
  return useContext(DatabaseContext);
}
