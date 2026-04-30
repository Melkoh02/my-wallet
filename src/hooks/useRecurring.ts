import { useCallback, useEffect, useState } from "react";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import { getRecurringTransactions, type RecurringWithAccount } from "@/db/queries/recurring";

export function useRecurring(activeOnly = true) {
  const [items, setItems] = useState<RecurringWithAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const { revisions } = useDataRefresh();

  const fetch = useCallback(async () => {
    setLoading(true);
    const result = await getRecurringTransactions(activeOnly);
    setItems(result);
    setLoading(false);
  }, [activeOnly]);

  useEffect(() => {
    fetch();
  }, [fetch, revisions.recurring]);

  return { items, loading, refetch: fetch };
}
