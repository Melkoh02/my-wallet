// restoreData atomicity tests. The function MUST roll back on any insert
// error and leave existing data untouched.

/* eslint-disable import/first */
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

// Stub out the file-system / sharing modules pulled in transitively. We only
// test restoreData here, not the file-pickers.
jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "/tmp/",
  cacheDirectory: "/tmp/",
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  makeDirectoryAsync: jest.fn(async () => undefined),
  writeAsStringAsync: jest.fn(async () => undefined),
  readAsStringAsync: jest.fn(async () => ""),
  deleteAsync: jest.fn(async () => undefined),
  StorageAccessFramework: {
    readDirectoryAsync: jest.fn(async () => []),
    createFileAsync: jest.fn(async () => ""),
    writeAsStringAsync: jest.fn(async () => undefined),
    requestDirectoryPermissionsAsync: jest.fn(async () => ({ granted: false })),
    deleteAsync: jest.fn(async () => undefined),
    makeDirectoryAsync: jest.fn(async () => ""),
  },
}));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));

import { _restoreDataForTests } from "./backup.service";
import { createAccount } from "@/db/queries/accounts";
import { accounts, transactions } from "@/db/schema";
import type { NewAccount } from "@/db/schema";

const baseAccount: Omit<NewAccount, "id"> = {
  name: "Existing",
  institution: "",
  type: "debit",
  balance: 500,
  currency: "USD",
  color: "#000",
  icon: "wallet",
  isActive: true,
  includeInNetWorth: true,
};

beforeAll(() => setupTestDb());
beforeEach(() => resetTestDb());

describe("restoreData — happy path", () => {
  it("replaces all data with the imported backup", async () => {
    // Existing data — should be wiped by restore.
    await createAccount({ ...baseAccount, balance: 999 });

    const result = await _restoreDataForTests({
      accounts: [
        {
          id: 1,
          name: "Imported",
          institution: "Bank",
          type: "debit",
          balance: 1234,
          currency: "USD",
          color: "#000",
          icon: "wallet",
          isActive: true,
          includeInNetWorth: true,
          sortOrder: 0,
          createdAt: "2026-01-01T00:00:00",
          counterparty: null,
          counterpartyContactId: null,
          interestRate: null,
          dueDate: null,
          lastInterestDate: null,
          originTransactionId: null,
          creditLimit: null,
        },
      ],
      categories: [],
      subcategories: [],
      transactions: [],
      transactionSubcategories: [],
      recurringTransactions: [],
      recurringSubcategories: [],
      themes: [],
      settings: [],
      templates: [],
      templateSubcategories: [],
    });

    expect(result.success).toBe(true);

    const db = getTestDb();
    const rows = await db.select().from(accounts);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Imported");
    expect(rows[0].balance).toBe(1234);
  });

  it("imports related rows (transactions referencing accounts)", async () => {
    const result = await _restoreDataForTests({
      accounts: [
        {
          id: 1,
          name: "A",
          institution: "",
          type: "debit",
          balance: 0,
          currency: "USD",
          color: "#000",
          icon: "wallet",
          isActive: true,
          includeInNetWorth: true,
          sortOrder: 0,
          createdAt: "2026-01-01T00:00:00",
          counterparty: null,
          counterpartyContactId: null,
          interestRate: null,
          dueDate: null,
          lastInterestDate: null,
          originTransactionId: null,
          creditLimit: null,
        },
      ],
      categories: [],
      subcategories: [],
      transactions: [
        {
          id: 1,
          type: "expense",
          amount: 50,
          toAmount: null,
          description: "test",
          accountId: 1,
          toAccountId: null,
          date: "2026-01-15",
          time: "12:00",
          latitude: null,
          longitude: null,
          locationName: null,
          contactId: null,
          contactName: null,
          cashbackAmount: null,
          cashbackAccountId: null,
          linkedTransactionId: null,
          notes: null,
          recurringId: null,
          currency: "USD",
          rateToDisplay: 1,
          displayCurrencySnapshot: "USD",
          createdAt: "2026-01-15T12:00:00",
        },
      ],
      transactionSubcategories: [],
      recurringTransactions: [],
      recurringSubcategories: [],
      themes: [],
      settings: [],
      templates: [],
      templateSubcategories: [],
    });

    expect(result.success).toBe(true);
    const db = getTestDb();
    const txns = await db.select().from(transactions);
    expect(txns).toHaveLength(1);
    expect(txns[0].amount).toBe(50);
  });

  it("handles a backup file with empty arrays (just version)", async () => {
    await createAccount({ ...baseAccount, balance: 999 });

    const result = await _restoreDataForTests({
      accounts: [],
      categories: [],
      subcategories: [],
      transactions: [],
      transactionSubcategories: [],
      recurringTransactions: [],
      recurringSubcategories: [],
      themes: [],
      settings: [],
      templates: [],
      templateSubcategories: [],
    });

    expect(result.success).toBe(true);
    const db = getTestDb();
    const rows = await db.select().from(accounts);
    expect(rows).toHaveLength(0); // existing data wiped, none imported
  });
});

describe("restoreData — atomic rollback on error", () => {
  it("leaves existing data intact when an insert fails mid-restore", async () => {
    // Pre-populate with multiple rows + a related transaction so the test
    // proves the *delete* phase also rolled back (one survivor wouldn't
    // distinguish "delete didn't run" from "delete ran inside the txn and
    // got rolled back"). Three accounts + one txn = enough surface.
    const acc1 = await createAccount({ ...baseAccount, name: "Survivor 1", balance: 100 });
    const acc2 = await createAccount({ ...baseAccount, name: "Survivor 2", balance: 200 });
    const acc3 = await createAccount({ ...baseAccount, name: "Survivor 3", balance: 300 });
    const db = getTestDb();
    await db.insert(transactions).values({
      type: "expense",
      amount: 25,
      description: "existing",
      accountId: acc1.id,
      date: "2026-01-15",
      time: "12:00",
      currency: "USD",
      rateToDisplay: 1,
      displayCurrencySnapshot: "USD",
    });
    const beforeAccounts = await db.select().from(accounts);
    const beforeTxns = await db.select().from(transactions);
    expect(beforeAccounts).toHaveLength(3);
    expect(beforeTxns).toHaveLength(1);

    // Craft a backup with a row that will violate the schema. Drizzle/SQLite
    // will throw because `name` is NOT NULL.
    const result = await _restoreDataForTests({
      accounts: [
        {
          id: 1,
          // name intentionally missing → NOT NULL constraint violation
          institution: "",
          type: "debit",
          balance: 100,
          currency: "USD",
          color: "#000",
          icon: "wallet",
          isActive: true,
          includeInNetWorth: true,
          sortOrder: 0,
          createdAt: "2026-01-01T00:00:00",
        } as unknown as Record<string, unknown>,
      ],
      categories: [],
      subcategories: [],
      transactions: [],
      transactionSubcategories: [],
      recurringTransactions: [],
      recurringSubcategories: [],
      themes: [],
      settings: [],
      templates: [],
      templateSubcategories: [],
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();

    // ALL three pre-existing accounts AND their related transaction must
    // still be present — proves both the delete and insert phases were
    // inside the rolled-back transaction boundary.
    const afterAccounts = await db.select().from(accounts);
    const afterTxns = await db.select().from(transactions);
    expect(afterAccounts).toHaveLength(3);
    expect(afterAccounts.map((a) => a.name).sort()).toEqual([
      "Survivor 1",
      "Survivor 2",
      "Survivor 3",
    ]);
    expect(afterAccounts.map((a) => a.balance).sort()).toEqual([100, 200, 300]);
    expect(afterTxns).toHaveLength(1);
    expect(afterTxns[0].amount).toBe(25);
    // Reference unused fixtures to silence the no-unused-vars lint
    void acc2;
    void acc3;
  });
});
