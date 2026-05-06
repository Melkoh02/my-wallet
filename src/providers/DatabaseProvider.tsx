import { createContext, useContext, useEffect, useState } from "react";
import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import { db } from "@/db/client";
import { seed } from "@/db/seed";
import { runDataMigrations } from "@/db/dataMigrations";
import { processDueRecurring } from "@/db/queries/recurring";
import { applyInvestmentInterest, applyLoanInterest } from "@/db/queries/interest";
import { checkAndRunAutoBackup, BACKUP_SETUP_DONE_KEY } from "@/services/backup.service";
import { checkAndFetchRates } from "@/services/exchangeRate.service";
import { getSetting } from "@/db/queries/settings";
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

// Investment + loan interest accrual lives in src/db/queries/interest.ts so
// it can be unit-tested. Foreground task wiring stays here. One-time data
// migrations live in src/db/dataMigrations.ts so backup restore can re-run
// them.

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
      .then(() => runDataMigrations())
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
