/* eslint-disable import/first */
import { setupTestDb, resetTestDb, getTestDb } from "@/db/test-client";

jest.mock("@/db/client", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getTestDb } = require("@/db/test-client");
  return {
    get db() {
      return getTestDb();
    },
  };
});

// Default rates: USD display, 1 EUR = 1.10 USD. Tests override per-call when
// they need missing-rate behaviour.
jest.mock("@/services/exchangeRate.service", () => {
  const FAKE_DISPLAY = "USD";
  const FAKE_RATES: Record<string, number> = { USD: 1, EUR: 1 / 1.1 };
  const converter = {
    displayCurrency: FAKE_DISPLAY,
    convert(amount: number, fromCurrency: string) {
      if (fromCurrency === FAKE_DISPLAY) return amount;
      const rate = FAKE_RATES[fromCurrency];
      if (!rate || rate === 0) return amount;
      return amount / rate;
    },
    hasRateFor(fromCurrency: string) {
      if (fromCurrency === FAKE_DISPLAY) return true;
      const rate = FAKE_RATES[fromCurrency];
      return !!rate && rate !== 0;
    },
  };
  return {
    getDisplayCurrency: jest.fn(async () => FAKE_DISPLAY),
    getExchangeRates: jest.fn(async () => FAKE_RATES),
    loadCurrencyConverter: jest.fn(async () => converter),
    captureRateForCurrency: jest.fn(async () => ({
      rateToDisplay: 1,
      displayCurrency: FAKE_DISPLAY,
    })),
  };
});

import {
  createBudget,
  deleteBudget,
  getBudgetById,
  getBudgets,
  getBudgetsWithSpend,
  updateBudget,
} from "./budgets";
import { createTransaction } from "./transactions";
import { categories, subcategories, transactions } from "@/db/schema";
import { makeAccount } from "@/db/test-fixtures";
import { eq } from "drizzle-orm";
import type { Account } from "@/db/schema";

beforeAll(() => setupTestDb());
beforeEach(() => {
  resetTestDb();
  jest.useFakeTimers();
  // Pin "today" deterministically inside January 2026 so periodRange returns
  // the Jan range. Transactions in Jan land in-period.
  jest.setSystemTime(new Date("2026-01-15T12:00:00Z"));
});
afterEach(() => {
  jest.useRealTimers();
});

// --- Test scaffolding ------------------------------------------------------

async function seedCategoryWithSubs(name: string): Promise<{
  categoryId: number;
  subcategoryIds: { general: number; specific: number };
}> {
  const db = getTestDb();
  const [cat] = await db
    .insert(categories)
    .values({ name, color: "#000", icon: "tag", isExpense: true })
    .returning();
  const [general] = await db
    .insert(subcategories)
    .values({ categoryId: cat.id, name: "General", isGeneral: true })
    .returning();
  const [specific] = await db
    .insert(subcategories)
    .values({ categoryId: cat.id, name: "Specific" })
    .returning();
  return { categoryId: cat.id, subcategoryIds: { general: general.id, specific: specific.id } };
}

async function seedExpense(
  account: Account,
  amount: number,
  date: string,
  subcategoryIds: number[],
  overrides: { currency?: string; rateToDisplay?: number | null } = {},
) {
  // Explicit "rateToDisplay" key check — `??` would coerce a deliberately-
  // passed null back to 1, so the missing-rate test would silently pass.
  const rateToDisplay = "rateToDisplay" in overrides ? overrides.rateToDisplay : 1;
  return createTransaction(
    {
      type: "expense",
      amount,
      description: "test",
      accountId: account.id,
      date,
      time: "12:00",
      currency: overrides.currency ?? account.currency,
      rateToDisplay: rateToDisplay ?? null,
      displayCurrencySnapshot: "USD",
    },
    subcategoryIds,
  );
}

// --- CRUD ------------------------------------------------------------------

describe("budgets CRUD", () => {
  it("creates and retrieves a budget", async () => {
    const { categoryId } = await seedCategoryWithSubs("Food");
    const created = await createBudget({
      name: "Groceries",
      categoryId,
      subcategoryId: null,
      amount: 500,
      currency: "USD",
      period: "monthly",
      isActive: true,
    });
    const fetched = await getBudgetById(created.id);
    expect(fetched?.name).toBe("Groceries");
    expect(fetched?.amount).toBe(500);
    expect(fetched?.currency).toBe("USD");
  });

  it("getBudgets only returns isActive=true rows, sorted by sortOrder then id", async () => {
    const { categoryId } = await seedCategoryWithSubs("Food");
    const b1 = await createBudget({
      name: "First",
      categoryId,
      subcategoryId: null,
      amount: 100,
      currency: null,
      period: "monthly",
      isActive: true,
      sortOrder: 2,
    });
    const b2 = await createBudget({
      name: "Second",
      categoryId,
      subcategoryId: null,
      amount: 200,
      currency: null,
      period: "monthly",
      isActive: true,
      sortOrder: 1,
    });
    await createBudget({
      name: "Hidden",
      categoryId,
      subcategoryId: null,
      amount: 300,
      currency: null,
      period: "monthly",
      isActive: false,
    });
    const result = await getBudgets();
    expect(result.map((b) => b.id)).toEqual([b2.id, b1.id]);
  });

  it("update + delete round-trip", async () => {
    const { categoryId } = await seedCategoryWithSubs("Food");
    const created = await createBudget({
      name: "Initial",
      categoryId,
      subcategoryId: null,
      amount: 100,
      currency: null,
      period: "monthly",
      isActive: true,
    });
    await updateBudget(created.id, { amount: 250, name: "Renamed" });
    const after = await getBudgetById(created.id);
    expect(after?.amount).toBe(250);
    expect(after?.name).toBe("Renamed");

    await deleteBudget(created.id);
    expect(await getBudgetById(created.id)).toBeUndefined();
  });
});

// --- Spend computation -----------------------------------------------------

describe("getBudgetsWithSpend — same-currency case", () => {
  it("sums all in-period expenses in the budget's category", async () => {
    const { categoryId, subcategoryIds } = await seedCategoryWithSubs("Food");
    const acc = await makeAccount({ balance: 5000, currency: "USD" });
    await seedExpense(acc, 30, "2026-01-05", [subcategoryIds.general]);
    await seedExpense(acc, 50, "2026-01-10", [subcategoryIds.specific]);
    await seedExpense(acc, 999, "2026-02-01", [subcategoryIds.general]); // out of period

    await createBudget({
      name: "Food",
      categoryId,
      subcategoryId: null,
      amount: 300,
      currency: "USD",
      period: "monthly",
      isActive: true,
    });

    const [budget] = await getBudgetsWithSpend();
    expect(budget.spend).toBe(80);
    expect(budget.remaining).toBe(220);
    expect(budget.percentUsed).toBeCloseTo(26.7, 1);
    expect(budget.approximate).toBe(false);
  });

  it("filters by subcategory when budget targets one", async () => {
    const { categoryId, subcategoryIds } = await seedCategoryWithSubs("Food");
    const acc = await makeAccount({ balance: 5000, currency: "USD" });
    await seedExpense(acc, 30, "2026-01-05", [subcategoryIds.general]); // doesn't match
    await seedExpense(acc, 50, "2026-01-10", [subcategoryIds.specific]); // matches

    await createBudget({
      name: "Food: Specific only",
      categoryId,
      subcategoryId: subcategoryIds.specific,
      amount: 100,
      currency: "USD",
      period: "monthly",
      isActive: true,
    });

    const [budget] = await getBudgetsWithSpend();
    expect(budget.spend).toBe(50);
    expect(budget.subcategoryName).toBe("Specific");
  });

  it("ignores income transactions (only counts expenses)", async () => {
    const { categoryId, subcategoryIds } = await seedCategoryWithSubs("Food");
    const acc = await makeAccount({ balance: 5000 });
    await seedExpense(acc, 100, "2026-01-05", [subcategoryIds.general]);
    // An income with the same subcategory link — should be ignored
    await createTransaction(
      {
        type: "income",
        amount: 99,
        description: "should not count",
        accountId: acc.id,
        date: "2026-01-06",
        time: "12:00",
        currency: "USD",
        rateToDisplay: 1,
        displayCurrencySnapshot: "USD",
      },
      [subcategoryIds.general],
    );

    await createBudget({
      name: "F",
      categoryId,
      subcategoryId: null,
      amount: 500,
      currency: "USD",
      period: "monthly",
      isActive: true,
    });

    const [budget] = await getBudgetsWithSpend();
    expect(budget.spend).toBe(100);
  });

  it("over-budget yields negative remaining and percentUsed > 100", async () => {
    const { categoryId, subcategoryIds } = await seedCategoryWithSubs("Food");
    const acc = await makeAccount({ balance: 5000 });
    await seedExpense(acc, 600, "2026-01-05", [subcategoryIds.general]);
    await createBudget({
      name: "F",
      categoryId,
      subcategoryId: null,
      amount: 500,
      currency: "USD",
      period: "monthly",
      isActive: true,
    });
    const [budget] = await getBudgetsWithSpend();
    expect(budget.spend).toBe(600);
    expect(budget.remaining).toBe(-100);
    expect(budget.percentUsed).toBe(120);
  });
});

describe("getBudgetsWithSpend — multi-subcategory split (amount/N)", () => {
  it("splits a transaction across categories proportionally", async () => {
    // Transaction tagged with one subcategory in Food and one in Transport.
    // The Food budget should see half the amount.
    const food = await seedCategoryWithSubs("Food");
    const transport = await seedCategoryWithSubs("Transport");
    const acc = await makeAccount({ balance: 5000 });
    await seedExpense(acc, 100, "2026-01-05", [
      food.subcategoryIds.general,
      transport.subcategoryIds.general,
    ]);

    await createBudget({
      name: "Food",
      categoryId: food.categoryId,
      subcategoryId: null,
      amount: 500,
      currency: "USD",
      period: "monthly",
      isActive: true,
    });

    const [budget] = await getBudgetsWithSpend();
    expect(budget.spend).toBe(50); // 100 / 2 categories
  });

  it("subcategory-targeted budget gets only its share", async () => {
    const { categoryId, subcategoryIds } = await seedCategoryWithSubs("Food");
    const acc = await makeAccount({ balance: 5000 });
    // Tagged with both Food subcategories (general + specific) — same category
    await seedExpense(acc, 100, "2026-01-05", [subcategoryIds.general, subcategoryIds.specific]);

    await createBudget({
      name: "Specific only",
      categoryId,
      subcategoryId: subcategoryIds.specific,
      amount: 200,
      currency: "USD",
      period: "monthly",
      isActive: true,
    });

    const [budget] = await getBudgetsWithSpend();
    // 1 of 2 subcategory links matches → 100 × 1/2 = 50
    expect(budget.spend).toBe(50);
  });
});

describe("getBudgetsWithSpend — currency", () => {
  it("converts cross-currency txns using the stored stable rate (not approximate)", async () => {
    // EUR txn with a stable stored rate matching today's display = USD. Even
    // though source ≠ display, the historic rate is exact, so approximate
    // stays false. (Approximate means "today's rate was a fallback".)
    const { categoryId, subcategoryIds } = await seedCategoryWithSubs("Food");
    const eur = await makeAccount({ balance: 5000, currency: "EUR" });
    await seedExpense(eur, 100, "2026-01-05", [subcategoryIds.general], {
      currency: "EUR",
      rateToDisplay: 1.1,
    });

    await createBudget({
      name: "Food (USD)",
      categoryId,
      subcategoryId: null,
      amount: 500,
      currency: "USD",
      period: "monthly",
      isActive: true,
    });

    const [budget] = await getBudgetsWithSpend();
    expect(budget.spend).toBeCloseTo(110, 1);
    expect(budget.resolvedCurrency).toBe("USD");
    expect(budget.approximate).toBe(false);
  });

  it("flags approximate when the stored snapshot is stale (today's rate fallback)", async () => {
    const { categoryId, subcategoryIds } = await seedCategoryWithSubs("Food");
    const acc = await makeAccount({ balance: 5000, currency: "EUR" });
    // Stored snapshot doesn't match current display — convertRow falls back
    // to today's rate, which sets usedTodaysRate=true → approximate.
    await seedExpense(acc, 100, "2026-01-05", [subcategoryIds.general], {
      currency: "EUR",
      rateToDisplay: 1.05, // historic
    });
    // Override snapshot to a different display currency so the stable path
    // doesn't fire.
    const db = getTestDb();
    await db.update(transactions).set({ displayCurrencySnapshot: "GBP" });

    await createBudget({
      name: "Food (USD)",
      categoryId,
      subcategoryId: null,
      amount: 500,
      currency: "USD",
      period: "monthly",
      isActive: true,
    });

    const [budget] = await getBudgetsWithSpend();
    expect(budget.approximate).toBe(true);
  });

  it("flags approximate when budget pins to a currency != display", async () => {
    // Display is USD (mocked). Budget pinned to EUR. Even with a
    // same-display transaction, the second hop uses today's rate → approximate.
    const { categoryId, subcategoryIds } = await seedCategoryWithSubs("Food");
    const acc = await makeAccount({ balance: 5000, currency: "USD" });
    await seedExpense(acc, 100, "2026-01-05", [subcategoryIds.general]);

    await createBudget({
      name: "Food (EUR pinned)",
      categoryId,
      subcategoryId: null,
      amount: 500,
      currency: "EUR",
      period: "monthly",
      isActive: true,
    });

    const [budget] = await getBudgetsWithSpend();
    expect(budget.approximate).toBe(true);
    expect(budget.resolvedCurrency).toBe("EUR");
    // 100 USD → 100 × (1/1.1) = ~90.9 EUR via the mock's EUR rate
    expect(budget.spend).toBeCloseTo(100 / 1.1, 1);
  });

  it("uses display currency when budget.currency is null (follow display)", async () => {
    const { categoryId, subcategoryIds } = await seedCategoryWithSubs("Food");
    const acc = await makeAccount({ balance: 5000 });
    await seedExpense(acc, 100, "2026-01-05", [subcategoryIds.general]);

    await createBudget({
      name: "Floating",
      categoryId,
      subcategoryId: null,
      amount: 500,
      currency: null,
      period: "monthly",
      isActive: true,
    });

    const [budget] = await getBudgetsWithSpend();
    expect(budget.resolvedCurrency).toBe("USD"); // mock returns USD
    expect(budget.spend).toBe(100);
    // Same-currency, stable rate → no approximate
    expect(budget.approximate).toBe(false);
  });

  it("excludes rows whose currency has no rate; reports them in missingRates", async () => {
    const { categoryId, subcategoryIds } = await seedCategoryWithSubs("Food");
    const acc = await makeAccount({ balance: 5000 });
    // Row with a currency the converter doesn't know; rateToDisplay null + no
    // entry in rates means convertVia returns null.
    await seedExpense(acc, 99, "2026-01-05", [subcategoryIds.general], {
      currency: "ARS",
      rateToDisplay: null,
    });
    // Plus one valid row to confirm the budget still computes
    await seedExpense(acc, 50, "2026-01-06", [subcategoryIds.general]);

    await createBudget({
      name: "F",
      categoryId,
      subcategoryId: null,
      amount: 500,
      currency: "USD",
      period: "monthly",
      isActive: true,
    });

    const [budget] = await getBudgetsWithSpend();
    expect(budget.spend).toBe(50);
    expect(budget.missingRates).toContain("ARS");
  });
});

describe("getBudgetsWithSpend — period boundaries", () => {
  it("includes day-1 and day-last of the month", async () => {
    const { categoryId, subcategoryIds } = await seedCategoryWithSubs("Food");
    const acc = await makeAccount({ balance: 5000 });
    await seedExpense(acc, 10, "2026-01-01", [subcategoryIds.general]);
    await seedExpense(acc, 20, "2026-01-31", [subcategoryIds.general]);
    await seedExpense(acc, 999, "2025-12-31", [subcategoryIds.general]);
    await seedExpense(acc, 999, "2026-02-01", [subcategoryIds.general]);

    await createBudget({
      name: "F",
      categoryId,
      subcategoryId: null,
      amount: 100,
      currency: "USD",
      period: "monthly",
      isActive: true,
    });
    const [budget] = await getBudgetsWithSpend();
    expect(budget.spend).toBe(30);
  });

  it("returns spend=0 when no transactions exist in the period", async () => {
    const { categoryId } = await seedCategoryWithSubs("Food");
    await makeAccount({ balance: 5000 });
    await createBudget({
      name: "F",
      categoryId,
      subcategoryId: null,
      amount: 100,
      currency: "USD",
      period: "monthly",
      isActive: true,
    });
    const [budget] = await getBudgetsWithSpend();
    expect(budget.spend).toBe(0);
    expect(budget.remaining).toBe(100);
    expect(budget.percentUsed).toBe(0);
  });

  it("ignores transactions in unrelated categories", async () => {
    const food = await seedCategoryWithSubs("Food");
    const other = await seedCategoryWithSubs("Other");
    const acc = await makeAccount({ balance: 5000 });
    await seedExpense(acc, 100, "2026-01-05", [other.subcategoryIds.general]);

    await createBudget({
      name: "Food",
      categoryId: food.categoryId,
      subcategoryId: null,
      amount: 500,
      currency: "USD",
      period: "monthly",
      isActive: true,
    });

    const [budget] = await getBudgetsWithSpend();
    expect(budget.spend).toBe(0);
  });

  it("ignores untagged expenses (no subcategory links)", async () => {
    const { categoryId } = await seedCategoryWithSubs("Food");
    const acc = await makeAccount({ balance: 5000 });
    await seedExpense(acc, 100, "2026-01-05", []); // no subcategory tags

    await createBudget({
      name: "Food",
      categoryId,
      subcategoryId: null,
      amount: 500,
      currency: "USD",
      period: "monthly",
      isActive: true,
    });

    const [budget] = await getBudgetsWithSpend();
    expect(budget.spend).toBe(0);
  });

  it("inactive budgets don't appear in the results", async () => {
    const { categoryId } = await seedCategoryWithSubs("Food");
    await createBudget({
      name: "Inactive",
      categoryId,
      subcategoryId: null,
      amount: 100,
      currency: "USD",
      period: "monthly",
      isActive: false,
    });
    const result = await getBudgetsWithSpend();
    expect(result).toHaveLength(0);
  });
});

describe("getBudgetsWithSpend — multi-budget", () => {
  it("processes several budgets independently in one call", async () => {
    const food = await seedCategoryWithSubs("Food");
    const trans = await seedCategoryWithSubs("Transport");
    const acc = await makeAccount({ balance: 5000 });
    await seedExpense(acc, 50, "2026-01-05", [food.subcategoryIds.general]);
    await seedExpense(acc, 30, "2026-01-06", [trans.subcategoryIds.general]);

    await createBudget({
      name: "Food",
      categoryId: food.categoryId,
      subcategoryId: null,
      amount: 100,
      currency: "USD",
      period: "monthly",
      isActive: true,
    });
    await createBudget({
      name: "Transport",
      categoryId: trans.categoryId,
      subcategoryId: null,
      amount: 60,
      currency: "USD",
      period: "monthly",
      isActive: true,
    });

    const result = await getBudgetsWithSpend();
    expect(result).toHaveLength(2);
    const food$ = result.find((b) => b.name === "Food")!;
    const trans$ = result.find((b) => b.name === "Transport")!;
    expect(food$.spend).toBe(50);
    expect(trans$.spend).toBe(30);
  });

  // Defensive use of the `categories` import for type-checking
  void categories;
  void eq;
});
