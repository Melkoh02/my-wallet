// Recurring catchup + rate-stamping + end-date enforcement.

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

jest.mock("@/services/exchangeRate.service", () => ({
  captureRateForCurrency: jest.fn(async () => ({
    rateToDisplay: 1,
    displayCurrency: "USD",
  })),
}));

// todayDateString is imported from utils/format inside recurring.ts. Override
// it to a fixed date so catchup tests are deterministic.
jest.mock("@/utils/format", () => {
  const real = jest.requireActual("@/utils/format");
  return {
    ...real,
    todayDateString: jest.fn(() => "2026-01-31"),
    nowTimeString: jest.fn(() => "12:00"),
  };
});

import { createRecurring, processDueRecurring } from "./recurring";
import { createAccount } from "./accounts";
import { recurringTransactions, transactions } from "@/db/schema";
import { eq } from "drizzle-orm";
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

describe("processDueRecurring — catchup", () => {
  it("creates one transaction when nextDate is today", async () => {
    const acc = await createAccount({ ...baseAccount, balance: 1000 });
    await createRecurring(
      {
        type: "expense",
        amount: 100,
        description: "rent",
        accountId: acc.id,
        frequency: "monthly",
        nextDate: "2026-01-31", // matches mocked today
      },
      [],
    );

    const count = await processDueRecurring();
    expect(count).toBe(1);

    const db = getTestDb();
    const rows = await db.select().from(transactions);
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe("2026-01-31");
  });

  it("creates multiple transactions for catchup gaps under the cap", async () => {
    const acc = await createAccount({ ...baseAccount, balance: 10000 });
    await createRecurring(
      {
        type: "expense",
        amount: 50,
        description: "weekly",
        accountId: acc.id,
        frequency: "weekly",
        nextDate: "2026-01-10", // 3 weeks before today (2026-01-31)
      },
      [],
    );

    const count = await processDueRecurring();
    // Jan 10, 17, 24, 31 — four occurrences before/at "today"
    expect(count).toBe(4);
  });

  it("caps catchup at MAX_CATCHUP_DAYS (90) — creates only one when gap > 90", async () => {
    const acc = await createAccount({ ...baseAccount, balance: 10000 });
    await createRecurring(
      {
        type: "expense",
        amount: 50,
        description: "ancient",
        accountId: acc.id,
        frequency: "daily",
        nextDate: "2025-09-01", // ~5 months before today; way over the 90d cap
      },
      [],
    );

    const count = await processDueRecurring();
    expect(count).toBe(1);

    const db = getTestDb();
    const rows = await db.select().from(transactions);
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe("2026-01-31"); // dated today, not the original nextDate
  });

  it("advances nextDate past today after catchup", async () => {
    const acc = await createAccount({ ...baseAccount, balance: 10000 });
    const created = await createRecurring(
      {
        type: "expense",
        amount: 50,
        description: "x",
        accountId: acc.id,
        frequency: "monthly",
        nextDate: "2026-01-15",
      },
      [],
    );

    await processDueRecurring();

    const db = getTestDb();
    const [updated] = await db
      .select()
      .from(recurringTransactions)
      .where(eq(recurringTransactions.id, created.id));
    // Started at 2026-01-15, monthly. After processing through 2026-01-31:
    // Jan 15 was created → next = Feb 15. Feb 15 > today, loop exits.
    expect(updated.nextDate).toBe("2026-02-15");
  });

  it("deactivates the rule when next computed date passes endDate", async () => {
    const acc = await createAccount({ ...baseAccount, balance: 10000 });
    const created = await createRecurring(
      {
        type: "expense",
        amount: 50,
        description: "ends-soon",
        accountId: acc.id,
        frequency: "monthly",
        nextDate: "2026-01-15",
        endDate: "2026-01-31", // ends right at "today"
      },
      [],
    );

    await processDueRecurring();

    const db = getTestDb();
    const [updated] = await db
      .select()
      .from(recurringTransactions)
      .where(eq(recurringTransactions.id, created.id));
    // After firing Jan 15, next = Feb 15. Feb 15 > Jan 31 endDate → deactivate.
    expect(updated.isActive).toBe(false);
  });

  it("skips inactive rules", async () => {
    const acc = await createAccount({ ...baseAccount, balance: 10000 });
    const created = await createRecurring(
      {
        type: "expense",
        amount: 50,
        description: "paused",
        accountId: acc.id,
        frequency: "daily",
        nextDate: "2026-01-15",
      },
      [],
    );
    // Manually deactivate
    const db = getTestDb();
    await db
      .update(recurringTransactions)
      .set({ isActive: false })
      .where(eq(recurringTransactions.id, created.id));

    const count = await processDueRecurring();
    expect(count).toBe(0);
    const rows = await db.select().from(transactions);
    expect(rows).toHaveLength(0);
  });
});

describe("processDueRecurring — rate stamping", () => {
  it("stamps captured rate ONLY on the row dated today; backdated rows leave NULL", async () => {
    const acc = await createAccount({ ...baseAccount, balance: 10000, currency: "EUR" });
    await createRecurring(
      {
        type: "expense",
        amount: 50,
        description: "x",
        accountId: acc.id,
        frequency: "weekly",
        nextDate: "2026-01-10", // backdated; today is 2026-01-31
      },
      [],
    );

    await processDueRecurring();

    const db = getTestDb();
    const rows = await db.select().from(transactions);
    // Should be 4 transactions; only the one dated 2026-01-31 has a stamped rate.
    const today = rows.find((r) => r.date === "2026-01-31");
    const backdated = rows.filter((r) => r.date !== "2026-01-31");
    expect(today?.rateToDisplay).toBe(1);
    expect(today?.displayCurrencySnapshot).toBe("USD");
    for (const row of backdated) {
      expect(row.rateToDisplay).toBeNull();
      expect(row.displayCurrencySnapshot).toBeNull();
    }
    // currency itself is stamped on every row (it's the recurring item's
    // currency, not the rate snapshot).
    for (const row of rows) {
      expect(row.currency).toBe("EUR");
    }
  });
});

describe("processDueRecurring — balance updates", () => {
  it("applies each generated transaction's effect to the account balance", async () => {
    const acc = await createAccount({ ...baseAccount, balance: 1000 });
    await createRecurring(
      {
        type: "expense",
        amount: 75,
        description: "weekly",
        accountId: acc.id,
        frequency: "weekly",
        nextDate: "2026-01-10",
      },
      [],
    );

    await processDueRecurring();

    // 4 expenses of 75 = 300 total deduction.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getAccountById } = require("./accounts");
    const updated = await getAccountById(acc.id);
    expect(updated?.balance).toBe(700);
  });
});
