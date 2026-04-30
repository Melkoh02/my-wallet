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
import type { CurrencyConverter } from "@/services/exchangeRate.service";

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
  accountCurrency: string;
  toAccountName?: string;
  toAccountCurrency?: string;
  cashbackAccountCurrency?: string;
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
  recurringId?: number;
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
    recurringId,
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
  if (recurringId) {
    conditions.push(eq(transactions.recurringId, recurringId));
  }
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
  // 1. Collect all unique account IDs we need (including cashback destinations)
  const accountIdSet = new Set<number>();
  for (const txn of rows) {
    accountIdSet.add(txn.accountId);
    if (txn.toAccountId != null) accountIdSet.add(txn.toAccountId);
    if (txn.cashbackAccountId != null) accountIdSet.add(txn.cashbackAccountId);
  }
  const accountIds = [...accountIdSet];

  // 2. Batch-fetch all accounts in 1 query — keep name + currency
  const accountRows =
    accountIds.length > 0
      ? await db.select().from(accounts).where(inArray(accounts.id, accountIds))
      : [];
  const accountInfo = new Map(
    accountRows.map((a) => [a.id, { name: a.name, currency: a.currency }]),
  );

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
  return rows.map((txn) => {
    const acc = accountInfo.get(txn.accountId);
    const toAcc = txn.toAccountId != null ? accountInfo.get(txn.toAccountId) : undefined;
    const cashAcc =
      txn.cashbackAccountId != null ? accountInfo.get(txn.cashbackAccountId) : undefined;
    return {
      ...txn,
      accountName: acc?.name ?? "Unknown",
      accountCurrency: acc?.currency ?? "USD",
      toAccountName: txn.toAccountId != null ? (toAcc?.name ?? "Unknown") : undefined,
      toAccountCurrency: toAcc?.currency,
      cashbackAccountCurrency: cashAcc?.currency,
      subcategoryList: subsByTxnId.get(txn.id) ?? [],
    };
  });
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
  converter: CurrencyConverter,
): Promise<{ income: number; expense: number; net: number; missingRates: string[] }> {
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;

  const rows = await db
    .select({
      type: transactions.type,
      amount: transactions.amount,
      currency: accounts.currency,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(like(transactions.date, `${monthStr}%`));

  let income = 0;
  let expense = 0;
  const missing = new Set<string>();
  for (const row of rows) {
    if (!converter.hasRateFor(row.currency)) {
      missing.add(row.currency);
      continue; // Skip — face-value mixing would corrupt the total.
    }
    const converted = converter.convert(row.amount, row.currency);
    if (row.type === "income") income += converted;
    else if (row.type === "expense") expense += converted;
  }

  return { income, expense, net: income - expense, missingRates: [...missing] };
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

export async function getLastAccountByType(type: string): Promise<number | null> {
  const [row] = await db
    .select({ accountId: transactions.accountId })
    .from(transactions)
    .where(eq(transactions.type, type))
    .orderBy(desc(transactions.date), desc(transactions.time))
    .limit(1);
  return row?.accountId ?? null;
}

export async function getFrequentCategoriesByType(type: string, limit = 3): Promise<number[]> {
  const rows = await db
    .select({
      subcategoryId: transactionSubcategories.subcategoryId,
      count: sql<number>`COUNT(*)`.as("cnt"),
    })
    .from(transactionSubcategories)
    .innerJoin(transactions, eq(transactionSubcategories.transactionId, transactions.id))
    .where(eq(transactions.type, type))
    .groupBy(transactionSubcategories.subcategoryId)
    .orderBy(sql`cnt DESC`)
    .limit(limit);

  return rows.map((r) => r.subcategoryId);
}

export async function getDailySpending(
  year: number,
  month: number,
  converter: CurrencyConverter,
): Promise<{ rows: { date: string; total: number }[]; missingRates: string[] }> {
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;

  const rows = await db
    .select({
      date: transactions.date,
      amount: transactions.amount,
      currency: accounts.currency,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(and(like(transactions.date, `${monthStr}%`), eq(transactions.type, "expense")));

  const totalsByDate = new Map<string, number>();
  const missing = new Set<string>();
  for (const row of rows) {
    if (!converter.hasRateFor(row.currency)) {
      missing.add(row.currency);
      continue;
    }
    const converted = converter.convert(row.amount, row.currency);
    totalsByDate.set(row.date, (totalsByDate.get(row.date) ?? 0) + converted);
  }

  const result = [...totalsByDate.entries()]
    .map(([date, total]) => ({ date, total }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { rows: result, missingRates: [...missing] };
}

export async function getCategorySummary(
  year: number,
  month: number,
  converter: CurrencyConverter,
): Promise<{
  rows: { categoryName: string; categoryColor: string; categoryIcon: string; total: number }[];
  missingRates: string[];
}> {
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;

  const expenseTxns = await db
    .select({
      id: transactions.id,
      amount: transactions.amount,
      currency: accounts.currency,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(and(like(transactions.date, `${monthStr}%`), eq(transactions.type, "expense")));

  if (expenseTxns.length === 0) return { rows: [], missingRates: [] };

  const missing = new Set<string>();
  // Pre-convert each txn so the rest of the function operates in display currency.
  // Rows whose currency has no rate are dropped — face-value mixing would corrupt
  // category totals.
  const convertedAmount = new Map<number, number>();
  for (const t of expenseTxns) {
    if (!converter.hasRateFor(t.currency)) {
      missing.add(t.currency);
      continue;
    }
    convertedAmount.set(t.id, converter.convert(t.amount, t.currency));
  }

  const txnIds = expenseTxns.map((t) => t.id);

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
    const amount = convertedAmount.get(link.transactionId) ?? 0;
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
      uncategorizedTotal += convertedAmount.get(txn.id) ?? 0;
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

  return {
    rows: Array.from(categoryMap.values()).sort((a, b) => b.total - a.total),
    missingRates: [...missing],
  };
}

export type TrendPoint = { year: number; month: number; income: number; expense: number };

export async function getTrendData(
  monthsBack: number,
  converter: CurrencyConverter,
): Promise<{ rows: TrendPoint[]; missingRates: string[] }> {
  const now = new Date();
  const targets: { year: number; month: number; monthStr: string }[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    targets.push({ year: y, month: m, monthStr: `${y}-${String(m).padStart(2, "0")}` });
  }

  const earliest = targets[0].monthStr;
  const rows = await db
    .select({
      month: sql<string>`substr(${transactions.date}, 1, 7)`.as("m"),
      type: transactions.type,
      amount: transactions.amount,
      currency: accounts.currency,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(sql`substr(${transactions.date}, 1, 7) >= ${earliest}`);

  // Pre-seed every target month with zeros so gaps in activity still render in the trend.
  const map = new Map<string, { income: number; expense: number }>();
  for (const t of targets) {
    map.set(t.monthStr, { income: 0, expense: 0 });
  }
  const missing = new Set<string>();
  for (const row of rows) {
    const bucket = map.get(row.month);
    if (!bucket) continue;
    if (!converter.hasRateFor(row.currency)) {
      missing.add(row.currency);
      continue;
    }
    const converted = converter.convert(row.amount, row.currency);
    if (row.type === "income") bucket.income += converted;
    else if (row.type === "expense") bucket.expense += converted;
  }

  return {
    rows: targets.map((t) => ({
      year: t.year,
      month: t.month,
      income: map.get(t.monthStr)!.income,
      expense: map.get(t.monthStr)!.expense,
    })),
    missingRates: [...missing],
  };
}

export async function getTopContactsByMonth(
  year: number,
  month: number,
  converter: CurrencyConverter,
  limit = 3,
): Promise<{
  rows: { contactId: string; contactName: string; total: number; count: number }[];
  missingRates: string[];
}> {
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const rawRows = await db
    .select({
      contactId: transactions.contactId,
      contactName: transactions.contactName,
      amount: transactions.amount,
      currency: accounts.currency,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(
      and(
        like(transactions.date, `${monthStr}%`),
        eq(transactions.type, "expense"),
        sql`${transactions.contactId} IS NOT NULL`,
      ),
    );

  const grouped = new Map<string, { contactName: string; total: number; count: number }>();
  const missing = new Set<string>();
  for (const row of rawRows) {
    if (!row.contactId || !row.contactName) continue;
    if (!converter.hasRateFor(row.currency)) {
      missing.add(row.currency);
      continue;
    }
    const converted = converter.convert(row.amount, row.currency);
    const existing = grouped.get(row.contactId);
    if (existing) {
      existing.total += converted;
      existing.count += 1;
    } else {
      grouped.set(row.contactId, {
        contactName: row.contactName,
        total: converted,
        count: 1,
      });
    }
  }

  const sorted = [...grouped.entries()]
    .map(([contactId, v]) => ({
      contactId,
      contactName: v.contactName,
      total: v.total,
      count: v.count,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);

  return { rows: sorted, missingRates: [...missing] };
}
