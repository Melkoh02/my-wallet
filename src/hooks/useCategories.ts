import { useCallback, useEffect, useState } from "react";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import { getCategories, type CategoryWithSubs } from "@/db/queries/categories";

export function useCategories(activeOnly = true) {
  const [categories, setCategories] = useState<CategoryWithSubs[]>([]);
  const [loading, setLoading] = useState(true);
  const { revisions } = useDataRefresh();

  const fetch = useCallback(async () => {
    setLoading(true);
    const cats = await getCategories(activeOnly);
    setCategories(cats);
    setLoading(false);
  }, [activeOnly]);

  useEffect(() => {
    fetch();
  }, [fetch, revisions.categories]);

  return { categories, loading, refetch: fetch };
}
