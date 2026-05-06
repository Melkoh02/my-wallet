import { eq, and, like, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  budgets,
  categories,
  subcategories,
  transactions,
  transactionSubcategories,
  type Budget,
  type NewBudget,
} from "@/db/schema";
import {
  loadCurrencyConverter,
  getExchangeRates,
  type CurrencyConverter,
} from "@/services/exchangeRate.service";
import { convertRow } from "./transactions";

export type BudgetWithSpend = Budget & {
  /** Resolved currency: budget.currency when set, else current display currency. */
  resolvedCurrency: string;
  categoryName: string;
  categoryColor: string;
  categoryIcon: string;
  /** Subcategory name when budget targets a specific subcategory. */
  subcategoryName: string | null;
  /** Total spent this period, in `resolvedCurrency`. */
  spend: number;
  /** amount - spend (can go negative when over budget). */
  remaining: number;
  /**
   * `spend / amount × 100`, rounded to one decimal. Capped at 9999 so a
   * runaway over-budget number doesn't blow up the UI.
   */
  percentUsed: number;
  /** True when at least one transaction needed today's rate to convert (UI shows ≈). */
  approximate: boolean;
  /** Source currencies whose rate couldn't be resolved — those rows were dropped. */
  missingRates: string[];
};

export async function getBudgets(): Promise<Budget[]> {
  return db
    .select()
    .from(budgets)
    .where(eq(budgets.isActive, true))
    .orderBy(budgets.sortOrder, budgets.id);
}

export async function getBudgetById(id: number): Promise<Budget | undefined> {
  const [row] = await db.select().from(budgets).where(eq(budgets.id, id));
  return row;
}

export async function createBudget(data: NewBudget): Promise<Budget> {
  const [row] = await db.insert(budgets).values(data).returning();
  return row;
}

export async function updateBudget(
  id: number,
  data: Partial<Omit<NewBudget, "id">>,
): Promise<void> {
  await db.update(budgets).set(data).where(eq(budgets.id, id));
}

export async function deleteBudget(id: number): Promise<void> {
  // Hard delete — budgets carry no historical state worth preserving (unlike
  // categories, where deletion would orphan transactions). A user re-creating
  // the same budget gets a fresh row.
  await db.delete(budgets).where(eq(budgets.id, id));
}

// --- Spend computation ----------------------------------------------------

/**
 * Convert an already-in-display-currency amount to the budget's pinned
 * currency using today's rate. The rate cache is keyed relative to display
 * (`rates[X]` = X per 1 display unit), so this is a single multiplication.
 *
 * Returns null when no rate for `toCcy` is available — caller drops the row
 * and reports `toCcy` in `missingRates`.
 */
function displayToTarget(
  amountInDisplay: number,
  toCcy: string,
  rates: Record<string, number>,
  displayCcy: string,
): number | null {
  if (toCcy === displayCcy) return amountInDisplay;
  const toRate = rates[toCcy];
  if (!toRate || toRate === 0) return null;
  return amountInDisplay * toRate;
}

/**
 * Period range as YYYY-MM-DD strings. v2.0 only supports 'monthly' — extending
 * to weekly/yearly later means adding cases here.
 */
function periodRange(period: string, now = new Date()): { from: string; to: string } {
  if (period === "monthly") {
    const y = now.getFullYear();
    const m = now.getMonth();
    const from = `${y}-${String(m + 1).padStart(2, "0")}-01`;
    // Last day of current month
    const lastDay = new Date(y, m + 1, 0).getDate();
    const to = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    return { from, to };
  }
  // Defensive default: current calendar month, same as above.
  return periodRange("monthly", now);
}

export async function getBudgetsWithSpend(): Promise<BudgetWithSpend[]> {
  const allBudgets = await db
    .select()
    .from(budgets)
    .where(eq(budgets.isActive, true))
    .orderBy(budgets.sortOrder, budgets.id);
  if (allBudgets.length === 0) return [];

  // Resolve display currency + rates + the shared display converter once for
  // the whole batch. We delegate the per-row stable/approximate/excluded
  // decision to convertRow so budgets stay consistent with analytics.
  const converter = await loadCurrencyConverter();
  const displayCcy = converter.displayCurrency;
  const rates = await getExchangeRates();

  // Pull the categories + subcategories needed for every budget's display row.
  const categoryIds = [...new Set(allBudgets.map((b) => b.categoryId))];
  const subcategoryIds = [
    ...new Set(allBudgets.map((b) => b.subcategoryId).filter((x): x is number => x != null)),
  ];
  const categoryRows =
    categoryIds.length > 0
      ? await db.select().from(categories).where(inArray(categories.id, categoryIds))
      : [];
  const subcategoryRows =
    subcategoryIds.length > 0
      ? await db.select().from(subcategories).where(inArray(subcategories.id, subcategoryIds))
      : [];
  const categoryById = new Map(categoryRows.map((c) => [c.id, c]));
  const subcategoryById = new Map(subcategoryRows.map((s) => [s.id, s]));

  const results: BudgetWithSpend[] = [];
  for (const budget of allBudgets) {
    const targetCcy = budget.currency ?? displayCcy;
    const cat = categoryById.get(budget.categoryId);
    const sub =
      budget.subcategoryId != null ? (subcategoryById.get(budget.subcategoryId) ?? null) : null;

    const { from } = periodRange(budget.period);
    // Use a YYYY-MM prefix for the LIKE — current periodRange returns a
    // calendar-month range, so the prefix matches every day in it. When
    // weekly/yearly arrive we'll switch to BETWEEN(from, to) instead.
    const monthPrefix = from.slice(0, 7);

    // Find expense transactions in the period whose subcategory links match
    // the budget's category (and optional subcategory).
    const periodTxnRows = await db
      .select({
        id: transactions.id,
        amount: transactions.amount,
        currency: transactions.currency,
        rateToDisplay: transactions.rateToDisplay,
        displayCurrencySnapshot: transactions.displayCurrencySnapshot,
      })
      .from(transactions)
      .where(and(eq(transactions.type, "expense"), like(transactions.date, `${monthPrefix}%`)));
    if (periodTxnRows.length === 0) {
      const amount = budget.amount;
      results.push({
        ...budget,
        resolvedCurrency: targetCcy,
        categoryName: cat?.name ?? "",
        categoryColor: cat?.color ?? "#6B7280",
        categoryIcon: cat?.icon ?? "tag",
        subcategoryName: sub?.name ?? null,
        spend: 0,
        remaining: amount,
        percentUsed: 0,
        approximate: false,
        missingRates: [],
      });
      continue;
    }

    const txnIds = periodTxnRows.map((r) => r.id);
    const subLinks = await db
      .select({
        transactionId: transactionSubcategories.transactionId,
        subcategoryId: transactionSubcategories.subcategoryId,
        categoryId: subcategories.categoryId,
      })
      .from(transactionSubcategories)
      .innerJoin(subcategories, eq(transactionSubcategories.subcategoryId, subcategories.id))
      .where(inArray(transactionSubcategories.transactionId, txnIds));

    // Per-transaction subcategory lists, plus the count for the amount/N
    // split (a transaction tagged in N subcategories contributes amount/N
    // to each, mirroring getCategorySummary).
    const subsByTxn = new Map<number, { subcategoryId: number; categoryId: number }[]>();
    for (const link of subLinks) {
      let list = subsByTxn.get(link.transactionId);
      if (!list) {
        list = [];
        subsByTxn.set(link.transactionId, list);
      }
      list.push({ subcategoryId: link.subcategoryId, categoryId: link.categoryId });
    }

    let spend = 0;
    let approximate = false;
    const missing = new Set<string>();

    for (const row of periodTxnRows) {
      const txnSubs = subsByTxn.get(row.id) ?? [];
      // Filter to the links that this budget cares about. If the budget
      // targets a subcategory, only that specific one counts. Otherwise
      // any subcategory under the budget's category counts.
      const matching =
        budget.subcategoryId != null
          ? txnSubs.filter((s) => s.subcategoryId === budget.subcategoryId)
          : txnSubs.filter((s) => s.categoryId === budget.categoryId);

      if (matching.length === 0) continue;

      // amount/N split avoids double-counting when a transaction is tagged
      // in multiple subcategories spanning multiple categories. The split
      // factor is `matching / total` so a budget targeting one of two
      // categories on a multi-tagged row gets half the amount.
      const totalLinks = txnSubs.length;
      const splitAmount = (row.amount * matching.length) / totalLinks;

      // Two-phase conversion to keep behaviour consistent with analytics:
      //   1. convertRow does source → display, honouring stored rates when
      //      stable (sets approximate when today's rate had to be used).
      //   2. If the budget is pinned to a non-display currency, a second
      //      hop uses today's rate to reach `targetCcy` — always
      //      approximate (today's rate ≠ historical rate).
      const result = convertRow(
        {
          amount: splitAmount,
          currency: row.currency,
          rateToDisplay: row.rateToDisplay,
          displayCurrencySnapshot: row.displayCurrencySnapshot,
        },
        converter,
      );
      if (result.state === "excluded") {
        if (result.currency) missing.add(result.currency);
        continue;
      }
      if (result.usedTodaysRate) approximate = true;

      const finalAmount =
        targetCcy === displayCcy
          ? result.value
          : displayToTarget(result.value, targetCcy, rates, displayCcy);
      if (finalAmount == null) {
        // Budget's pinned currency has no rate — surface it.
        missing.add(targetCcy);
        continue;
      }
      if (targetCcy !== displayCcy) approximate = true;

      spend += finalAmount;
    }

    const amount = budget.amount;
    const percentUsed = amount > 0 ? Math.min(9999, Math.round((spend / amount) * 1000) / 10) : 0;
    results.push({
      ...budget,
      resolvedCurrency: targetCcy,
      categoryName: cat?.name ?? "",
      categoryColor: cat?.color ?? "#6B7280",
      categoryIcon: cat?.icon ?? "tag",
      subcategoryName: sub?.name ?? null,
      spend: Math.round(spend * 100) / 100,
      remaining: Math.round((amount - spend) * 100) / 100,
      percentUsed,
      approximate,
      missingRates: [...missing],
    });
  }

  return results;
}

// Type re-export for callers that don't need the spend wrapper.
export type { CurrencyConverter };
