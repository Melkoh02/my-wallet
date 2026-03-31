import { eq, and, sql, like } from "drizzle-orm";
import { db } from "@/db/client";
import { cashbackRules, transactions, type CashbackRule, type NewCashbackRule } from "@/db/schema";

export async function getCashbackRules(accountId?: number): Promise<CashbackRule[]> {
  if (accountId) {
    return db
      .select()
      .from(cashbackRules)
      .where(and(eq(cashbackRules.accountId, accountId), eq(cashbackRules.isActive, true)));
  }
  return db.select().from(cashbackRules).where(eq(cashbackRules.isActive, true));
}

export async function createCashbackRule(data: NewCashbackRule): Promise<CashbackRule> {
  const [rule] = await db.insert(cashbackRules).values(data).returning();
  return rule;
}

export async function updateCashbackRule(
  id: number,
  data: Partial<Omit<NewCashbackRule, "id">>,
): Promise<void> {
  await db.update(cashbackRules).set(data).where(eq(cashbackRules.id, id));
}

export async function deleteCashbackRule(id: number): Promise<void> {
  await db.update(cashbackRules).set({ isActive: false }).where(eq(cashbackRules.id, id));
}

/**
 * Match a cashback rule for a given account + subcategory combination.
 * Returns the computed cashback amount, or null if no rule matches.
 */
export async function computeCashback(
  accountId: number,
  subcategoryIds: number[],
  amount: number,
): Promise<{ amount: number; cashbackAccountId: number } | null> {
  const rules = await getCashbackRules(accountId);
  if (rules.length === 0) return null;

  // Find the most specific matching rule
  // Priority: specific subcategory match > wildcard (null subcategory)
  let bestRule: CashbackRule | null = null;

  for (const rule of rules) {
    if (rule.subcategoryId && subcategoryIds.includes(rule.subcategoryId)) {
      bestRule = rule;
      break; // Specific match wins
    }
    if (!rule.subcategoryId && !bestRule) {
      bestRule = rule; // Wildcard fallback
    }
  }

  if (!bestRule) return null;

  let cashbackAmount = (bestRule.percentage / 100) * amount;

  // Check monthly cap
  if (bestRule.monthlyCap) {
    const monthStr = new Date().toISOString().slice(0, 7);
    const [used] = await db
      .select({ total: sql<number>`COALESCE(SUM(${transactions.cashbackAmount}), 0)` })
      .from(transactions)
      .where(and(eq(transactions.accountId, accountId), like(transactions.date, `${monthStr}%`)));
    const remaining = bestRule.monthlyCap - (used?.total ?? 0);
    if (remaining <= 0) return null;
    cashbackAmount = Math.min(cashbackAmount, remaining);
  }

  return {
    amount: Math.round(cashbackAmount * 100) / 100,
    cashbackAccountId: bestRule.cashbackAccountId,
  };
}
