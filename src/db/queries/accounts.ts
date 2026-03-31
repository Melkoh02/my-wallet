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

export async function updateAccountBalance(
  accountId: number,
  amount: number,
  type: "income" | "expense" | "transfer",
  isSource: boolean,
): Promise<void> {
  const account = await getAccountById(accountId);
  if (!account) return;

  const isDebtAccount = account.type === "credit";
  let delta: number;

  if (type === "transfer") {
    // Source loses money, destination gains
    delta = isSource ? -amount : amount;
  } else if (type === "expense") {
    delta = isDebtAccount ? amount : -amount; // Credit cards: expense increases debt
  } else {
    // income
    delta = isDebtAccount ? -amount : amount; // Credit cards: income reduces debt
  }

  await db
    .update(accounts)
    .set({ balance: sql`${accounts.balance} + ${delta}` })
    .where(eq(accounts.id, accountId));
}

export async function getAccountsTotals(): Promise<{
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
}> {
  const allAccounts = await getAccounts();
  let totalAssets = 0;
  let totalLiabilities = 0;

  for (const acc of allAccounts) {
    if (acc.type === "credit") {
      totalLiabilities += acc.balance;
    } else {
      totalAssets += acc.balance;
    }
  }

  return {
    netWorth: totalAssets - totalLiabilities,
    totalAssets,
    totalLiabilities,
  };
}
