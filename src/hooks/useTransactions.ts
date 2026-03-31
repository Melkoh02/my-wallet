import { useCallback, useEffect, useRef, useState } from "react";
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
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const limit = filters.limit ?? 30;

  // Serialize filters for dependency tracking
  const filterKey = JSON.stringify({
    search: filters.search,
    types: filters.types,
    accountId: filters.accountId,
    fromAccountIds: filters.fromAccountIds,
    toAccountIds: filters.toAccountIds,
    contactIds: filters.contactIds,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    amountMin: filters.amountMin,
    amountMax: filters.amountMax,
    subcategoryIds: filters.subcategoryIds,
  });

  const fetch = useCallback(async () => {
    setLoading(true);
    const result = await getTransactions({ ...filtersRef.current, offset: 0, limit });
    setTransactions(result);
    setHasMore(result.length >= limit);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, limit]);

  useEffect(() => {
    fetch();
  }, [fetch, revisions.transactions]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loading) return;
    const result = await getTransactions({
      ...filtersRef.current,
      offset: transactions.length,
      limit,
    });
    setTransactions((prev) => [...prev, ...result]);
    setHasMore(result.length >= limit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, transactions.length, limit, hasMore, loading]);

  return { transactions, loading, hasMore, loadMore, refetch: fetch };
}
