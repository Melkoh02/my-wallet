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

// captureRateForCurrency would normally hit the exchange-rate service. The
// default mock returns a 1:1 USD rate; tests that want a different return
// value override per-call via `mockResolvedValueOnce` rather than mutating
// shared state — `mockResolvedValueOnce` self-clears, so state can't bleed.
jest.mock("@/services/exchangeRate.service", () => ({
  captureRateForCurrency: jest.fn(async () => ({
    rateToDisplay: 1,
    displayCurrency: "USD",
  })),
}));

import {
  createTransaction,
  deleteTransaction,
  transferDestAmount,
  getAllContactsWithActivity,
  getTransactionsForPlace,
  getTransactionsInBounds,
} from "./transactions";
import { createAccount, getAccountById } from "./accounts";
import { createPlace } from "./places";
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
  jest.clearAllMocks(); // clear call history; default mock impl persists
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
    const { captureRateForCurrency } = require("@/services/exchangeRate.service");
    captureRateForCurrency.mockResolvedValueOnce({ rateToDisplay: 1.1, displayCurrency: "USD" });

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
    const { captureRateForCurrency } = require("@/services/exchangeRate.service");
    captureRateForCurrency.mockResolvedValueOnce({ rateToDisplay: null, displayCurrency: "USD" });

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

describe("getAllContactsWithActivity", () => {
  it("returns empty when no transactions reference any contact", async () => {
    const acc = await createAccount({ ...baseAccount, balance: 1000 });
    await createTransaction(
      {
        type: "expense",
        amount: 50,
        description: "no contact",
        accountId: acc.id,
        date: "2026-01-15",
        time: "12:00",
      },
      [],
    );
    expect(await getAllContactsWithActivity()).toEqual([]);
  });

  it("groups transactions by contactId when present", async () => {
    const acc = await createAccount({ ...baseAccount, balance: 10000 });
    await createTransaction(
      {
        type: "expense",
        amount: 30,
        description: "lunch",
        accountId: acc.id,
        date: "2026-01-15",
        time: "12:00",
        contactId: "device-001",
        contactName: "Alice",
      },
      [],
    );
    await createTransaction(
      {
        type: "expense",
        amount: 50,
        description: "dinner",
        accountId: acc.id,
        date: "2026-01-20",
        time: "12:00",
        contactId: "device-001",
        contactName: "Alice",
      },
      [],
    );
    const result = await getAllContactsWithActivity();
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      contactId: "device-001",
      contactName: "Alice",
      count: 2,
      lastDate: "2026-01-20",
    });
  });

  it("groups free-typed contacts by name when contactId is null", async () => {
    const acc = await createAccount({ ...baseAccount, balance: 10000 });
    await createTransaction(
      {
        type: "expense",
        amount: 10,
        description: "x",
        accountId: acc.id,
        date: "2026-01-10",
        time: "12:00",
        contactId: null,
        contactName: "Bob (free-typed)",
      },
      [],
    );
    await createTransaction(
      {
        type: "expense",
        amount: 20,
        description: "y",
        accountId: acc.id,
        date: "2026-01-15",
        time: "12:00",
        contactId: null,
        contactName: "Bob (free-typed)",
      },
      [],
    );
    const result = await getAllContactsWithActivity();
    expect(result).toHaveLength(1);
    expect(result[0].contactId).toBeNull();
    expect(result[0].contactName).toBe("Bob (free-typed)");
    expect(result[0].count).toBe(2);
  });

  it("sorts by most-recent activity first", async () => {
    const acc = await createAccount({ ...baseAccount, balance: 10000 });
    await createTransaction(
      {
        type: "expense",
        amount: 10,
        description: "old",
        accountId: acc.id,
        date: "2026-01-01",
        time: "12:00",
        contactId: "c1",
        contactName: "Old contact",
      },
      [],
    );
    await createTransaction(
      {
        type: "expense",
        amount: 10,
        description: "new",
        accountId: acc.id,
        date: "2026-03-15",
        time: "12:00",
        contactId: "c2",
        contactName: "New contact",
      },
      [],
    );
    const result = await getAllContactsWithActivity();
    expect(result.map((c) => c.contactName)).toEqual(["New contact", "Old contact"]);
  });

  it("treats same name with different contactIds as separate rows", async () => {
    // Same display name typed manually then later linked to a device contact
    // shows up as two rows. User can re-link to consolidate.
    const acc = await createAccount({ ...baseAccount, balance: 10000 });
    await createTransaction(
      {
        type: "expense",
        amount: 5,
        description: "free-typed first",
        accountId: acc.id,
        date: "2026-01-01",
        time: "12:00",
        contactId: null,
        contactName: "Same Name",
      },
      [],
    );
    await createTransaction(
      {
        type: "expense",
        amount: 5,
        description: "device-linked second",
        accountId: acc.id,
        date: "2026-02-01",
        time: "12:00",
        contactId: "device-007",
        contactName: "Same Name",
      },
      [],
    );
    const result = await getAllContactsWithActivity();
    expect(result).toHaveLength(2);
    const ids = result.map((c) => c.contactId);
    expect(ids).toContain(null);
    expect(ids).toContain("device-007");
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

describe("getTransactionsForPlace", () => {
  it("returns only transactions linked to the given placeId, most-recent first", async () => {
    const acc = await createAccount({ ...baseAccount });
    const home = await createPlace({
      name: "Home",
      latitude: 1,
      longitude: 1,
      source: "manual",
    });
    const cafe = await createPlace({
      name: "Cafe",
      latitude: 2,
      longitude: 2,
      source: "manual",
    });
    await createTransaction(
      {
        type: "expense",
        amount: 5,
        accountId: acc.id,
        date: "2026-01-01",
        time: "10:00",
        placeId: home.id,
      },
      [],
    );
    await createTransaction(
      {
        type: "expense",
        amount: 7,
        accountId: acc.id,
        date: "2026-01-03",
        time: "12:00",
        placeId: home.id,
      },
      [],
    );
    await createTransaction(
      {
        type: "expense",
        amount: 9,
        accountId: acc.id,
        date: "2026-01-02",
        time: "11:00",
        placeId: cafe.id,
      },
      [],
    );

    const homeTxns = await getTransactionsForPlace(home.id);
    expect(homeTxns).toHaveLength(2);
    expect(homeTxns[0].amount).toBe(7); // 2026-01-03 ordered before 2026-01-01
    expect(homeTxns[1].amount).toBe(5);
    expect(homeTxns[0].placeName).toBe("Home"); // enrichment ran
  });

  it("returns an empty array when the place has no linked transactions", async () => {
    const empty = await createPlace({ name: "Empty", source: "manual" });
    expect(await getTransactionsForPlace(empty.id)).toEqual([]);
  });
});

describe("getTransactionsInBounds", () => {
  it("returns transactions whose place coords fall inside the bbox", async () => {
    const acc = await createAccount({ ...baseAccount });
    const inside = await createPlace({
      name: "Inside",
      latitude: 37.7749,
      longitude: -122.4194,
      source: "manual",
    });
    const outside = await createPlace({
      name: "Outside NYC",
      latitude: 40.7128,
      longitude: -74.006,
      source: "manual",
    });
    await createTransaction(
      {
        type: "expense",
        amount: 1,
        accountId: acc.id,
        date: "2026-01-01",
        time: "10:00",
        placeId: inside.id,
      },
      [],
    );
    await createTransaction(
      {
        type: "expense",
        amount: 2,
        accountId: acc.id,
        date: "2026-01-01",
        time: "10:00",
        placeId: outside.id,
      },
      [],
    );

    // SF-area bbox.
    const result = await getTransactionsInBounds({
      west: -123,
      south: 37,
      east: -122,
      north: 38,
    });
    expect(result).toHaveLength(1);
    expect(result[0].placeName).toBe("Inside");
  });

  it("excludes transactions with no place at all (innerJoin)", async () => {
    const acc = await createAccount({ ...baseAccount });
    await createTransaction(
      {
        type: "expense",
        amount: 1,
        accountId: acc.id,
        date: "2026-01-01",
        time: "10:00",
        // no placeId
      },
      [],
    );
    const result = await getTransactionsInBounds({
      west: -180,
      south: -90,
      east: 180,
      north: 90,
    });
    expect(result).toEqual([]);
  });

  it("handles antimeridian-wrapping bounds (west > east)", async () => {
    const acc = await createAccount({ ...baseAccount });
    // Place at lng = 179 (just west of dateline).
    const left = await createPlace({
      name: "West of line",
      latitude: -17.7,
      longitude: 179,
      source: "manual",
    });
    // Place at lng = -179 (just east of dateline).
    const right = await createPlace({
      name: "East of line",
      latitude: -17.7,
      longitude: -179,
      source: "manual",
    });
    // Place that should be excluded — middle of America, far from dateline.
    const far = await createPlace({
      name: "Middle America",
      latitude: 39,
      longitude: -98,
      source: "manual",
    });
    for (const placeId of [left.id, right.id, far.id]) {
      await createTransaction(
        {
          type: "expense",
          amount: 1,
          accountId: acc.id,
          date: "2026-01-01",
          time: "10:00",
          placeId,
        },
        [],
      );
    }

    // Box that wraps the antimeridian: west=178, east=-178 (so it spans
    // across 180/-180, NOT the long way around through America).
    const result = await getTransactionsInBounds({
      west: 178,
      south: -20,
      east: -178,
      north: -15,
    });
    const names = result.map((r) => r.placeName).sort();
    expect(names).toEqual(["East of line", "West of line"]);
  });

  it("filters to expense type — income/transfer at the same place are excluded", async () => {
    const acc = await createAccount({ ...baseAccount });
    const place = await createPlace({
      name: "Office",
      latitude: 37.7749,
      longitude: -122.4194,
      source: "manual",
    });
    // Salary deposited at the office.
    await createTransaction(
      {
        type: "income",
        amount: 1000,
        accountId: acc.id,
        date: "2026-01-01",
        time: "10:00",
        placeId: place.id,
      },
      [],
    );
    // Coffee bought at the office.
    await createTransaction(
      {
        type: "expense",
        amount: 5,
        accountId: acc.id,
        date: "2026-01-01",
        time: "10:30",
        placeId: place.id,
      },
      [],
    );

    const result = await getTransactionsInBounds({
      west: -180,
      south: -90,
      east: 180,
      north: 90,
    });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("expense");
    expect(result[0].amount).toBe(5);
  });
});
