import { useCallback, useEffect, useState } from "react";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import { getAccounts, getAccountsTotals } from "@/db/queries/accounts";
import { convertToDisplayCurrency, getDisplayCurrency } from "@/services/exchangeRate.service";
import type { Account } from "@/db/schema";

type AccountTotals = {
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  displayCurrency: string;
};

export function useAccounts(activeOnly = true) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [totals, setTotals] = useState<AccountTotals>({
    netWorth: 0,
    totalAssets: 0,
    totalLiabilities: 0,
    displayCurrency: "USD",
  });
  const [loading, setLoading] = useState(true);
  const { revisions } = useDataRefresh();

  const fetch = useCallback(async () => {
    setLoading(true);
    const [accs, tots, dispCurrency] = await Promise.all([
      getAccounts(activeOnly),
      getAccountsTotals(convertToDisplayCurrency),
      getDisplayCurrency(),
    ]);
    setAccounts(accs);
    setTotals({ ...tots, displayCurrency: dispCurrency });
    setLoading(false);
  }, [activeOnly]);

  useEffect(() => {
    fetch();
  }, [fetch, revisions.accounts, revisions.settings]);

  return { accounts, totals, loading, refetch: fetch };
}
