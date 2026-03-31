import { useCallback, useEffect, useState } from "react";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import { getAccounts, getAccountsTotals } from "@/db/queries/accounts";
import type { Account } from "@/db/schema";

type AccountTotals = {
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
};

export function useAccounts(activeOnly = true) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [totals, setTotals] = useState<AccountTotals>({
    netWorth: 0,
    totalAssets: 0,
    totalLiabilities: 0,
  });
  const [loading, setLoading] = useState(true);
  const { revisions } = useDataRefresh();

  const fetch = useCallback(async () => {
    setLoading(true);
    const [accs, tots] = await Promise.all([getAccounts(activeOnly), getAccountsTotals()]);
    setAccounts(accs);
    setTotals(tots);
    setLoading(false);
  }, [activeOnly]);

  useEffect(() => {
    fetch();
  }, [fetch, revisions.accounts]);

  return { accounts, totals, loading, refetch: fetch };
}
