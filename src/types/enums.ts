/* eslint-disable @typescript-eslint/no-redeclare */
export const TransactionType = {
  INCOME: "income",
  EXPENSE: "expense",
  TRANSFER: "transfer",
} as const;
export type TransactionType = (typeof TransactionType)[keyof typeof TransactionType];

export const AccountType = {
  CREDIT: "credit",
  DEBIT: "debit",
  SAVINGS: "savings",
  WALLET: "wallet",
  CASH: "cash",
  LOAN_BORROWED: "loan_borrowed",
  LOAN_LENT: "loan_lent",
  INVESTMENT: "investment",
} as const;
export type AccountType = (typeof AccountType)[keyof typeof AccountType];

export const Frequency = {
  DAILY: "daily",
  WEEKLY: "weekly",
  BIWEEKLY: "biweekly",
  MONTHLY: "monthly",
  YEARLY: "yearly",
} as const;
export type Frequency = (typeof Frequency)[keyof typeof Frequency];

export const ThemeMode = {
  LIGHT: "light",
  DARK: "dark",
} as const;
export type ThemeMode = (typeof ThemeMode)[keyof typeof ThemeMode];

export const StatusBarStyle = {
  LIGHT: "light",
  DARK: "dark",
  AUTO: "auto",
} as const;
export type StatusBarStyle = (typeof StatusBarStyle)[keyof typeof StatusBarStyle];
