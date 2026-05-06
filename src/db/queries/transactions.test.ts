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

// captureRateForCurrency would normally hit the exchange-rate service; stub it
// to return predictable values per test. Each test sets up the fake response.
jest.mock("@/services/exchangeRate.service", () => {
  const fakeRate: { rate: number | null; displayCurrency: string } = {
    rate: 1,
    displayCurrency: "USD",
  };
  return {
    __setFakeRate: (rate: number | null, displayCurrency = "USD") => {
      fakeRate.rate = rate;
      fakeRate.displayCurrency = displayCurrency;
    },
    captureRateForCurrency: jest.fn(async (_currency: string) => ({
      rateToDisplay: fakeRate.rate,
      displayCurrency: fakeRate.displayCurrency,
    })),
  };
});

import { createTransaction, deleteTransaction, transferDestAmount } from "./transactions";
import { createAccount, getAccountById } from "./accounts";
import type { NewAccount, Transaction } from "@/db/schema";

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
beforeEach(() => {
  resetTestDb();
  // Default: 1:1 rate to display currency, USD display.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const m = require("@/services/exchangeRate.service");
  m.__setFakeRate(1, "USD");
});

describe("transferDestAmount — toAmount fallback rule", () => {
  it("returns toAmount when set (cross-currency transfer)", () => {
    const txn = { amount: 100, toAmount: 92 } as Pick<Transaction, "amount" | "toAmount">;
    expect(transferDestAmount(txn)).toBe(92);
  });

  it("falls back to amount when toAmount is null (same-currency transfer)", () => {
    const txn = { amount: 100, toAmount: null } as Pick<Transaction, "amount" | "toAmount">;
    expect(transferDestAmount(txn)).toBe(100);
  });

  it("never returns null — type guarantees a number", () => {
    expect(transferDestAmount({ amount: 0, toAmount: null })).toBe(0);
    expect(transferDestAmount({ amount: 50, toAmount: 0 })).toBe(0);
  });
});

describe("createTransaction — balance updates", () => {
  it("expense decreases the source account", async () => {
    const acc = await createAccount({ ...baseAccount, balance: 1000 });
    await createTransaction(
      {
        type: "expense",
        amount: 250,
        description: "lunch",
        accountId: acc.id,
        date: "2026-01-15",
        time: "12:00",
      },
      [],
    );
    const after = await getAccountById(acc.id);
    expect(after?.balance).toBe(750);
  });

  it("income increases the source account", async () => {
    const acc = await createAccount({ ...baseAccount, balance: 1000 });
    await createTransaction(
      {
        type: "income",
        amount: 500,
        description: "freelance",
        accountId: acc.id,
        date: "2026-01-15",
        time: "12:00",
      },
      [],
    );
    const after = await getAccountById(acc.id);
    expect(after?.balance).toBe(1500);
  });

  it("same-currency transfer moves money: source -amount, dest +amount", async () => {
    const src = await createAccount({ ...baseAccount, name: "Checking", balance: 1000 });
    const dst = await createAccount({ ...baseAccount, name: "Savings", balance: 0 });
    await createTransaction(
      {
        type: "transfer",
        amount: 200,
        description: "to savings",
        accountId: src.id,
        toAccountId: dst.id,
        date: "2026-01-15",
        time: "12:00",
      },
      [],
    );
    const srcAfter = await getAccountById(src.id);
    const dstAfter = await getAccountById(dst.id);
    expect(srcAfter?.balance).toBe(800);
    expect(dstAfter?.balance).toBe(200);
  });

  it("cross-currency transfer credits dest in toAmount, not amount", async () => {
    const usd = await createAccount({
      ...baseAccount,
      name: "USD",
      balance: 1000,
      currency: "USD",
    });
    const eur = await createAccount({ ...baseAccount, name: "EUR", balance: 0, currency: "EUR" });
    await createTransaction(
      {
        type: "transfer",
        amount: 110, // USD sent
        toAmount: 100, // EUR received (cross-currency rate ~1.1)
        description: "wire to euro",
        accountId: usd.id,
        toAccountId: eur.id,
        date: "2026-01-15",
        time: "12:00",
      },
      [],
    );
    const usdAfter = await getAccountById(usd.id);
    const eurAfter = await getAccountById(eur.id);
    expect(usdAfter?.balance).toBe(890); // 1000 - 110
    expect(eurAfter?.balance).toBe(100); // 0 + 100 (toAmount, not amount)
  });

  it("expense on a credit card decreases available credit (no special-case)", async () => {
    const card = await createAccount({
      ...baseAccount,
      type: "credit",
      balance: 1500, // available credit
      creditLimit: 2000,
    });
    await createTransaction(
      {
        type: "expense",
        amount: 100,
        description: "groceries",
        accountId: card.id,
        date: "2026-01-15",
        time: "12:00",
      },
      [],
    );
    const after = await getAccountById(card.id);
    expect(after?.balance).toBe(1400); // 1500 - 100
  });
});

describe("createTransaction — currency snapshot capture", () => {
  it("stamps currency from the account on insert when not pre-set", async () => {
    const acc = await createAccount({ ...baseAccount, currency: "EUR", balance: 1000 });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require("@/services/exchangeRate.service");
    m.__setFakeRate(1.1, "USD");

    const txn = await createTransaction(
      {
        type: "expense",
        amount: 50,
        description: "test",
        accountId: acc.id,
        date: "2026-01-15",
        time: "12:00",
      },
      [],
    );
    expect(txn.currency).toBe("EUR");
    expect(txn.rateToDisplay).toBe(1.1);
    expect(txn.displayCurrencySnapshot).toBe("USD");
  });

  it("stamps null rateToDisplay when no rate is available (offline scenario)", async () => {
    const acc = await createAccount({ ...baseAccount, currency: "ARS", balance: 1000 });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require("@/services/exchangeRate.service");
    m.__setFakeRate(null, "USD");

    const txn = await createTransaction(
      {
        type: "expense",
        amount: 50,
        description: "test",
        accountId: acc.id,
        date: "2026-01-15",
        time: "12:00",
      },
      [],
    );
    expect(txn.currency).toBe("ARS");
    expect(txn.rateToDisplay).toBeNull();
    expect(txn.displayCurrencySnapshot).toBe("USD");
  });

  it("respects pre-set currency fields and skips capture", async () => {
    // Recurring catchup paths pre-set these fields; createTransaction shouldn't
    // overwrite them.
    const acc = await createAccount({ ...baseAccount, currency: "USD", balance: 1000 });
    const txn = await createTransaction(
      {
        type: "expense",
        amount: 50,
        description: "test",
        accountId: acc.id,
        date: "2026-01-10",
        time: "12:00",
        currency: "USD",
        rateToDisplay: null, // intentionally null (backdated catchup pattern)
        displayCurrencySnapshot: null,
      },
      [],
    );
    expect(txn.rateToDisplay).toBeNull();
    expect(txn.displayCurrencySnapshot).toBeNull();
  });
});

describe("deleteTransaction — balance reversal", () => {
  it("reverses an expense", async () => {
    const acc = await createAccount({ ...baseAccount, balance: 1000 });
    const txn = await createTransaction(
      {
        type: "expense",
        amount: 250,
        description: "lunch",
        accountId: acc.id,
        date: "2026-01-15",
        time: "12:00",
      },
      [],
    );
    expect((await getAccountById(acc.id))?.balance).toBe(750);
    await deleteTransaction(txn.id);
    expect((await getAccountById(acc.id))?.balance).toBe(1000);
  });

  it("reverses a same-currency transfer on both sides", async () => {
    const src = await createAccount({ ...baseAccount, name: "S", balance: 1000 });
    const dst = await createAccount({ ...baseAccount, name: "D", balance: 0 });
    const txn = await createTransaction(
      {
        type: "transfer",
        amount: 200,
        description: "x",
        accountId: src.id,
        toAccountId: dst.id,
        date: "2026-01-15",
        time: "12:00",
      },
      [],
    );
    expect((await getAccountById(src.id))?.balance).toBe(800);
    expect((await getAccountById(dst.id))?.balance).toBe(200);
    await deleteTransaction(txn.id);
    expect((await getAccountById(src.id))?.balance).toBe(1000);
    expect((await getAccountById(dst.id))?.balance).toBe(0);
  });

  it("reverses a cross-currency transfer using toAmount on the dest side", async () => {
    const usd = await createAccount({
      ...baseAccount,
      name: "USD",
      balance: 1000,
      currency: "USD",
    });
    const eur = await createAccount({ ...baseAccount, name: "EUR", balance: 0, currency: "EUR" });
    const txn = await createTransaction(
      {
        type: "transfer",
        amount: 110,
        toAmount: 100,
        description: "x",
        accountId: usd.id,
        toAccountId: eur.id,
        date: "2026-01-15",
        time: "12:00",
      },
      [],
    );
    expect((await getAccountById(usd.id))?.balance).toBe(890);
    expect((await getAccountById(eur.id))?.balance).toBe(100);
    await deleteTransaction(txn.id);
    expect((await getAccountById(usd.id))?.balance).toBe(1000);
    expect((await getAccountById(eur.id))?.balance).toBe(0);
  });

  it("is a no-op when the transaction id doesn't exist", async () => {
    const acc = await createAccount({ ...baseAccount, balance: 1000 });
    await deleteTransaction(9999); // doesn't throw, doesn't change state
    expect((await getAccountById(acc.id))?.balance).toBe(1000);
  });
});
