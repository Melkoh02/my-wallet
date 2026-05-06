import { createContext, useCallback, useContext, useMemo, useState } from "react";

type EntityKey =
  | "accounts"
  | "categories"
  | "transactions"
  | "recurring"
  | "themes"
  | "settings"
  | "backups"
  | "templates"
  | "budgets"
  | "places";

type DataRefreshContextValue = {
  revisions: Record<EntityKey, number>;
  invalidate: (...keys: EntityKey[]) => void;
};

const DataRefreshContext = createContext<DataRefreshContextValue | null>(null);

export function DataRefreshProvider({ children }: { children: React.ReactNode }) {
  const [revisions, setRevisions] = useState<Record<EntityKey, number>>({
    accounts: 0,
    categories: 0,
    transactions: 0,
    recurring: 0,
    themes: 0,
    settings: 0,
    backups: 0,
    templates: 0,
    budgets: 0,
    places: 0,
  });

  const invalidate = useCallback((...keys: EntityKey[]) => {
    setRevisions((prev) => {
      const next = { ...prev };
      for (const key of keys) {
        next[key] = prev[key] + 1;
      }
      return next;
    });
  }, []);

  const value = useMemo(() => ({ revisions, invalidate }), [revisions, invalidate]);

  return <DataRefreshContext.Provider value={value}>{children}</DataRefreshContext.Provider>;
}

export function useDataRefresh() {
  const ctx = useContext(DataRefreshContext);
  if (!ctx) throw new Error("useDataRefresh must be used within DataRefreshProvider");
  return ctx;
}
