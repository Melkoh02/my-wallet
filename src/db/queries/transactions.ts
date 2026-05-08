import { eq, and, like, desc, sql, or, gte, lte, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  transactions,
  transactionSubcategories,
  accounts,
  subcategories,
  categories,
  places,
  type Transaction,
  type NewTransaction,
} from "@/db/schema";
import { updateAccountBalance } from "./accounts";
import { decrementVisitCount, incrementVisitCount } from "./places";
import { captureRateForCurrency, type CurrencyConverter } from "@/services/exchangeRate.service";

/**
 * Convert a transaction row's amount to display currency.
 *
 * Returns a tagged union with two states:
 *   - `converted` — usable in totals. `usedTodaysRate=false` when the stored rate
 *     matched today's display currency (historically stable); `true` when the
 *     stored rate was missing/stale and today's rate was used (caller surfaces
 *     the "approximate" banner).
 *   - `excluded` — caller drops the row from totals. `currency` is the source
 *     currency to add to `missingRates` for the UI, or `null` when even the
 *     source currency is unknown.
 */
// invariant: tagged union enforces the three semantic states (stable / approximate / excluded)
// at the type level. never collapse `excluded` to a numeric zero — that silently corrupts
// cross-currency totals.
export type ConvertedRow =
  | { state: "converted"; value: number; usedTodaysRate: boolean }
  | { state: "excluded"; currency: string | null };

export function convertRow(
  row: {
    amount: number;
    currency: string | null;
    rateToDisplay: number | null;
    displayCurrencySnapshot: string | null;
  },
  converter: CurrencyConverter,
): ConvertedRow {
  // A null currency means we genuinely don't know the source currency — e.g.
  // a row whose account was hard-deleted before the Phase 2 backfill could run.
  if (row.currency == null) {
    return { state: "excluded", currency: null };
  }
  // Path 1: stored rate is still valid → historically stable conversion.
  if (row.rateToDisplay != null && row.displayCurrencySnapshot === converter.displayCurrency) {
    return { state: "converted", value: row.amount * row.rateToDisplay, usedTodaysRate: false };
  }
  // Path 2: fall back to today's rate.
  if (!converter.hasRateFor(row.currency)) {
    return { state: "excluded", currency: row.currency };
  }
  return {
    state: "converted",
    value: converter.convert(row.amount, row.currency),
    usedTodaysRate: true,
  };
}

/**
 * Pick the destination-side amount for a transfer. Cross-currency transfers store
 * the destination amount in `toAmount` (destination currency); same-currency leave
 * `toAmount` NULL and use `amount`. Centralised so all callers (apply, reverse,
 * edit-reverse, edit-apply) stay consistent — collapsing this on a refactor would
 * silently corrupt one or the other case.
 */
// invariant: cross-currency transfer credits destination in toAmount; same-currency uses
// amount. all four call sites (createTransaction, deleteTransaction, edit-reverse, edit-apply)
// must go through this helper.
export function transferDestAmount(txn: Pick<Transaction, "amount" | "toAmount">): number {
  return txn.toAmount ?? txn.amount;
}

export type AggregateMeta = {
  missingRates: string[];
  usedTodaysRate: boolean;
};

// invariant: SQLite parameter limit is 999. don't raise CHUNK_SIZE past ~950 or large-list
// queries throw at runtime.
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
  /**
   * Resolved place name when `placeId` is set (preferred). Falls back to the
   * legacy `locationName` column for rows that pre-date migration 0010 and
   * still have NULL `placeId`. Display code should prefer this field over
   * `locationName` directly so a single location is never shown twice.
   */
  placeName?: string;
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

  // 3. Collect all transaction IDs + place IDs
  const txnIds = rows.map((r) => r.id);

  // 3b. Batch-fetch place names. One query covers the whole result set; rows
  // without a place_id are skipped here and fall back to legacy locationName
  // in the assembly step.
  const placeIdSet = new Set<number>();
  for (const r of rows) {
    if (r.placeId != null) placeIdSet.add(r.placeId);
  }
  const placeRows =
    placeIdSet.size > 0
      ? await db
          .select({ id: places.id, name: places.name })
          .from(places)
          .where(inArray(places.id, [...placeIdSet]))
      : [];
  const placeNameById = new Map(placeRows.map((p) => [p.id, p.name]));

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
    // Prefer the canonical place name via place_id; fall back to the legacy
    // locationName column for rows that pre-date migration 0010 (or had no
    // GPS data, in which case both sides are null and placeName stays
    // undefined).
    const placeName =
      txn.placeId != null ? placeNameById.get(txn.placeId) : (txn.locationName ?? undefined);
    return {
      ...txn,
      accountName: acc?.name ?? "Unknown",
      accountCurrency: acc?.currency ?? "USD",
      toAccountName: txn.toAccountId != null ? (toAcc?.name ?? "Unknown") : undefined,
      toAccountCurrency: toAcc?.currency,
      cashbackAccountCurrency: cashAcc?.currency,
      placeName: placeName ?? undefined,
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

/**
 * All transactions linked to a given place_id, most-recent first. Powers
 * the place detail screen ("what did I buy here?") and the heatmap
 * tap-on-marker drill-in.
 */
export async function getTransactionsForPlace(
  placeId: number,
): Promise<TransactionWithRelations[]> {
  const rows = await db
    .select()
    .from(transactions)
    .where(eq(transactions.placeId, placeId))
    .orderBy(desc(transactions.date), desc(transactions.time));
  if (rows.length === 0) return [];
  return enrichTransactionsBatch(rows);
}

/**
 * Transactions whose linked place's coords fall inside the given lat/lng
 * bounding box. Powers the "Show all in view" sheet on the spending map —
 * track the camera viewport, query when the user taps the button.
 *
 * Antimeridian: when `west > east` (the box wraps ±180°) we OR two ranges
 * together so an Asia-Pacific-spanning view doesn't silently exclude
 * everything. The same logic that lives in `findNearestPlace`.
 */
export async function getTransactionsInBounds(bounds: {
  west: number;
  south: number;
  east: number;
  north: number;
}): Promise<TransactionWithRelations[]> {
  const { west, south, east, north } = bounds;
  const wrapsAntimeridian = west > east;
  const lngCondition = wrapsAntimeridian
    ? or(gte(places.longitude, west), lte(places.longitude, east))
    : and(gte(places.longitude, west), lte(places.longitude, east));

  const rows = await db
    .select()
    .from(transactions)
    .innerJoin(places, eq(transactions.placeId, places.id))
    .where(
      and(
        gte(places.latitude, south),
        lte(places.latitude, north),
        lngCondition,
        // place must have coords to be in bounds — innerJoin already enforces
        // placeId IS NOT NULL but the lat/lng IS NOT NULL guard is implicit
        // via the between filter.
      ),
    )
    .orderBy(desc(transactions.date), desc(transactions.time));
  if (rows.length === 0) return [];
  // .innerJoin returns { transactions: row, places: row } — pull the txn out.
  return enrichTransactionsBatch(rows.map((r) => r.transactions));
}

export async function createTransaction(
  data: NewTransaction,
  subcategoryIds: number[],
): Promise<Transaction> {
  // invariant: capture currency + rate at insert time so historical aggregates stay stable when
  // display currency or rates later change. processDueRecurring + triggerRecurringNow duplicate
  // this logic — keep all three in sync. see docs/glossary.md § currency snapshot fields.
  let toInsert = data;
  if (data.currency == null) {
    const [account] = await db
      .select({ currency: accounts.currency })
      .from(accounts)
      .where(eq(accounts.id, data.accountId));
    if (account?.currency) {
      const captured = await captureRateForCurrency(account.currency);
      toInsert = {
        ...data,
        currency: account.currency,
        rateToDisplay: captured.rateToDisplay,
        displayCurrencySnapshot: captured.displayCurrency,
      };
    }
  }

  const [txn] = await db.insert(transactions).values(toInsert).returning();

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
    await updateAccountBalance(txn.toAccountId, transferDestAmount(txn), "transfer", false);
  }

  // Keep places.visit_count in sync. Edits that move a transaction between
  // places are not handled here — the screen-level update path is responsible
  // for that. getPlacesWithStats() always returns a live count from a JOIN,
  // so any drift only ever affects picker sort order, never displayed totals.
  if (txn.placeId != null) {
    await incrementVisitCount(txn.placeId);
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
    await updateAccountBalance(txn.toAccountId, -transferDestAmount(txn), "transfer", false);
  }

  if (txn.placeId != null) {
    await decrementVisitCount(txn.placeId);
  }

  await db.delete(transactions).where(eq(transactions.id, id));
}

export async function getMonthSummary(
  year: number,
  month: number,
  converter: CurrencyConverter,
): Promise<{ income: number; expense: number; net: number } & AggregateMeta> {
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;

  const rows = await db
    .select({
      type: transactions.type,
      amount: transactions.amount,
      currency: transactions.currency,
      rateToDisplay: transactions.rateToDisplay,
      displayCurrencySnapshot: transactions.displayCurrencySnapshot,
    })
    .from(transactions)
    .where(like(transactions.date, `${monthStr}%`));

  let income = 0;
  let expense = 0;
  const missing = new Set<string>();
  let usedTodaysRate = false;
  for (const row of rows) {
    const result = convertRow(row, converter);
    if (result.state === "excluded") {
      if (result.currency) missing.add(result.currency);
      continue;
    }
    if (result.usedTodaysRate) usedTodaysRate = true;
    if (row.type === "income") income += result.value;
    else if (row.type === "expense") expense += result.value;
  }

  return {
    income,
    expense,
    net: income - expense,
    missingRates: [...missing],
    usedTodaysRate,
  };
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

export type ContactSummary = {
  /** Device contact id when linked, null for free-typed contacts. */
  contactId: string | null;
  contactName: string;
  /** Total transactions referencing this contact. */
  count: number;
  /** Most recent transaction date (YYYY-MM-DD). */
  lastDate: string;
};

/**
 * List every contact that appears on at least one transaction, with summary
 * stats. Used by the Contacts list screen. Groups by `(contactId, contactName)`
 * so device-linked contacts AND free-typed names both surface — same person
 * recorded both ways shows as two separate rows (rare; user can re-pick to
 * consolidate).
 *
 * Ordered by most-recent activity (date+time) desc, then name asc — produces
 * a stable visual order even when two contacts last appeared in the same
 * transaction's date+time tuple.
 */
export async function getAllContactsWithActivity(): Promise<ContactSummary[]> {
  const rows = await db
    .select({
      contactId: transactions.contactId,
      contactName: transactions.contactName,
      count: sql<number>`COUNT(*)`.as("cnt"),
      lastDate: sql<string>`MAX(${transactions.date})`.as("last_date"),
      // Compose date+time inside MAX so the row "last seen" is at the per-
      // transaction-instant resolution, not just per-day. Tie-break stability.
      lastDateTime: sql<string>`MAX(${transactions.date} || 'T' || ${transactions.time})`.as(
        "last_dt",
      ),
    })
    .from(transactions)
    .where(sql`${transactions.contactName} IS NOT NULL AND TRIM(${transactions.contactName}) <> ''`)
    .groupBy(transactions.contactId, transactions.contactName)
    .orderBy(sql`last_dt DESC, ${transactions.contactName} ASC`);

  return rows.map((r) => ({
    contactId: r.contactId,
    contactName: r.contactName!,
    count: r.count,
    lastDate: r.lastDate,
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
): Promise<{ rows: { date: string; total: number }[] } & AggregateMeta> {
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;

  const rows = await db
    .select({
      date: transactions.date,
      amount: transactions.amount,
      currency: transactions.currency,
      rateToDisplay: transactions.rateToDisplay,
      displayCurrencySnapshot: transactions.displayCurrencySnapshot,
    })
    .from(transactions)
    .where(and(like(transactions.date, `${monthStr}%`), eq(transactions.type, "expense")));

  const totalsByDate = new Map<string, number>();
  const missing = new Set<string>();
  let usedTodaysRate = false;
  for (const row of rows) {
    const result = convertRow(row, converter);
    if (result.state === "excluded") {
      if (result.currency) missing.add(result.currency);
      continue;
    }
    if (result.usedTodaysRate) usedTodaysRate = true;
    totalsByDate.set(row.date, (totalsByDate.get(row.date) ?? 0) + result.value);
  }

  const result = [...totalsByDate.entries()]
    .map(([date, total]) => ({ date, total }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { rows: result, missingRates: [...missing], usedTodaysRate };
}

export async function getCategorySummary(
  year: number,
  month: number,
  converter: CurrencyConverter,
): Promise<
  {
    rows: { categoryName: string; categoryColor: string; categoryIcon: string; total: number }[];
  } & AggregateMeta
> {
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;

  const expenseTxns = await db
    .select({
      id: transactions.id,
      amount: transactions.amount,
      currency: transactions.currency,
      rateToDisplay: transactions.rateToDisplay,
      displayCurrencySnapshot: transactions.displayCurrencySnapshot,
    })
    .from(transactions)
    .where(and(like(transactions.date, `${monthStr}%`), eq(transactions.type, "expense")));

  if (expenseTxns.length === 0) return { rows: [], missingRates: [], usedTodaysRate: false };

  const missing = new Set<string>();
  let usedTodaysRate = false;
  // Pre-convert each txn so the rest of the function operates in display currency.
  // Rows with no rate available at all are dropped — face-value mixing would
  // corrupt category totals.
  const convertedAmount = new Map<number, number>();
  for (const t of expenseTxns) {
    const result = convertRow(t, converter);
    if (result.state === "excluded") {
      if (result.currency) missing.add(result.currency);
      continue;
    }
    if (result.usedTodaysRate) usedTodaysRate = true;
    convertedAmount.set(t.id, result.value);
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

  // invariant: a row tagged with N subcategories splits its amount across N categories
  // (amount/N) so multi-tagged rows aren't double-counted in category totals.
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
    usedTodaysRate,
  };
}

export type TrendPoint = { year: number; month: number; income: number; expense: number };

export async function getTrendData(
  monthsBack: number,
  converter: CurrencyConverter,
): Promise<{ rows: TrendPoint[] } & AggregateMeta> {
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
      currency: transactions.currency,
      rateToDisplay: transactions.rateToDisplay,
      displayCurrencySnapshot: transactions.displayCurrencySnapshot,
    })
    .from(transactions)
    .where(sql`substr(${transactions.date}, 1, 7) >= ${earliest}`);

  // Pre-seed every target month with zeros so gaps in activity still render in the trend.
  const map = new Map<string, { income: number; expense: number }>();
  for (const t of targets) {
    map.set(t.monthStr, { income: 0, expense: 0 });
  }
  const missing = new Set<string>();
  let usedTodaysRate = false;
  for (const row of rows) {
    const bucket = map.get(row.month);
    if (!bucket) continue;
    const result = convertRow(row, converter);
    if (result.state === "excluded") {
      if (result.currency) missing.add(result.currency);
      continue;
    }
    if (result.usedTodaysRate) usedTodaysRate = true;
    if (row.type === "income") bucket.income += result.value;
    else if (row.type === "expense") bucket.expense += result.value;
  }

  return {
    rows: targets.map((t) => ({
      year: t.year,
      month: t.month,
      income: map.get(t.monthStr)!.income,
      expense: map.get(t.monthStr)!.expense,
    })),
    missingRates: [...missing],
    usedTodaysRate,
  };
}

export async function getTopContactsByMonth(
  year: number,
  month: number,
  converter: CurrencyConverter,
  limit = 3,
): Promise<
  {
    rows: { contactId: string; contactName: string; total: number; count: number }[];
  } & AggregateMeta
> {
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const rawRows = await db
    .select({
      contactId: transactions.contactId,
      contactName: transactions.contactName,
      amount: transactions.amount,
      currency: transactions.currency,
      rateToDisplay: transactions.rateToDisplay,
      displayCurrencySnapshot: transactions.displayCurrencySnapshot,
    })
    .from(transactions)
    .where(
      and(
        like(transactions.date, `${monthStr}%`),
        eq(transactions.type, "expense"),
        sql`${transactions.contactId} IS NOT NULL`,
      ),
    );

  const grouped = new Map<string, { contactName: string; total: number; count: number }>();
  const missing = new Set<string>();
  let usedTodaysRate = false;
  for (const row of rawRows) {
    if (!row.contactId || !row.contactName) continue;
    const result = convertRow(row, converter);
    if (result.state === "excluded") {
      if (result.currency) missing.add(result.currency);
      continue;
    }
    if (result.usedTodaysRate) usedTodaysRate = true;
    const existing = grouped.get(row.contactId);
    if (existing) {
      existing.total += result.value;
      existing.count += 1;
    } else {
      grouped.set(row.contactId, {
        contactName: row.contactName,
        total: result.value,
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

  return { rows: sorted, missingRates: [...missing], usedTodaysRate };
}
