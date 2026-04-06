import { eq, and, like, desc, sql, or, gte, lte, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  transactions,
  transactionSubcategories,
  accounts,
  subcategories,
  categories,
  type Transaction,
  type NewTransaction,
} from "@/db/schema";
import { updateAccountBalance } from "./accounts";

export type TransactionWithRelations = Transaction & {
  accountName: string;
  toAccountName?: string;
  subcategoryList: {
    id: number;
    name: string;
    categoryName: string;
    categoryColor: string;
    categoryIcon: string;
  }[];
};

export type TransactionFilters = {
  search?: string;
  types?: string[];
  accountId?: number;
  fromAccountIds?: number[];
  toAccountIds?: number[];
  contactIds?: string[];
  dateFrom?: string;
  dateTo?: string;
  amountMin?: number;
  amountMax?: number;
  subcategoryIds?: number[];
  limit?: number;
  offset?: number;
};

export async function getTransactions(
  filters: TransactionFilters = {},
): Promise<TransactionWithRelations[]> {
  const {
    search,
    types,
    accountId,
    fromAccountIds,
    toAccountIds,
    contactIds,
    dateFrom,
    dateTo,
    amountMin,
    amountMax,
    subcategoryIds: filterSubIds,
    limit = 30,
    offset = 0,
  } = filters;

  const conditions = [];

  // Type filter (multi-select)
  if (types && types.length > 0) {
    conditions.push(inArray(transactions.type, types));
  }

  // Account filters
  if (accountId) {
    conditions.push(
      or(eq(transactions.accountId, accountId), eq(transactions.toAccountId, accountId))!,
    );
  }
  if (fromAccountIds && fromAccountIds.length > 0) {
    conditions.push(inArray(transactions.accountId, fromAccountIds));
  }
  if (toAccountIds && toAccountIds.length > 0) {
    conditions.push(inArray(transactions.toAccountId, toAccountIds));
  }

  // Contact filter (multi-select)
  if (contactIds && contactIds.length > 0) {
    conditions.push(inArray(transactions.contactId, contactIds));
  }

  // Date range
  if (dateFrom) conditions.push(gte(transactions.date, dateFrom));
  if (dateTo) conditions.push(lte(transactions.date, dateTo));

  // Amount range
  if (amountMin !== undefined) conditions.push(gte(transactions.amount, amountMin));
  if (amountMax !== undefined) conditions.push(lte(transactions.amount, amountMax));

  // Search
  if (search) {
    conditions.push(
      or(like(transactions.description, `%${search}%`), like(transactions.notes, `%${search}%`))!,
    );
  }

  // If filtering by subcategory, get matching transaction IDs first
  if (filterSubIds && filterSubIds.length > 0) {
    const matchingTxns = await db
      .select({ transactionId: transactionSubcategories.transactionId })
      .from(transactionSubcategories)
      .where(inArray(transactionSubcategories.subcategoryId, filterSubIds));
    const txnIds = [...new Set(matchingTxns.map((r) => r.transactionId))];
    if (txnIds.length === 0) return [];
    conditions.push(inArray(transactions.id, txnIds));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(transactions)
    .where(where)
    .orderBy(desc(transactions.date), desc(transactions.time))
    .limit(limit)
    .offset(offset);

  return Promise.all(rows.map(enrichTransaction));
}

async function enrichTransaction(txn: Transaction): Promise<TransactionWithRelations> {
  // Get account names
  const [acc] = await db.select().from(accounts).where(eq(accounts.id, txn.accountId));
  let toAccountName: string | undefined;
  if (txn.toAccountId) {
    const [toAcc] = await db.select().from(accounts).where(eq(accounts.id, txn.toAccountId));
    toAccountName = toAcc?.name;
  }

  // Get subcategories with their parent category info
  const subs = await db
    .select({
      id: subcategories.id,
      name: subcategories.name,
      categoryName: categories.name,
      categoryColor: categories.color,
      categoryIcon: categories.icon,
    })
    .from(transactionSubcategories)
    .innerJoin(subcategories, eq(transactionSubcategories.subcategoryId, subcategories.id))
    .innerJoin(categories, eq(subcategories.categoryId, categories.id))
    .where(eq(transactionSubcategories.transactionId, txn.id));

  return {
    ...txn,
    accountName: acc?.name ?? "Unknown",
    toAccountName,
    subcategoryList: subs,
  };
}

export async function getTransactionById(
  id: number,
): Promise<TransactionWithRelations | undefined> {
  const [txn] = await db.select().from(transactions).where(eq(transactions.id, id));
  if (!txn) return undefined;
  return enrichTransaction(txn);
}

export async function createTransaction(
  data: NewTransaction,
  subcategoryIds: number[],
): Promise<Transaction> {
  const [txn] = await db.insert(transactions).values(data).returning();

  // Insert subcategory links
  if (subcategoryIds.length > 0) {
    await db.insert(transactionSubcategories).values(
      subcategoryIds.map((subId) => ({
        transactionId: txn.id,
        subcategoryId: subId,
      })),
    );
  }

  // Update account balances
  await updateAccountBalance(
    txn.accountId,
    txn.amount,
    txn.type as "income" | "expense" | "transfer",
    true,
  );
  if (txn.toAccountId && txn.type === "transfer") {
    await updateAccountBalance(txn.toAccountId, txn.amount, "transfer", false);
  }

  return txn;
}

export async function deleteTransaction(id: number): Promise<void> {
  const [txn] = await db.select().from(transactions).where(eq(transactions.id, id));
  if (!txn) return;

  // Reverse balance changes
  await updateAccountBalance(
    txn.accountId,
    -txn.amount,
    txn.type as "income" | "expense" | "transfer",
    true,
  );
  if (txn.toAccountId && txn.type === "transfer") {
    await updateAccountBalance(txn.toAccountId, -txn.amount, "transfer", false);
  }

  // Junction table rows are cascade-deleted
  await db.delete(transactions).where(eq(transactions.id, id));
}

export async function getMonthSummary(
  year: number,
  month: number,
): Promise<{ income: number; expense: number; net: number }> {
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;

  const rows = await db
    .select({ type: transactions.type, total: sql<number>`SUM(${transactions.amount})` })
    .from(transactions)
    .where(like(transactions.date, `${monthStr}%`))
    .groupBy(transactions.type);

  let income = 0;
  let expense = 0;
  for (const row of rows) {
    if (row.type === "income") income = row.total;
    if (row.type === "expense") expense = row.total;
  }

  return { income, expense, net: income - expense };
}

export async function getRecentTransactions(limit = 5): Promise<TransactionWithRelations[]> {
  return getTransactions({ limit, offset: 0 });
}

export async function getDailySpending(
  year: number,
  month: number,
): Promise<{ date: string; total: number }[]> {
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;

  const rows = await db
    .select({
      date: transactions.date,
      total: sql<number>`SUM(${transactions.amount})`,
    })
    .from(transactions)
    .where(and(like(transactions.date, `${monthStr}%`), eq(transactions.type, "expense")))
    .groupBy(transactions.date)
    .orderBy(transactions.date);

  return rows;
}

export async function getCategorySummary(
  year: number,
  month: number,
): Promise<{ categoryName: string; categoryColor: string; categoryIcon: string; total: number }[]> {
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;

  // Get all expense transaction IDs for this month
  const expenseTxns = await db
    .select({ id: transactions.id, amount: transactions.amount })
    .from(transactions)
    .where(and(like(transactions.date, `${monthStr}%`), eq(transactions.type, "expense")));

  if (expenseTxns.length === 0) return [];

  const txnIds = expenseTxns.map((t) => t.id);
  const amountMap = new Map(expenseTxns.map((t) => [t.id, t.amount]));

  // Get subcategory-transaction links with category info
  const links = await db
    .select({
      transactionId: transactionSubcategories.transactionId,
      categoryName: categories.name,
      categoryColor: categories.color,
      categoryIcon: categories.icon,
    })
    .from(transactionSubcategories)
    .innerJoin(subcategories, eq(transactionSubcategories.subcategoryId, subcategories.id))
    .innerJoin(categories, eq(subcategories.categoryId, categories.id))
    .where(inArray(transactionSubcategories.transactionId, txnIds));

  // Count how many category links each transaction has to avoid double-counting
  const linkCountMap = new Map<number, number>();
  for (const link of links) {
    linkCountMap.set(link.transactionId, (linkCountMap.get(link.transactionId) ?? 0) + 1);
  }

  // Group by category and sum amounts, dividing by link count
  const categoryMap = new Map<
    string,
    { categoryName: string; categoryColor: string; categoryIcon: string; total: number }
  >();

  for (const link of links) {
    const amount = amountMap.get(link.transactionId) ?? 0;
    const linkCount = linkCountMap.get(link.transactionId) ?? 1;
    const existing = categoryMap.get(link.categoryName);
    if (existing) {
      existing.total += amount / linkCount;
    } else {
      categoryMap.set(link.categoryName, {
        categoryName: link.categoryName,
        categoryColor: link.categoryColor,
        categoryIcon: link.categoryIcon,
        total: amount / linkCount,
      });
    }
  }

  // Handle uncategorized transactions
  const categorizedTxnIds = new Set(links.map((l) => l.transactionId));
  let uncategorizedTotal = 0;
  for (const txn of expenseTxns) {
    if (!categorizedTxnIds.has(txn.id)) {
      uncategorizedTotal += txn.amount;
    }
  }
  if (uncategorizedTotal > 0) {
    categoryMap.set("__uncategorized__", {
      categoryName: "__uncategorized__",
      categoryColor: "#9CA3AF",
      categoryIcon: "help-circle",
      total: uncategorizedTotal,
    });
  }

  return Array.from(categoryMap.values()).sort((a, b) => b.total - a.total);
}
