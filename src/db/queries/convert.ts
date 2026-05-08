import type { CurrencyConverter } from "@/services/exchangeRate.service";

/**
 * Convert a transaction row's amount to display currency.
 *
 * Returns a tagged union with two states:
 *   - `converted` — usable in totals. `usedTodaysRate=false` when the stored
 *     rate matched today's display currency (historically stable); `true`
 *     when the stored rate was missing/stale and today's rate was used
 *     (caller surfaces the "approximate" banner).
 *   - `excluded` — caller drops the row from totals. `currency` is the source
 *     currency to add to `missingRates` for the UI, or `null` when even the
 *     source currency is unknown.
 *
 * Lives in its own module so both `queries/transactions.ts` (the original
 * owner) and `queries/places.ts` (uses it inside `getPlacesAsGeoJSON`) can
 * import it without forming a circular dependency on each other —
 * `transactions.ts` also imports `incrementVisitCount` from `places.ts`.
 */
// invariant: tagged union enforces the three semantic states (stable / approximate / excluded)
// at the type level. never collapse `excluded` to a numeric zero — that silently corrupts
// cross-currency totals.
export type ConvertedRow =
  | { state: "converted"; value: number; usedTodaysRate: boolean }
  | { state: "excluded"; currency: string | null };

export function convertRow(
  row: {
    amount: number;
    currency: string | null;
    rateToDisplay: number | null;
    displayCurrencySnapshot: string | null;
  },
  converter: CurrencyConverter,
): ConvertedRow {
  // A null currency means we genuinely don't know the source currency — e.g.
  // a row whose account was hard-deleted before the Phase 2 backfill could run.
  if (row.currency == null) {
    return { state: "excluded", currency: null };
  }
  // Path 1: stored rate is still valid → historically stable conversion.
  if (row.rateToDisplay != null && row.displayCurrencySnapshot === converter.displayCurrency) {
    return { state: "converted", value: row.amount * row.rateToDisplay, usedTodaysRate: false };
  }
  // Path 2: fall back to today's rate.
  if (!converter.hasRateFor(row.currency)) {
    return { state: "excluded", currency: row.currency };
  }
  return {
    state: "converted",
    value: converter.convert(row.amount, row.currency),
    usedTodaysRate: true,
  };
}

export type AggregateMeta = {
  missingRates: string[];
  usedTodaysRate: boolean;
};
