/* eslint-disable import/first */
// Daily-compound interest accrual for both investment and loan accounts.
// Both share `accrueOne`'s math; tests exercise the per-type predicate
// (when to compound vs. just advance the date) plus the `lastInterestDate`
// state machine.

import { setupTestDb, resetTestDb, getTestDb } from "@/db/test-client";

jest.mock("@/db/client", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getTestDb } = require("@/db/test-client");
  return {
    get db() {
      return getTestDb();
    },
  };
});

import { applyInvestmentInterest, applyLoanInterest } from "./interest";
import { makeAccount, makeLoan } from "@/db/test-fixtures";
import { accounts } from "@/db/schema";
import { eq } from "drizzle-orm";

beforeAll(() => setupTestDb());
beforeEach(() => {
  resetTestDb();
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

// Pin "today" deterministically. Both `applyInvestmentInterest` and
// `applyLoanInterest` build today via `new Date().toISOString().slice(0, 10)`,
// so jest.setSystemTime gives exact control.
function setToday(iso: string) {
  // Append a midday time so .slice(0, 10) is deterministic regardless of TZ
  // (jest.setup.ts pins TZ to UTC, but defence-in-depth).
  jest.setSystemTime(new Date(`${iso}T12:00:00Z`));
}

async function getAccount(id: number) {
  const db = getTestDb();
  const [row] = await db.select().from(accounts).where(eq(accounts.id, id));
  return row;
}

describe("applyInvestmentInterest", () => {
  it("compounds positive balance over the elapsed days", async () => {
    setToday("2026-04-01");
    const acc = await makeAccount({
      type: "investment",
      balance: 1000,
      currency: "USD",
      interestRate: 5, // 5% APR
      lastInterestDate: "2026-01-01", // 90 days earlier
    });

    await applyInvestmentInterest();

    const after = await getAccount(acc.id);
    // 1000 × (1 + 5/100/365)^90 ≈ 1012.40
    expect(after.balance).toBeGreaterThan(1012);
    expect(after.balance).toBeLessThan(1013);
    expect(after.lastInterestDate).toBe("2026-04-01");
  });

  it("does not compound zero or negative balance — just advances the date", async () => {
    setToday("2026-04-01");
    const acc = await makeAccount({
      type: "investment",
      balance: 0,
      interestRate: 10,
      lastInterestDate: "2026-01-01",
    });
    await applyInvestmentInterest();
    const after = await getAccount(acc.id);
    expect(after.balance).toBe(0);
    expect(after.lastInterestDate).toBe("2026-04-01");
  });

  it("is idempotent within a day (no double-accrual on rerun)", async () => {
    setToday("2026-04-01");
    const acc = await makeAccount({
      type: "investment",
      balance: 1000,
      interestRate: 5,
      lastInterestDate: "2026-03-31",
    });
    await applyInvestmentInterest();
    const first = await getAccount(acc.id);
    await applyInvestmentInterest();
    const second = await getAccount(acc.id);
    expect(second.balance).toBe(first.balance);
    expect(second.lastInterestDate).toBe("2026-04-01");
  });

  it("skips accounts with no interestRate set", async () => {
    setToday("2026-04-01");
    const acc = await makeAccount({
      type: "investment",
      balance: 1000,
      interestRate: null,
      lastInterestDate: "2026-01-01",
    });
    await applyInvestmentInterest();
    const after = await getAccount(acc.id);
    expect(after.balance).toBe(1000); // unchanged
    expect(after.lastInterestDate).toBe("2026-01-01"); // unchanged
  });

  it("skips inactive (archived) accounts", async () => {
    setToday("2026-04-01");
    const acc = await makeAccount({
      type: "investment",
      balance: 1000,
      interestRate: 5,
      lastInterestDate: "2026-01-01",
      isActive: false,
    });
    await applyInvestmentInterest();
    const after = await getAccount(acc.id);
    expect(after.balance).toBe(1000);
  });

  it("uses createdAt fallback when lastInterestDate is null", async () => {
    setToday("2026-04-01");
    const acc = await makeAccount({
      type: "investment",
      balance: 1000,
      interestRate: 5,
      lastInterestDate: null,
    });
    // createdAt defaults to the test DB's `datetime('now')`, which under
    // setSystemTime is 2026-04-01. So elapsed days = 0, no compound, but
    // lastInterestDate gets bumped on next-day accrual. We can't easily
    // advance time mid-test without reset, so just verify zero-day no-op.
    await applyInvestmentInterest();
    const after = await getAccount(acc.id);
    expect(after.balance).toBe(1000); // 0 days elapsed
  });
});

describe("applyLoanInterest — loan_borrowed", () => {
  it("compounds owed debt (negative balance becomes more negative)", async () => {
    setToday("2026-04-01");
    const loan = await makeLoan({
      type: "loan_borrowed",
      principal: 1000, // balance = -1000
      rate: 5,
      lastInterestDate: "2026-01-01",
    });

    await applyLoanInterest();

    const after = await getAccount(loan.id);
    // -1000 × (1 + 5/100/365)^90 ≈ -1012.40
    expect(after.balance).toBeLessThan(-1012);
    expect(after.balance).toBeGreaterThan(-1013);
    expect(after.lastInterestDate).toBe("2026-04-01");
  });

  it("skips when balance is settled (= 0) — just advances the date", async () => {
    setToday("2026-04-01");
    const loan = await makeLoan({
      type: "loan_borrowed",
      principal: 1000,
      rate: 5,
      lastInterestDate: "2026-01-01",
    });
    // Override balance directly to 0 (paid off)
    const db = getTestDb();
    await db.update(accounts).set({ balance: 0 }).where(eq(accounts.id, loan.id));

    await applyLoanInterest();

    const after = await getAccount(loan.id);
    expect(after.balance).toBe(0);
    expect(after.lastInterestDate).toBe("2026-04-01");
  });

  it("skips when overpaid (positive balance for loan_borrowed) — date advances only", async () => {
    setToday("2026-04-01");
    const loan = await makeLoan({
      type: "loan_borrowed",
      principal: 1000,
      rate: 5,
      lastInterestDate: "2026-01-01",
    });
    // Simulate user overpaid the lender — balance flipped positive
    const db = getTestDb();
    await db.update(accounts).set({ balance: 50 }).where(eq(accounts.id, loan.id));

    await applyLoanInterest();

    const after = await getAccount(loan.id);
    expect(after.balance).toBe(50); // unchanged
    expect(after.lastInterestDate).toBe("2026-04-01"); // bumped
  });
});

describe("applyLoanInterest — loan_lent", () => {
  it("compounds amount owed (positive balance becomes more positive)", async () => {
    setToday("2026-04-01");
    const loan = await makeLoan({
      type: "loan_lent",
      principal: 500, // balance = +500
      rate: 8,
      lastInterestDate: "2026-01-01",
    });

    await applyLoanInterest();

    const after = await getAccount(loan.id);
    // 500 × (1 + 8/100/365)^90 ≈ 510.00
    expect(after.balance).toBeGreaterThan(509);
    expect(after.balance).toBeLessThan(511);
  });

  it("skips when overpaid by user (negative balance for loan_lent) — date advances only", async () => {
    setToday("2026-04-01");
    const loan = await makeLoan({
      type: "loan_lent",
      principal: 500,
      rate: 8,
      lastInterestDate: "2026-01-01",
    });
    // User accidentally paid the borrower more than they owed → balance < 0
    const db = getTestDb();
    await db.update(accounts).set({ balance: -25 }).where(eq(accounts.id, loan.id));

    await applyLoanInterest();

    const after = await getAccount(loan.id);
    expect(after.balance).toBe(-25);
    expect(after.lastInterestDate).toBe("2026-04-01");
  });

  it("skips when settled at zero", async () => {
    setToday("2026-04-01");
    const loan = await makeLoan({
      type: "loan_lent",
      principal: 500,
      rate: 8,
      lastInterestDate: "2026-01-01",
    });
    const db = getTestDb();
    await db.update(accounts).set({ balance: 0 }).where(eq(accounts.id, loan.id));

    await applyLoanInterest();

    const after = await getAccount(loan.id);
    expect(after.balance).toBe(0);
    expect(after.lastInterestDate).toBe("2026-04-01");
  });
});

describe("applyLoanInterest — multiple loans", () => {
  it("processes loan_borrowed and loan_lent independently in one run", async () => {
    setToday("2026-04-01");
    const borrowed = await makeLoan({
      type: "loan_borrowed",
      principal: 1000,
      rate: 5,
      lastInterestDate: "2026-01-01",
    });
    const lent = await makeLoan({
      type: "loan_lent",
      principal: 500,
      rate: 10,
      lastInterestDate: "2026-01-01",
    });

    await applyLoanInterest();

    const borrowedAfter = await getAccount(borrowed.id);
    const lentAfter = await getAccount(lent.id);
    // borrowed: -1000 * 1.0124 ≈ -1012.40
    expect(borrowedAfter.balance).toBeLessThan(-1012);
    // lent: 500 * 1.0249 ≈ 512.45
    expect(lentAfter.balance).toBeGreaterThan(512);
    expect(lentAfter.balance).toBeLessThan(513);
  });

  it("does not touch non-loan accounts (debit/savings/etc)", async () => {
    setToday("2026-04-01");
    const debit = await makeAccount({
      type: "debit",
      balance: 1000,
      // shouldn't matter — debit accounts don't accrue
      interestRate: 5,
      lastInterestDate: "2026-01-01",
    });
    await applyLoanInterest();
    const after = await getAccount(debit.id);
    expect(after.balance).toBe(1000); // unchanged
  });

  it("does not touch investment accounts (those go through applyInvestmentInterest)", async () => {
    setToday("2026-04-01");
    const inv = await makeAccount({
      type: "investment",
      balance: 1000,
      interestRate: 5,
      lastInterestDate: "2026-01-01",
    });
    await applyLoanInterest(); // should not affect investment
    const after = await getAccount(inv.id);
    expect(after.balance).toBe(1000);
  });
});
