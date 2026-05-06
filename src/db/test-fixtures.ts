// Shared test fixtures so feature branches don't reinvent baseAccount /
// freezeToday / makeLoan five different ways. Add helpers here when a pattern
// crops up in two or more test files.
//
// Note: import this only from `*.test.ts` files. It pulls in `createAccount`
// from the production query layer, which expects @/db/client to be mocked
// already (see existing test files for the jest.mock pattern).

import { createAccount } from "@/db/queries/accounts";
import type { Account, NewAccount } from "@/db/schema";

const ACCOUNT_DEFAULTS: Omit<NewAccount, "id"> = {
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

/** Create a debit account with sensible defaults; override any field. */
export function makeAccount(overrides: Partial<NewAccount> = {}): Promise<Account> {
  return createAccount({ ...ACCOUNT_DEFAULTS, ...overrides });
}

/**
 * Create a loan account with the canonical balance sign for its type:
 * - `loan_borrowed`: balance = -principal (you owe).
 * - `loan_lent`:     balance = +principal (counterparty owes you).
 *
 * Pre-fills `interestRate` and `lastInterestDate` if supplied — needed by the
 * upcoming loan-interest accrual tests so they don't have to remember the
 * sign convention each time.
 */
export function makeLoan(opts: {
  type: "loan_borrowed" | "loan_lent";
  principal: number;
  rate?: number | null;
  lastInterestDate?: string | null;
  overrides?: Partial<NewAccount>;
}): Promise<Account> {
  const principal = Math.abs(opts.principal);
  const balance = opts.type === "loan_borrowed" ? -principal : principal;
  return makeAccount({
    type: opts.type,
    balance,
    interestRate: opts.rate ?? null,
    lastInterestDate: opts.lastInterestDate ?? null,
    ...(opts.overrides ?? {}),
  });
}

/**
 * Pin `todayDateString()` (and `nowTimeString()`) to a specific value for
 * date-driven tests like recurring catchup and loan interest accrual. Requires
 * `@/utils/format` to already be mocked at the top of the test file:
 *
 *   jest.mock("@/utils/format", () => {
 *     const real = jest.requireActual("@/utils/format");
 *     return { ...real, todayDateString: jest.fn(), nowTimeString: jest.fn() };
 *   });
 *
 * Then `freezeToday("2026-01-31")` swaps in that date for the rest of the test.
 */
export function freezeToday(date: string, time = "12:00"): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const m = require("@/utils/format") as {
    todayDateString: jest.Mock;
    nowTimeString: jest.Mock;
  };
  if (typeof m.todayDateString.mockReturnValue !== "function") {
    throw new Error(
      'freezeToday: @/utils/format is not mocked. Add jest.mock("@/utils/format", ...) to your test file before calling.',
    );
  }
  m.todayDateString.mockReturnValue(date);
  m.nowTimeString.mockReturnValue(time);
}
