import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { accounts, type Account, type NewAccount } from "@/db/schema";

export async function getAccounts(activeOnly = true): Promise<Account[]> {
  if (activeOnly) {
    return db
      .select()
      .from(accounts)
      .where(eq(accounts.isActive, true))
      .orderBy(accounts.sortOrder);
  }
  return db.select().from(accounts).orderBy(accounts.sortOrder);
}

export async function getAccountById(id: number): Promise<Account | undefined> {
  const [account] = await db.select().from(accounts).where(eq(accounts.id, id));
  return account;
}

export async function createAccount(data: NewAccount): Promise<Account> {
  const [account] = await db.insert(accounts).values(data).returning();
  return account;
}

export async function updateAccount(
  id: number,
  data: Partial<Omit<NewAccount, "id">>,
): Promise<Account> {
  const [account] = await db.update(accounts).set(data).where(eq(accounts.id, id)).returning();
  return account;
}

export async function archiveAccount(id: number): Promise<void> {
  await db.update(accounts).set({ isActive: false }).where(eq(accounts.id, id));
}

/**
 * Update account balance after a transaction.
 *
 * For ALL account types (including credit cards), balance represents
 * the account's value from the user's perspective:
 * - Debit/cash/wallet/savings: balance = funds available
 * - Credit cards: balance = available credit
 *
 * Expense always decreases balance. Income always increases it.
 * Debt on credit cards = creditLimit - balance (computed, not stored).
 */
export async function updateAccountBalance(
  accountId: number,
  amount: number,
  type: "income" | "expense" | "transfer",
  isSource: boolean,
): Promise<void> {
  let delta: number;

  if (type === "transfer") {
    delta = isSource ? -amount : amount;
  } else if (type === "expense") {
    delta = -amount;
  } else {
    delta = amount;
  }

  await db
    .update(accounts)
    .set({ balance: sql`${accounts.balance} + ${delta}` })
    .where(eq(accounts.id, accountId));
}

/**
 * Get account totals with currency conversion.
 *
 * For credit cards, liability = creditLimit - balance (the debt portion).
 * A credit card with limit=12M and available=5M has debt=7M.
 */
export async function getAccountsTotals(
  convertFn?: (amount: number, currency: string) => Promise<number>,
): Promise<{
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
}> {
  const allAccounts = await getAccounts();
  let totalAssets = 0;
  let totalLiabilities = 0;

  for (const acc of allAccounts) {
    if (acc.type === "credit") {
      const debt = (acc.creditLimit ?? 0) - acc.balance;
      if (debt > 0) {
        // Normal case: owe money on the card
        const converted = convertFn ? await convertFn(debt, acc.currency) : debt;
        totalLiabilities += converted;
      } else if (debt < 0) {
        // Overpaid card: issuer owes us money — count as asset
        const converted = convertFn
          ? await convertFn(Math.abs(debt), acc.currency)
          : Math.abs(debt);
        totalAssets += converted;
      }
    } else {
      const converted = convertFn ? await convertFn(acc.balance, acc.currency) : acc.balance;
      totalAssets += converted;
    }
  }

  return {
    netWorth: totalAssets - totalLiabilities,
    totalAssets,
    totalLiabilities,
  };
}
