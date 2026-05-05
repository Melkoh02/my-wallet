import { getSetting, setSetting } from "@/db/queries/settings";
import { getAccounts } from "@/db/queries/accounts";

type RateCache = {
  base: string;
  rates: Record<string, number>;
  updatedAt: string;
};

const API_URL = "https://open.er-api.com/v6/latest";
const CACHE_KEY = "exchange_rates_cache";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

async function getCachedRates(): Promise<RateCache | null> {
  const raw = await getSetting(CACHE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveCachedRates(cache: RateCache): Promise<void> {
  await setSetting(CACHE_KEY, JSON.stringify(cache));
}

/**
 * Fetch rates from API for the given base currency.
 * Returns null if fetch fails (offline, etc).
 */
async function fetchRates(base: string): Promise<Record<string, number> | null> {
  try {
    const response = await fetch(`${API_URL}/${base}`);
    if (!response.ok) return null;
    const data = await response.json();
    if (data.result !== "success") return null;
    return data.rates;
  } catch {
    return null; // Offline or API down — graceful failure
  }
}

/**
 * Get the display currency from settings. Defaults to USD.
 */
export async function getDisplayCurrency(): Promise<string> {
  return (await getSetting("display_currency")) ?? "USD";
}

/**
 * Get unique currencies from accounts. Defaults to active-only (used for
 * deciding which rates to fetch); pass `activeOnly=false` to also include
 * archived accounts (used by aggregate-display flags, since archived accounts
 * still contribute historical transactions).
 */
export async function getAccountCurrencies(activeOnly = true): Promise<string[]> {
  const accs = await getAccounts(activeOnly);
  return [...new Set(accs.map((a) => a.currency))];
}

/**
 * Get exchange rates, fetching from API only if stale (>24h) and needed.
 * Returns rates relative to the display currency.
 */
export async function getExchangeRates(): Promise<Record<string, number>> {
  const displayCurrency = await getDisplayCurrency();
  const currencies = await getAccountCurrencies();

  // If all accounts use the display currency, no conversion needed
  const needsConversion = currencies.some((c) => c !== displayCurrency);
  if (!needsConversion) {
    return { [displayCurrency]: 1 };
  }

  // Check cache
  const cached = await getCachedRates();
  if (cached && cached.base === displayCurrency) {
    const age = Date.now() - new Date(cached.updatedAt).getTime();
    if (age < ONE_DAY_MS) {
      return cached.rates;
    }
  }

  // Fetch fresh rates
  const rates = await fetchRates(displayCurrency);
  if (rates) {
    const cache: RateCache = {
      base: displayCurrency,
      rates,
      updatedAt: new Date().toISOString(),
    };
    await saveCachedRates(cache);
    return rates;
  }

  // Fallback to cached (even if stale)
  if (cached?.rates) return cached.rates;

  // No rates available — return 1:1 as last resort
  return { [displayCurrency]: 1 };
}

/**
 * Convert an amount from one currency to the display currency.
 */
export async function convertToDisplayCurrency(
  amount: number,
  fromCurrency: string,
): Promise<number> {
  const displayCurrency = await getDisplayCurrency();
  if (fromCurrency === displayCurrency) return amount;

  const rates = await getExchangeRates();
  const rate = rates[fromCurrency];
  if (!rate || rate === 0) return amount; // Can't convert, return as-is

  // rates are relative to display currency, so:
  // 1 displayCurrency = rate fromCurrency
  // amount fromCurrency = amount / rate displayCurrency
  return amount / rate;
}

/**
 * A pre-loaded currency converter for use inside aggregate queries.
 * Loads display currency + rates once; lets callers convert synchronously
 * over many rows and track which currencies had no rate available.
 */
export type CurrencyConverter = {
  displayCurrency: string;
  convert: (amount: number, fromCurrency: string) => number;
  hasRateFor: (fromCurrency: string) => boolean;
};

export async function loadCurrencyConverter(): Promise<CurrencyConverter> {
  const displayCurrency = await getDisplayCurrency();
  const rates = await getExchangeRates();
  return {
    displayCurrency,
    convert(amount, fromCurrency) {
      if (fromCurrency === displayCurrency) return amount;
      const rate = rates[fromCurrency];
      if (!rate || rate === 0) return amount;
      return amount / rate;
    },
    hasRateFor(fromCurrency) {
      if (fromCurrency === displayCurrency) return true;
      const rate = rates[fromCurrency];
      return !!rate && rate !== 0;
    },
  };
}

/**
 * Capture currency + rate-to-display + display-currency snapshot at the
 * moment of creating a transaction. This is what makes Phase 2 historical
 * aggregations stable. Returns rateToDisplay = null when no rate is
 * available; aggregate queries fall back to today's rate (marked ≈) for
 * those rows.
 */
export async function captureRateForCurrency(fromCurrency: string): Promise<{
  rateToDisplay: number | null;
  displayCurrency: string;
}> {
  const displayCurrency = await getDisplayCurrency();
  if (fromCurrency === displayCurrency) {
    return { rateToDisplay: 1, displayCurrency };
  }
  const rates = await getExchangeRates();
  const rate = rates[fromCurrency];
  if (!rate || rate === 0) {
    // invariant: null = no rate available. callers must leave the field NULL, never fabricate.
    return { rateToDisplay: null, displayCurrency };
  }
  // invariant: rateToDisplay = 1/apiRate so reads multiply (amount × rate). don't flip.
  return { rateToDisplay: 1 / rate, displayCurrency };
}

/**
 * Force refresh exchange rates regardless of cache age.
 */
export async function refreshExchangeRates(): Promise<boolean> {
  const displayCurrency = await getDisplayCurrency();
  const rates = await fetchRates(displayCurrency);
  if (rates) {
    await saveCachedRates({
      base: displayCurrency,
      rates,
      updatedAt: new Date().toISOString(),
    });
    return true;
  }
  return false;
}

/**
 * Check and fetch rates on app startup if stale and multi-currency.
 */
export async function checkAndFetchRates(): Promise<void> {
  const currencies = await getAccountCurrencies();
  const displayCurrency = await getDisplayCurrency();
  const needsConversion = currencies.some((c) => c !== displayCurrency);
  if (!needsConversion) return;

  const cached = await getCachedRates();
  if (cached && cached.base === displayCurrency) {
    const age = Date.now() - new Date(cached.updatedAt).getTime();
    if (age < ONE_DAY_MS) return; // Still fresh
  }

  await refreshExchangeRates();
}
