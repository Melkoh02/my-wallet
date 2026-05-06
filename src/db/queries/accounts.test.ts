// updateAccountBalance + getAccountsTotals integration tests against an
// in-memory SQLite. Wires up the test DB and swaps @/db/client for it via
// jest.mock; the production client never runs in tests.

/* eslint-disable import/first */
import { setupTestDb, resetTestDb } from "@/db/test-client";

jest.mock("@/db/client", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getTestDb } = require("@/db/test-client");
  return {
    get db() {
      return getTestDb();
    },
  };
});

import { createAccount, updateAccountBalance, getAccountsTotals } from "./accounts";
import type { NewAccount } from "@/db/schema";

const baseAccount: Omit<NewAccount, "id"> = {
  name: "Test",
  institution: "",
  type: "debit",
  balance: 0,
  currency: "USD",
  color: "#000",
  icon: "wallet",
  isActive: true,
  includeInNetWorth: true,
};

beforeAll(() => setupTestDb());
beforeEach(() => resetTestDb());

describe("updateAccountBalance — universal delta direction", () => {
  it("decreases balance on expense", async () => {
    const acc = await createAccount({ ...baseAccount, balance: 100 });
    await updateAccountBalance(acc.id, 30, "expense", true);
    const { totalAssets } = await getAccountsTotals();
    expect(totalAssets).toBe(70);
  });

  it("increases balance on income", async () => {
    const acc = await createAccount({ ...baseAccount, balance: 100 });
    await updateAccountBalance(acc.id, 50, "income", true);
    const { totalAssets } = await getAccountsTotals();
    expect(totalAssets).toBe(150);
  });

  it("decreases source on transfer (isSource=true)", async () => {
    const acc = await createAccount({ ...baseAccount, balance: 100 });
    await updateAccountBalance(acc.id, 25, "transfer", true);
    const { totalAssets } = await getAccountsTotals();
    expect(totalAssets).toBe(75);
  });

  it("increases destination on transfer (isSource=false)", async () => {
    const acc = await createAccount({ ...baseAccount, balance: 100 });
    await updateAccountBalance(acc.id, 25, "transfer", false);
    const { totalAssets } = await getAccountsTotals();
    expect(totalAssets).toBe(125);
  });

  it("treats credit cards the same — no special-case", async () => {
    // invariant: credit card balance = available credit, not debt. expense
    // decreases balance just like any other account type.
    const card = await createAccount({
      ...baseAccount,
      type: "credit",
      balance: 1000, // available credit
      creditLimit: 1500,
    });
    await updateAccountBalance(card.id, 200, "expense", true);
    // balance should now be 800; debt = 1500 - 800 = 700
    const { totalLiabilities, totalAssets } = await getAccountsTotals();
    expect(totalLiabilities).toBe(700);
    expect(totalAssets).toBe(0);
  });
});

describe("getAccountsTotals — classification by account type", () => {
  it("treats debit/cash/wallet/savings/investment with positive balance as assets", async () => {
    await createAccount({ ...baseAccount, type: "debit", balance: 100 });
    await createAccount({ ...baseAccount, type: "cash", balance: 50 });
    await createAccount({ ...baseAccount, type: "wallet", balance: 25 });
    await createAccount({ ...baseAccount, type: "savings", balance: 1000 });
    await createAccount({ ...baseAccount, type: "investment", balance: 500 });
    const { totalAssets, totalLiabilities, netWorth } = await getAccountsTotals();
    expect(totalAssets).toBe(1675);
    expect(totalLiabilities).toBe(0);
    expect(netWorth).toBe(1675);
  });

  it("treats those with negative balance as liabilities", async () => {
    // Negative debit could happen via overdraft. Negative cash is unusual but
    // possible if the user records expenses while balance is low.
    await createAccount({ ...baseAccount, type: "debit", balance: -50 });
    const { totalAssets, totalLiabilities } = await getAccountsTotals();
    expect(totalAssets).toBe(0);
    expect(totalLiabilities).toBe(50);
  });

  describe("credit cards", () => {
    it("debt = creditLimit - balance counts as a liability", async () => {
      await createAccount({
        ...baseAccount,
        type: "credit",
        balance: 800, // available
        creditLimit: 1500,
      });
      const { totalLiabilities } = await getAccountsTotals();
      expect(totalLiabilities).toBe(700);
    });

    it("overpaid card (balance > creditLimit) counts as an asset", async () => {
      await createAccount({
        ...baseAccount,
        type: "credit",
        balance: 1700, // overpaid by 200
        creditLimit: 1500,
      });
      const { totalAssets, totalLiabilities } = await getAccountsTotals();
      expect(totalAssets).toBe(200);
      expect(totalLiabilities).toBe(0);
    });

    it("settled card (balance == creditLimit) contributes nothing", async () => {
      await createAccount({
        ...baseAccount,
        type: "credit",
        balance: 1500,
        creditLimit: 1500,
      });
      const { totalAssets, totalLiabilities } = await getAccountsTotals();
      expect(totalAssets).toBe(0);
      expect(totalLiabilities).toBe(0);
    });
  });

  describe("loan_borrowed", () => {
    it("balance < 0 counts as a liability (the user still owes)", async () => {
      await createAccount({ ...baseAccount, type: "loan_borrowed", balance: -1000 });
      const { totalLiabilities, totalAssets } = await getAccountsTotals();
      expect(totalLiabilities).toBe(1000);
      expect(totalAssets).toBe(0);
    });

    it("balance > 0 counts as an asset (overpaid — lender owes user)", async () => {
      await createAccount({ ...baseAccount, type: "loan_borrowed", balance: 50 });
      const { totalAssets, totalLiabilities } = await getAccountsTotals();
      expect(totalAssets).toBe(50);
      expect(totalLiabilities).toBe(0);
    });

    it("balance == 0 (settled) contributes nothing", async () => {
      await createAccount({ ...baseAccount, type: "loan_borrowed", balance: 0 });
      const { totalAssets, totalLiabilities } = await getAccountsTotals();
      expect(totalAssets).toBe(0);
      expect(totalLiabilities).toBe(0);
    });
  });

  describe("loan_lent", () => {
    it("balance > 0 counts as an asset (counterparty still owes)", async () => {
      await createAccount({ ...baseAccount, type: "loan_lent", balance: 500 });
      const { totalAssets, totalLiabilities } = await getAccountsTotals();
      expect(totalAssets).toBe(500);
      expect(totalLiabilities).toBe(0);
    });

    it("balance < 0 counts as a liability (user overpaid the counterparty)", async () => {
      await createAccount({ ...baseAccount, type: "loan_lent", balance: -25 });
      const { totalAssets, totalLiabilities } = await getAccountsTotals();
      expect(totalAssets).toBe(0);
      expect(totalLiabilities).toBe(25);
    });
  });

  it("skips accounts with includeInNetWorth = false", async () => {
    await createAccount({ ...baseAccount, type: "debit", balance: 100 });
    await createAccount({
      ...baseAccount,
      type: "debit",
      balance: 999,
      includeInNetWorth: false,
    });
    const { totalAssets, netWorth } = await getAccountsTotals();
    expect(totalAssets).toBe(100);
    expect(netWorth).toBe(100);
  });

  it("netWorth = totalAssets - totalLiabilities, including negative cases", async () => {
    await createAccount({ ...baseAccount, type: "debit", balance: 200 });
    await createAccount({
      ...baseAccount,
      type: "credit",
      balance: 100, // 400 debt
      creditLimit: 500,
    });
    const { netWorth, totalAssets, totalLiabilities } = await getAccountsTotals();
    expect(totalAssets).toBe(200);
    expect(totalLiabilities).toBe(400);
    expect(netWorth).toBe(-200);
  });
});

describe("getAccountsTotals — currency conversion", () => {
  it("applies convertFn to non-display-currency accounts", async () => {
    await createAccount({ ...baseAccount, type: "debit", balance: 100, currency: "USD" });
    await createAccount({ ...baseAccount, type: "debit", balance: 50, currency: "EUR" });

    // Mock: 1 EUR = 1.10 USD. convertFn returns the converted amount.
    const convertFn = async (amount: number, currency: string) =>
      currency === "EUR" ? amount * 1.1 : amount;

    const { totalAssets } = await getAccountsTotals(convertFn);
    expect(totalAssets).toBeCloseTo(155, 5); // 100 + 55
  });

  it("works without convertFn (single-currency case)", async () => {
    await createAccount({ ...baseAccount, type: "debit", balance: 100 });
    await createAccount({ ...baseAccount, type: "debit", balance: 200 });
    const { totalAssets } = await getAccountsTotals();
    expect(totalAssets).toBe(300);
  });
});
