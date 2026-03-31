import { useCallback, useEffect, useMemo, useState } from "react";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import {
  getTransactions,
  type TransactionWithRelations,
  type TransactionFilters,
} from "@/db/queries/transactions";

export function useTransactions(filters: TransactionFilters = {}) {
  const [transactions, setTransactions] = useState<TransactionWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const { revisions } = useDataRefresh();

  const limit = filters.limit ?? 30;

  // Stabilize filters to avoid re-renders
  const stableFilters = useMemo(
    () => ({
      search: filters.search,
      type: filters.type,
      accountId: filters.accountId,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      limit,
    }),
    [filters.search, filters.type, filters.accountId, filters.dateFrom, filters.dateTo, limit],
  );

  const fetch = useCallback(async () => {
    setLoading(true);
    const result = await getTransactions({ ...stableFilters, offset: 0 });
    setTransactions(result);
    setHasMore(result.length >= limit);
    setLoading(false);
  }, [stableFilters, limit]);

  useEffect(() => {
    fetch();
  }, [fetch, revisions.transactions]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loading) return;
    const result = await getTransactions({
      ...stableFilters,
      offset: transactions.length,
    });
    setTransactions((prev) => [...prev, ...result]);
    setHasMore(result.length >= limit);
  }, [stableFilters, transactions.length, limit, hasMore, loading]);

  return { transactions, loading, hasMore, loadMore, refetch: fetch };
}
