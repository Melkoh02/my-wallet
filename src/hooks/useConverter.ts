import { useEffect, useState } from "react";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import { loadCurrencyConverter, type CurrencyConverter } from "@/services/exchangeRate.service";

/**
 * Returns the active currency converter, refetching whenever the display
 * currency or accounts change. Useful for components that need to convert
 * arbitrary amounts synchronously during render (e.g. per-row dual display).
 *
 * Returns `null` until the first load resolves.
 */
export function useConverter(): CurrencyConverter | null {
  const [converter, setConverter] = useState<CurrencyConverter | null>(null);
  const { revisions } = useDataRefresh();

  useEffect(() => {
    let cancelled = false;
    loadCurrencyConverter()
      .then((c) => {
        if (!cancelled) setConverter(c);
      })
      .catch((e) => {
        // getDisplayCurrency / settings read could throw on rare disk errors.
        // getExchangeRates already has cache + 1:1 fallback, so this is
        // typically settings access. Log and leave the converter null so
        // consumers fall back to single-line display rather than crash.
        console.warn("Failed to load currency converter:", e);
      });
    return () => {
      cancelled = true;
    };
  }, [revisions.settings, revisions.accounts]);

  return converter;
}
