import { eq, and, lte, desc, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  recurringTransactions,
  recurringSubcategories,
  transactions,
  transactionSubcategories,
  accounts,
  type RecurringTransaction,
  type NewRecurringTransaction,
} from "@/db/schema";
import { updateAccountBalance } from "./accounts";
import { captureRateForCurrency } from "@/services/exchangeRate.service";
import { getNextDate, daysBetween, frequencyToDays } from "@/utils/date";
import { todayDateString, nowTimeString } from "@/utils/format";

const MAX_CATCHUP_DAYS = 90;

export type RecurringWithAccount = RecurringTransaction & {
  accountCurrency: string;
};

async function attachAccountCurrency(
  items: RecurringTransaction[],
): Promise<RecurringWithAccount[]> {
  if (items.length === 0) return [];
  const accountIds = [...new Set(items.map((i) => i.accountId))];
  const accountRows = await db
    .select({ id: accounts.id, currency: accounts.currency })
    .from(accounts)
    .where(inArray(accounts.id, accountIds));
  const currencyByAccount = new Map(accountRows.map((a) => [a.id, a.currency]));
  return items.map((item) => ({
    ...item,
    accountCurrency: currencyByAccount.get(item.accountId) ?? "USD",
  }));
}

export async function getRecurringTransactions(activeOnly = true): Promise<RecurringWithAccount[]> {
  const rows = activeOnly
    ? await db
        .select()
        .from(recurringTransactions)
        .where(eq(recurringTransactions.isActive, true))
        .orderBy(recurringTransactions.nextDate)
    : await db.select().from(recurringTransactions).orderBy(recurringTransactions.nextDate);
  return attachAccountCurrency(rows);
}

export async function getRecurringById(id: number): Promise<RecurringWithAccount | undefined> {
  const [item] = await db
    .select()
    .from(recurringTransactions)
    .where(eq(recurringTransactions.id, id));
  if (!item) return undefined;
  const [enriched] = await attachAccountCurrency([item]);
  return enriched;
}

export async function getRecurringSubcategoryIds(recurringId: number): Promise<number[]> {
  const rows = await db
    .select({ subcategoryId: recurringSubcategories.subcategoryId })
    .from(recurringSubcategories)
    .where(eq(recurringSubcategories.recurringId, recurringId));
  return rows.map((r) => r.subcategoryId);
}

export async function createRecurring(
  data: NewRecurringTransaction,
  subcategoryIds: number[],
): Promise<RecurringTransaction> {
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
  const [item] = await db.insert(recurringTransactions).values(toInsert).returning();
  if (subcategoryIds.length > 0) {
    await db.insert(recurringSubcategories).values(
      subcategoryIds.map((subId) => ({
        recurringId: item.id,
        subcategoryId: subId,
      })),
    );
  }
  return item;
}

export async function updateRecurring(
  id: number,
  data: Partial<Omit<NewRecurringTransaction, "id">>,
  subcategoryIds?: number[],
): Promise<void> {
  await db.update(recurringTransactions).set(data).where(eq(recurringTransactions.id, id));
  if (subcategoryIds !== undefined) {
    await db.delete(recurringSubcategories).where(eq(recurringSubcategories.recurringId, id));
    if (subcategoryIds.length > 0) {
      await db
        .insert(recurringSubcategories)
        .values(subcategoryIds.map((subId) => ({ recurringId: id, subcategoryId: subId })));
    }
  }
}

export async function deleteRecurring(id: number): Promise<void> {
  // Junction rows cascade-deleted
  await db.delete(recurringTransactions).where(eq(recurringTransactions.id, id));
}

export async function toggleRecurring(id: number): Promise<void> {
  const item = await getRecurringById(id);
  if (!item) return;
  await db
    .update(recurringTransactions)
    .set({ isActive: !item.isActive })
    .where(eq(recurringTransactions.id, id));
}

/**
 * Process all due recurring transactions. Called on app foreground.
 * Returns the count of transactions created.
 */
export async function processDueRecurring(): Promise<number> {
  const today = todayDateString();
  const time = nowTimeString();

  const dueItems = await db
    .select()
    .from(recurringTransactions)
    .where(
      and(eq(recurringTransactions.isActive, true), lte(recurringTransactions.nextDate, today)),
    );

  let processed = 0;

  for (const item of dueItems) {
    // why: cap catchup at 90 days. without this, returning to the app after a long offline
    // period creates dozens-to-hundreds of rows and corrupts balances.
    const gap = daysBetween(item.nextDate, today);
    let currentDate = item.nextDate;

    if (gap > MAX_CATCHUP_DAYS) {
      // Skip to today, create one transaction
      currentDate = today;
    }

    // invariant: only the row dated today gets the stamped rate; backdated catchup rows leave
    // rate fields NULL so aggregates correctly mark them approximate.
    const itemCurrency = item.currency;
    const captured = itemCurrency ? await captureRateForCurrency(itemCurrency) : null;

    // Process all due occurrences
    while (currentDate <= today) {
      const isToday = currentDate === today;
      // Create the transaction
      const [txn] = await db
        .insert(transactions)
        .values({
          type: item.type,
          amount: item.amount,
          description: item.description,
          accountId: item.accountId,
          date: currentDate,
          time: item.timeOfDay ?? time,
          contactId: item.contactId,
          contactName: item.contactName,
          cashbackAmount: item.cashbackAmount,
          cashbackAccountId: item.cashbackAccountId,
          recurringId: item.id,
          currency: itemCurrency,
          rateToDisplay: isToday ? (captured?.rateToDisplay ?? null) : null,
          displayCurrencySnapshot: isToday ? (captured?.displayCurrency ?? null) : null,
        })
        .returning();

      // Copy subcategories
      const subIds = await getRecurringSubcategoryIds(item.id);
      if (subIds.length > 0) {
        await db.insert(transactionSubcategories).values(
          subIds.map((subId) => ({
            transactionId: txn.id,
            subcategoryId: subId,
          })),
        );
      }

      // Update balance
      await updateAccountBalance(
        item.accountId,
        item.amount,
        item.type as "income" | "expense",
        true,
      );

      processed++;
      currentDate = getNextDate(currentDate, item.frequency, {
        dayOfMonth: item.dayOfMonth,
        dayOfWeek: item.dayOfWeek,
      });

      // If we already caught up past the max, stop
      if (gap > MAX_CATCHUP_DAYS) break;
    }

    // Advance next_date past today
    let nextDate = currentDate;
    if (gap > MAX_CATCHUP_DAYS) {
      nextDate = getNextDate(today, item.frequency, {
        dayOfMonth: item.dayOfMonth,
        dayOfWeek: item.dayOfWeek,
      });
    }

    // Check if end date reached
    if (item.endDate && nextDate > item.endDate) {
      await db
        .update(recurringTransactions)
        .set({ isActive: false, nextDate })
        .where(eq(recurringTransactions.id, item.id));
    } else {
      await db
        .update(recurringTransactions)
        .set({ nextDate })
        .where(eq(recurringTransactions.id, item.id));
    }
  }

  return processed;
}

/**
 * Trigger a recurring transaction immediately (e.g. salary came early).
 * Creates one transaction for today and advances nextDate.
 */
// invariant: rate-capture mirrors createTransaction + processDueRecurring. all three sites
// must stay in sync.
export async function triggerRecurringNow(id: number): Promise<void> {
  const item = await getRecurringById(id);
  if (!item || !item.isActive) return;

  const today = todayDateString();
  const time = item.timeOfDay ?? nowTimeString();

  const itemCurrency = item.currency;
  const captured = itemCurrency ? await captureRateForCurrency(itemCurrency) : null;

  const [txn] = await db
    .insert(transactions)
    .values({
      type: item.type,
      amount: item.amount,
      description: item.description,
      accountId: item.accountId,
      date: today,
      time,
      contactId: item.contactId,
      contactName: item.contactName,
      cashbackAmount: item.cashbackAmount,
      cashbackAccountId: item.cashbackAccountId,
      recurringId: item.id,
      currency: itemCurrency,
      rateToDisplay: captured?.rateToDisplay ?? null,
      displayCurrencySnapshot: captured?.displayCurrency ?? null,
    })
    .returning();

  const subIds = await getRecurringSubcategoryIds(item.id);
  if (subIds.length > 0) {
    await db.insert(transactionSubcategories).values(
      subIds.map((subId) => ({
        transactionId: txn.id,
        subcategoryId: subId,
      })),
    );
  }

  await updateAccountBalance(item.accountId, item.amount, item.type as "income" | "expense", true);

  const nextDate = getNextDate(today, item.frequency, {
    dayOfMonth: item.dayOfMonth,
    dayOfWeek: item.dayOfWeek,
  });

  if (item.endDate && nextDate > item.endDate) {
    await db
      .update(recurringTransactions)
      .set({ isActive: false, nextDate })
      .where(eq(recurringTransactions.id, item.id));
  } else {
    await db
      .update(recurringTransactions)
      .set({ nextDate })
      .where(eq(recurringTransactions.id, item.id));
  }
}

/**
 * Smart upcoming filter for home screen.
 * Shows recurring where:
 * - nextDate is within 30 days
 * - Last generated transaction was more than half-period ago (or never)
 */
export async function getSmartUpcoming(limit = 3): Promise<RecurringWithAccount[]> {
  const today = todayDateString();
  const d = new Date();
  d.setDate(d.getDate() + 30);
  const thirtyDaysOut = d.toISOString().slice(0, 10);

  const candidates = await db
    .select()
    .from(recurringTransactions)
    .where(
      and(
        eq(recurringTransactions.isActive, true),
        lte(recurringTransactions.nextDate, thirtyDaysOut),
      ),
    )
    .orderBy(recurringTransactions.nextDate);

  const results: RecurringTransaction[] = [];
  for (const item of candidates) {
    if (results.length >= limit) break;

    const [lastTxn] = await db
      .select({ date: transactions.date })
      .from(transactions)
      .where(eq(transactions.recurringId, item.id))
      .orderBy(desc(transactions.date))
      .limit(1);

    if (lastTxn) {
      const daysSinceLast = daysBetween(lastTxn.date, today);
      const halfPeriod = frequencyToDays(item.frequency) / 2;
      if (daysSinceLast < halfPeriod) continue;
    }

    results.push(item);
  }

  return attachAccountCurrency(results);
}
