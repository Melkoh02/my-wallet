import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { accounts, type Account } from "@/db/schema";

/**
 * Daily compound interest accrual for accounts with an `interestRate` set.
 * Both functions in this file follow the same shape:
 *
 *   newBalance = balance × (1 + rate/100/365) ^ days
 *
 * Where `days` is the gap between today and `lastInterestDate` (or `createdAt`
 * if never accrued). Run on app foreground from `DatabaseProvider`. Idempotent
 * within a day — re-running on the same day is a no-op once `lastInterestDate`
 * is set to today.
 *
 * The two account categories that accrue (investment + loans) are similar
 * enough that they share the math but differ on the "should this row accrue
 * today?" predicate — see the per-function notes.
 */

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBetweenIso(from: string, to: string): number {
  return Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 86400000);
}

function compoundedBalance(balance: number, ratePercent: number, days: number): number {
  const dailyRate = ratePercent / 100 / 365;
  const next = balance * Math.pow(1 + dailyRate, days);
  return Math.round(next * 100) / 100;
}

/**
 * Apply daily compounding to a single account row. Mutates the DB.
 * - Skips when balance fails the canonical-sign predicate; just bumps
 *   `lastInterestDate` so the period doesn't accrue retroactively when the
 *   account becomes active again.
 * - Skips when `days <= 0` (same-day rerun).
 */
async function accrueOne(
  acc: Account,
  shouldCompound: (balance: number) => boolean,
): Promise<void> {
  if (!acc.interestRate) return;
  const today = todayIsoDate();
  const lastDate = acc.lastInterestDate ?? acc.createdAt.slice(0, 10);
  if (lastDate >= today) return;

  if (!shouldCompound(acc.balance)) {
    // why: advance lastInterestDate without compounding so a later sign flip
    // (e.g. loan_borrowed paid off and resumed) doesn't retroactively accrue.
    await db.update(accounts).set({ lastInterestDate: today }).where(eq(accounts.id, acc.id));
    return;
  }

  const days = daysBetweenIso(lastDate, today);
  if (days <= 0) return;

  await db
    .update(accounts)
    .set({
      balance: compoundedBalance(acc.balance, acc.interestRate, days),
      lastInterestDate: today,
    })
    .where(eq(accounts.id, acc.id));
}

/**
 * Compound investment accounts. Investments grow only when the user has money
 * in them (balance > 0). Zero-or-negative just advances the date — see the
 * `// why:` in `accrueOne` for the rationale.
 */
export async function applyInvestmentInterest(): Promise<void> {
  const investments = await db
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.type, "investment"),
        eq(accounts.isActive, true),
        isNotNull(accounts.interestRate),
      ),
    );
  for (const acc of investments) {
    await accrueOne(acc, (b) => b > 0);
  }
}

/**
 * Compound loan accounts. Direction:
 * - `loan_borrowed`: balance < 0 means user still owes; interest grows the
 *   debt (multiplier on a negative number = more negative). Sign-aware skip
 *   for settled (=0) or overpaid (>0) loans.
 * - `loan_lent`: balance > 0 means counterparty still owes; interest grows
 *   what's owed. Sign-aware skip for settled or overpaid-by-user loans.
 *
 * invariant: the same compound formula handles both signs because the
 * multiplier preserves sign — `-1000 × 1.05 = -1050` and `1000 × 1.05 = 1050`.
 * Don't add a per-type formula; it'd diverge from the shared math.
 */
export async function applyLoanInterest(): Promise<void> {
  const loans = await db
    .select()
    .from(accounts)
    .where(
      and(
        inArray(accounts.type, ["loan_borrowed", "loan_lent"]),
        eq(accounts.isActive, true),
        isNotNull(accounts.interestRate),
      ),
    );
  for (const acc of loans) {
    const canonical = acc.type === "loan_borrowed" ? (b: number) => b < 0 : (b: number) => b > 0;
    await accrueOne(acc, canonical);
  }
}
