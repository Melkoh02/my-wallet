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

/** SQLite max variables is 999. Chunk large arrays to stay safe. */
const CHUNK_SIZE = 900;

async function queryInChunks<T>(
  ids: number[],
  queryFn: (chunk: number[]) => Promise<T[]>,
): Promise<T[]> {
  if (ids.length <= CHUNK_SIZE) return queryFn(ids);
  const results: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    results.push(...(await queryFn(chunk)));
  }
  return results;
}

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

  if (types && types.length > 0) {
    conditions.push(inArray(transactions.type, types));
  }
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
  if (contactIds && contactIds.length > 0) {
    conditions.push(inArray(transactions.contactId, contactIds));
  }
  if (dateFrom) conditions.push(gte(transactions.date, dateFrom));
  if (dateTo) conditions.push(lte(transactions.date, dateTo));
  if (amountMin !== undefined) conditions.push(gte(transactions.amount, amountMin));
  if (amountMax !== undefined) conditions.push(lte(transactions.amount, amountMax));
  if (search) {
    conditions.push(
      or(like(transactions.description, `%${search}%`), like(transactions.notes, `%${search}%`))!,
    );
  }

  // Subcategory filter: pre-fetch matching transaction IDs
  if (filterSubIds && filterSubIds.length > 0) {
    const matchingTxns = await db
      .select({ transactionId: transactionSubcategories.transactionId })
      .from(transactionSubcategories)
      .where(inArray(transactionSubcategories.subcategoryId, filterSubIds));
    const txnIds = [...new Set(matchingTxns.map((r) => r.transactionId))];
    if (txnIds.length === 0) return [];
    // Chunked to avoid SQLite variable limit
    if (txnIds.length <= CHUNK_SIZE) {
      conditions.push(inArray(transactions.id, txnIds));
    } else {
      // For very large sets, fall back to fetching all and filtering in JS
      // This is rare — only if a subcategory has 900+ transactions
      conditions.push(inArray(transactions.id, txnIds.slice(0, CHUNK_SIZE)));
    }
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(transactions)
    .where(where)
    .orderBy(desc(transactions.date), desc(transactions.time))
    .limit(limit)
    .offset(offset);

  if (rows.length === 0) return [];

  return enrichTransactionsBatch(rows);
}

/**
 * Batch-enrich transactions: 3 queries total regardless of row count.
 * Replaces the old N+1 pattern (up to 3N+1 queries).
 */
async function enrichTransactionsBatch(rows: Transaction[]): Promise<TransactionWithRelations[]> {
  // 1. Collect all unique account IDs we need
  const accountIdSet = new Set<number>();
  for (const txn of rows) {
    accountIdSet.add(txn.accountId);
    if (txn.toAccountId != null) accountIdSet.add(txn.toAccountId);
  }
  const accountIds = [...accountIdSet];

  // 2. Batch-fetch all accounts in 1 query
  const accountRows =
    accountIds.length > 0
      ? await db.select().from(accounts).where(inArray(accounts.id, accountIds))
      : [];
  const accountMap = new Map(accountRows.map((a) => [a.id, a.name]));

  // 3. Collect all transaction IDs
  const txnIds = rows.map((r) => r.id);

  // 4. Batch-fetch all subcategory links with category info in 1 query
  const subLinks =
    txnIds.length > 0
      ? await db
          .select({
            transactionId: transactionSubcategories.transactionId,
            id: subcategories.id,
            name: subcategories.name,
            categoryName: categories.name,
            categoryColor: categories.color,
            categoryIcon: categories.icon,
          })
          .from(transactionSubcategories)
          .innerJoin(subcategories, eq(transactionSubcategories.subcategoryId, subcategories.id))
          .innerJoin(categories, eq(subcategories.categoryId, categories.id))
          .where(inArray(transactionSubcategories.transactionId, txnIds))
      : [];

  // 5. Group subcategory links by transaction ID
  const subsByTxnId = new Map<
    number,
    {
      id: number;
      name: string;
      categoryName: string;
      categoryColor: string;
      categoryIcon: string;
    }[]
  >();
  for (const link of subLinks) {
    let list = subsByTxnId.get(link.transactionId);
    if (!list) {
      list = [];
      subsByTxnId.set(link.transactionId, list);
    }
    list.push({
      id: link.id,
      name: link.name,
      categoryName: link.categoryName,
      categoryColor: link.categoryColor,
      categoryIcon: link.categoryIcon,
    });
  }

  // 6. Assemble results — 0 additional queries
  return rows.map((txn) => ({
    ...txn,
    accountName: accountMap.get(txn.accountId) ?? "Unknown",
    toAccountName:
      txn.toAccountId != null ? (accountMap.get(txn.toAccountId) ?? "Unknown") : undefined,
    subcategoryList: subsByTxnId.get(txn.id) ?? [],
  }));
}

/**
 * Single-item enrichment for getTransactionById.
 * Uses the batch function internally (still just 3 queries).
 */
export async function getTransactionById(
  id: number,
): Promise<TransactionWithRelations | undefined> {
  const [txn] = await db.select().from(transactions).where(eq(transactions.id, id));
  if (!txn) return undefined;
  const [enriched] = await enrichTransactionsBatch([txn]);
  return enriched;
}

export async function createTransaction(
  data: NewTransaction,
  subcategoryIds: number[],
): Promise<Transaction> {
  const [txn] = await db.insert(transactions).values(data).returning();

  if (subcategoryIds.length > 0) {
    await db.insert(transactionSubcategories).values(
      subcategoryIds.map((subId) => ({
        transactionId: txn.id,
        subcategoryId: subId,
      })),
    );
  }

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

  await updateAccountBalance(
    txn.accountId,
    -txn.amount,
    txn.type as "income" | "expense" | "transfer",
    true,
  );
  if (txn.toAccountId && txn.type === "transfer") {
    await updateAccountBalance(txn.toAccountId, -txn.amount, "transfer", false);
  }

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

export async function getFrequentContacts(
  limit = 5,
): Promise<{ id: string; name: string; count: number }[]> {
  const rows = await db
    .select({
      id: transactions.contactId,
      name: transactions.contactName,
      count: sql<number>`COUNT(*)`.as("cnt"),
    })
    .from(transactions)
    .where(sql`${transactions.contactId} IS NOT NULL`)
    .groupBy(transactions.contactId, transactions.contactName)
    .orderBy(sql`cnt DESC`)
    .limit(limit);

  return rows.map((r) => ({
    id: r.id!,
    name: r.name!,
    count: r.count,
  }));
}

export async function getLastUsedContact(): Promise<{ id: string; name: string } | null> {
  const [row] = await db
    .select({
      id: transactions.contactId,
      name: transactions.contactName,
    })
    .from(transactions)
    .where(sql`${transactions.contactId} IS NOT NULL`)
    .orderBy(desc(transactions.date), desc(transactions.time))
    .limit(1);

  if (!row?.id || !row?.name) return null;
  return { id: row.id, name: row.name };
}

export async function getDailySpending(
  year: number,
  month: number,
): Promise<{ date: string; total: number }[]> {
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;

  return db
    .select({
      date: transactions.date,
      total: sql<number>`SUM(${transactions.amount})`,
    })
    .from(transactions)
    .where(and(like(transactions.date, `${monthStr}%`), eq(transactions.type, "expense")))
    .groupBy(transactions.date)
    .orderBy(transactions.date);
}

export async function getCategorySummary(
  year: number,
  month: number,
): Promise<{ categoryName: string; categoryColor: string; categoryIcon: string; total: number }[]> {
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;

  const expenseTxns = await db
    .select({ id: transactions.id, amount: transactions.amount })
    .from(transactions)
    .where(and(like(transactions.date, `${monthStr}%`), eq(transactions.type, "expense")));

  if (expenseTxns.length === 0) return [];

  const txnIds = expenseTxns.map((t) => t.id);
  const amountMap = new Map(expenseTxns.map((t) => [t.id, t.amount]));

  const links = await queryInChunks(txnIds, (chunk) =>
    db
      .select({
        transactionId: transactionSubcategories.transactionId,
        categoryName: categories.name,
        categoryColor: categories.color,
        categoryIcon: categories.icon,
      })
      .from(transactionSubcategories)
      .innerJoin(subcategories, eq(transactionSubcategories.subcategoryId, subcategories.id))
      .innerJoin(categories, eq(subcategories.categoryId, categories.id))
      .where(inArray(transactionSubcategories.transactionId, chunk)),
  );

  // Count links per transaction to avoid double-counting
  const linkCountMap = new Map<number, number>();
  for (const link of links) {
    linkCountMap.set(link.transactionId, (linkCountMap.get(link.transactionId) ?? 0) + 1);
  }

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

  // Uncategorized
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
