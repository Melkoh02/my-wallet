import { createContext, useContext, useEffect, useState } from "react";
import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import { db } from "@/db/client";
import { seed } from "@/db/seed";
import migrations from "@/db/migrations/migrations";

type DatabaseContextValue = {
  isReady: boolean;
};

const DatabaseContext = createContext<DatabaseContextValue>({ isReady: false });

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const { success, error } = useMigrations(db, migrations);
  const [isSeeded, setIsSeeded] = useState(false);

  useEffect(() => {
    if (!success) return;
    seed(db).then(() => setIsSeeded(true));
  }, [success]);

  if (error) {
    throw new Error(`Database migration failed: ${error.message}`);
  }

  if (!success || !isSeeded) {
    return null; // Or a loading screen
  }

  return <DatabaseContext.Provider value={{ isReady: true }}>{children}</DatabaseContext.Provider>;
}

export function useDatabase() {
  return useContext(DatabaseContext);
}
