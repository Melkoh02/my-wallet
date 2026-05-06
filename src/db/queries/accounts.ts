import { eq, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { accounts, transactions, type Account, type NewAccount } from "@/db/schema";

export class AccountInUseError extends Error {
  constructor(public readonly txnCount: number) {
    super(`Account is referenced by ${txnCount} transaction(s)`);
    this.name = "AccountInUseError";
  }
}

export class AccountCurrencyLockedError extends Error {
  constructor(public readonly txnCount: number) {
    super(`Cannot change currency: account has ${txnCount} transaction(s)`);
    this.name = "AccountCurrencyLockedError";
  }
}

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

export type SplitSourceInfo = {
  /** True if this transaction id appears as `originTransactionId` on at least one account. */
  isSplitSource: boolean;
  /** The loan accounts spawned by this transaction (empty when not a split source). */
  loanAccounts: { id: number; name: string }[];
};

/**
 * Look up loan accounts that were spawned by a particular split-bill expense.
 * Used by the transaction-edit form to detect "this is a split source" and
 * lock the split-bill UI accordingly.
 *
 * gotcha: this only finds loans where originTransactionId points at this
 * transaction (i.e. NEW loans created by the split). Splits that reused an
 * EXISTING loan_lent account for a counterparty are invisible here — the
 * pre-existing loan won't have originTransactionId pointing at this split.
 * Until split metadata is stored separately (v2.0), the lock UI errs on the
 * conservative side: any spawned loan → locked.
 */
export async function getSplitSourceInfo(transactionId: number): Promise<SplitSourceInfo> {
  const rows = await db
    .select({ id: accounts.id, name: accounts.name })
    .from(accounts)
    .where(eq(accounts.originTransactionId, transactionId));
  return {
    isSplitSource: rows.length > 0,
    loanAccounts: rows,
  };
}

/**
 * Returns true if any transaction (regular, transfer destination, or cashback
 * destination) references this account. Used to decide whether the account's
 * currency can still be edited.
 */
export async function accountHasTransactions(id: number): Promise<boolean> {
  const [hit] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(transactions)
    .where(
      or(
        eq(transactions.accountId, id),
        eq(transactions.toAccountId, id),
        eq(transactions.cashbackAccountId, id),
      ),
    );
  return !!(hit && hit.count > 0);
}

export async function createAccount(data: NewAccount): Promise<Account> {
  const [account] = await db.insert(accounts).values(data).returning();
  return account;
}

export async function updateAccount(
  id: number,
  data: Partial<Omit<NewAccount, "id">>,
): Promise<Account> {
  // invariant: currency cannot change once any txn references this account — would invalidate
  // every linked rateToDisplay snapshot and corrupt historical aggregates. archive + recreate
  // is the workaround. see docs/glossary.md § currency lock.
  if (data.currency !== undefined) {
    const [existing] = await db
      .select({ currency: accounts.currency })
      .from(accounts)
      .where(eq(accounts.id, id));
    if (existing && existing.currency !== data.currency) {
      const [hit] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(transactions)
        .where(
          or(
            eq(transactions.accountId, id),
            eq(transactions.toAccountId, id),
            eq(transactions.cashbackAccountId, id),
          ),
        );
      if (hit && hit.count > 0) {
        throw new AccountCurrencyLockedError(hit.count);
      }
    }
  }
  const [account] = await db.update(accounts).set(data).where(eq(accounts.id, id)).returning();
  return account;
}

export async function archiveAccount(id: number): Promise<void> {
  await db.update(accounts).set({ isActive: false }).where(eq(accounts.id, id));
}

export async function unarchiveAccount(id: number): Promise<void> {
  await db.update(accounts).set({ isActive: true }).where(eq(accounts.id, id));
}

export async function deleteAccountPermanently(id: number): Promise<void> {
  // why: expo-sqlite leaves PRAGMA foreign_keys = OFF; FK clauses don't prevent orphans.
  // guard at the query layer or rows get silently orphaned. archive is the user-facing escape.
  const [hit] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(transactions)
    .where(
      or(
        eq(transactions.accountId, id),
        eq(transactions.toAccountId, id),
        eq(transactions.cashbackAccountId, id),
      ),
    );
  if (hit && hit.count > 0) {
    throw new AccountInUseError(hit.count);
  }
  await db.delete(accounts).where(eq(accounts.id, id));
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
  // invariant: same delta direction for every account type. credit cards are NOT special-cased
  // here — balance = available credit, not debt. inverting this on credit was the v1.0.1
  // breaking change. see docs/glossary.md § balance.
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
    if (!acc.includeInNetWorth) continue;
    if (acc.type === "credit") {
      // invariant: credit liability = creditLimit - balance (debt is computed, never stored).
      // overpaid card (debt < 0) counts as an asset.
      const debt = (acc.creditLimit ?? 0) - acc.balance;
      if (debt > 0) {
        const converted = convertFn ? await convertFn(debt, acc.currency) : debt;
        totalLiabilities += converted;
      } else if (debt < 0) {
        const converted = convertFn
          ? await convertFn(Math.abs(debt), acc.currency)
          : Math.abs(debt);
        totalAssets += converted;
      }
    } else if (acc.type === "loan_borrowed") {
      if (acc.balance < 0) {
        // Normal case: still owe money
        const converted = convertFn
          ? await convertFn(Math.abs(acc.balance), acc.currency)
          : Math.abs(acc.balance);
        totalLiabilities += converted;
      } else if (acc.balance > 0) {
        // Overpaid: lender owes us money — count as asset
        const converted = convertFn ? await convertFn(acc.balance, acc.currency) : acc.balance;
        totalAssets += converted;
      }
    } else {
      // debit, cash, wallet, savings, loan_lent, investment
      // Positive balance = asset, negative = liability (e.g. overpaid loan_lent)
      if (acc.balance >= 0) {
        const converted = convertFn ? await convertFn(acc.balance, acc.currency) : acc.balance;
        totalAssets += converted;
      } else {
        const converted = convertFn
          ? await convertFn(Math.abs(acc.balance), acc.currency)
          : Math.abs(acc.balance);
        totalLiabilities += converted;
      }
    }
  }

  return {
    netWorth: totalAssets - totalLiabilities,
    totalAssets,
    totalLiabilities,
  };
}
