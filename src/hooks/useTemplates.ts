import { useCallback, useEffect, useState } from "react";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import { getTemplates, type TemplateWithSubs } from "@/db/queries/templates";

export function useTemplates() {
  const [templates, setTemplates] = useState<TemplateWithSubs[]>([]);
  const [loading, setLoading] = useState(true);
  const { revisions } = useDataRefresh();

  const fetch = useCallback(async () => {
    setLoading(true);
    const data = await getTemplates();
    setTemplates(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch, revisions.templates]);

  return { templates, loading, refetch: fetch };
}
