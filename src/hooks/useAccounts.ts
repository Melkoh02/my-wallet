import { useCallback, useEffect, useState } from "react";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import { getAccounts, getAccountsTotals } from "@/db/queries/accounts";
import {
  convertToDisplayCurrency,
  getDisplayCurrency,
  getAccountCurrencies,
} from "@/services/exchangeRate.service";
import type { Account } from "@/db/schema";

type AccountTotals = {
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  displayCurrency: string;
  hasMultipleCurrencies: boolean;
};

export function useAccounts(activeOnly = true) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [totals, setTotals] = useState<AccountTotals>({
    netWorth: 0,
    totalAssets: 0,
    totalLiabilities: 0,
    displayCurrency: "USD",
    hasMultipleCurrencies: false,
  });
  const [loading, setLoading] = useState(true);
  const { revisions } = useDataRefresh();

  const fetch = useCallback(async () => {
    setLoading(true);
    // hasMultipleCurrencies considers archived accounts too — historical
    // aggregates still convert their transactions, and the ≈ marker should
    // surface that even after the user archives every foreign account.
    const [accs, tots, dispCurrency, allCurrencies] = await Promise.all([
      getAccounts(activeOnly),
      getAccountsTotals(convertToDisplayCurrency),
      getDisplayCurrency(),
      getAccountCurrencies(false),
    ]);
    setAccounts(accs);
    const hasMultipleCurrencies = allCurrencies.some((c) => c !== dispCurrency);
    setTotals({ ...tots, displayCurrency: dispCurrency, hasMultipleCurrencies });
    setLoading(false);
  }, [activeOnly]);

  useEffect(() => {
    fetch();
  }, [fetch, revisions.accounts, revisions.settings]);

  return { accounts, totals, loading, refetch: fetch };
}
