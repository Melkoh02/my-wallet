// Aggregate tests via getMonthSummary — exercises convertRow's three-state
// behaviour (stable / approximate / excluded), missingRates surfacing, and
// usedTodaysRate flag. Tests live here rather than transactions.test.ts to
// keep that file focused on per-row mutations.

/* eslint-disable import/first, import/no-duplicates */
import { setupTestDb, resetTestDb } from "@/db/test-client";

jest.mock("@/db/client", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getTestDb } = require("@/db/test-client");
  return {
    get db() {
      return getTestDb();
    },
  };
});

jest.mock("@/services/exchangeRate.service", () => ({
  captureRateForCurrency: jest.fn(async () => ({
    rateToDisplay: 1,
    displayCurrency: "USD",
  })),
}));

import { createTransaction, getMonthSummary } from "./transactions";
import { createAccount } from "./accounts";
import { getTestDb } from "@/db/test-client";
import { transactions } from "@/db/schema";
import type { CurrencyConverter } from "@/services/exchangeRate.service";
import type { NewAccount } from "@/db/schema";

const baseAccount: Omit<NewAccount, "id"> = {
  name: "Test",
  institution: "",
  type: "debit",
  balance: 0,
  currency: "USD",
  color: "#000",
  icon: "wallet",
  isActive: true,
  includeInNetWorth: true,
};

// Build a CurrencyConverter that knows USD + EUR (1 EUR = 1.10 USD), nothing
// else. Used to test the three convertRow paths.
function buildConverter(displayCurrency = "USD"): CurrencyConverter {
  const rates: Record<string, number> = { USD: 1, EUR: 1 / 1.1 };
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

beforeAll(() => setupTestDb());
beforeEach(() => resetTestDb());

describe("getMonthSummary — convertRow behaviour", () => {
  it("uses the stored rate when displayCurrencySnapshot still matches", async () => {
    const acc = await createAccount({ ...baseAccount, balance: 0, currency: "EUR" });
    // Pre-set the snapshot to simulate "rate captured at insert time."
    await createTransaction(
      {
        type: "expense",
        amount: 100,
        description: "x",
        accountId: acc.id,
        date: "2026-01-15",
        time: "12:00",
        currency: "EUR",
        rateToDisplay: 1.1, // 1 EUR = 1.10 USD at insert
        displayCurrencySnapshot: "USD",
      },
      [],
    );

    const conv = buildConverter("USD");
    const summary = await getMonthSummary(2026, 1, conv);
    // 100 EUR × 1.1 = 110 USD via the stored rate (stable state)
    expect(summary.expense).toBeCloseTo(110, 5);
    expect(summary.usedTodaysRate).toBe(false);
    expect(summary.missingRates).toEqual([]);
  });

  it("falls back to today's rate when snapshot doesn't match (approximate)", async () => {
    const acc = await createAccount({ ...baseAccount, balance: 0, currency: "EUR" });
    await createTransaction(
      {
        type: "expense",
        amount: 100,
        description: "x",
        accountId: acc.id,
        date: "2026-01-15",
        time: "12:00",
        currency: "EUR",
        rateToDisplay: 1.05, // historic rate
        displayCurrencySnapshot: "GBP", // user changed display ccy since insert
      },
      [],
    );

    const conv = buildConverter("USD");
    const summary = await getMonthSummary(2026, 1, conv);
    // Today's rate (1.1) used instead of historic (1.05) → approximate
    expect(summary.expense).toBeCloseTo(110, 5);
    expect(summary.usedTodaysRate).toBe(true);
    expect(summary.missingRates).toEqual([]);
  });

  it("excludes rows when no rate is available at all", async () => {
    const acc = await createAccount({ ...baseAccount, balance: 0, currency: "ARS" });
    // Row has currency=ARS but converter only knows USD/EUR.
    // Pre-set rateToDisplay=null so we hit the "no stored rate, no today's
    // rate" exclusion path.
    await createTransaction(
      {
        type: "expense",
        amount: 5000,
        description: "x",
        accountId: acc.id,
        date: "2026-01-15",
        time: "12:00",
        currency: "ARS",
        rateToDisplay: null,
        displayCurrencySnapshot: "USD",
      },
      [],
    );

    const conv = buildConverter("USD");
    const summary = await getMonthSummary(2026, 1, conv);
    expect(summary.expense).toBe(0); // row excluded from total
    expect(summary.missingRates).toContain("ARS");
  });

  it("excludes rows where currency itself is null (orphaned legacy data)", async () => {
    // Possible for legacy rows where the account was hard-deleted before the
    // Phase-2 currency backfill ran. createTransaction normalises null
    // currencies away by looking up the account, so we have to insert
    // directly to reach this state.
    const acc = await createAccount({ ...baseAccount, balance: 0, currency: "USD" });
    const db = getTestDb();
    await db.insert(transactions).values({
      type: "expense",
      amount: 50,
      description: "legacy",
      accountId: acc.id,
      date: "2026-01-15",
      time: "12:00",
      currency: null,
      rateToDisplay: null,
      displayCurrencySnapshot: null,
    });

    const conv = buildConverter("USD");
    const summary = await getMonthSummary(2026, 1, conv);
    // Excluded — and currency is null, so it doesn't get listed in missingRates.
    expect(summary.expense).toBe(0);
    expect(summary.missingRates).toEqual([]);
  });

  it("computes income, expense, and net correctly", async () => {
    const acc = await createAccount({ ...baseAccount, balance: 1000 });
    await createTransaction(
      {
        type: "income",
        amount: 300,
        description: "salary",
        accountId: acc.id,
        date: "2026-01-15",
        time: "12:00",
      },
      [],
    );
    await createTransaction(
      {
        type: "expense",
        amount: 100,
        description: "lunch",
        accountId: acc.id,
        date: "2026-01-20",
        time: "12:00",
      },
      [],
    );
    await createTransaction(
      {
        type: "expense",
        amount: 50,
        description: "coffee",
        accountId: acc.id,
        date: "2026-01-25",
        time: "12:00",
      },
      [],
    );

    const conv = buildConverter("USD");
    const summary = await getMonthSummary(2026, 1, conv);
    expect(summary.income).toBe(300);
    expect(summary.expense).toBe(150);
    expect(summary.net).toBe(150);
  });

  it("ignores transactions outside the requested month", async () => {
    const acc = await createAccount({ ...baseAccount, balance: 1000 });
    await createTransaction(
      {
        type: "expense",
        amount: 100,
        description: "in",
        accountId: acc.id,
        date: "2026-01-31",
        time: "12:00",
      },
      [],
    );
    await createTransaction(
      {
        type: "expense",
        amount: 999,
        description: "out",
        accountId: acc.id,
        date: "2026-02-01",
        time: "12:00",
      },
      [],
    );

    const conv = buildConverter("USD");
    const jan = await getMonthSummary(2026, 1, conv);
    const feb = await getMonthSummary(2026, 2, conv);
    expect(jan.expense).toBe(100);
    expect(feb.expense).toBe(999);
  });

  it("transfers don't appear in income or expense totals", async () => {
    const a = await createAccount({ ...baseAccount, name: "A", balance: 1000 });
    const b = await createAccount({ ...baseAccount, name: "B", balance: 0 });
    await createTransaction(
      {
        type: "transfer",
        amount: 200,
        description: "x",
        accountId: a.id,
        toAccountId: b.id,
        date: "2026-01-15",
        time: "12:00",
      },
      [],
    );
    const conv = buildConverter("USD");
    const summary = await getMonthSummary(2026, 1, conv);
    expect(summary.income).toBe(0);
    expect(summary.expense).toBe(0);
    expect(summary.net).toBe(0);
  });
});
