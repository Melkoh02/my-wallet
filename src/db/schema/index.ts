import { relations } from "drizzle-orm";
import { accounts } from "./accounts";
import { categories, subcategories } from "./categories";
import { transactions, transactionSubcategories } from "./transactions";
import { recurringTransactions, recurringSubcategories } from "./recurring";
import { cashbackRules } from "./cashback";

// --- Relations ---

export const accountsRelations = relations(accounts, ({ many }) => ({
  transactions: many(transactions),
  cashbackRules: many(cashbackRules),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  subcategories: many(subcategories),
}));

export const subcategoriesRelations = relations(subcategories, ({ one, many }) => ({
  category: one(categories, {
    fields: [subcategories.categoryId],
    references: [categories.id],
  }),
  transactionSubcategories: many(transactionSubcategories),
  recurringSubcategories: many(recurringSubcategories),
}));

export const transactionsRelations = relations(transactions, ({ one, many }) => ({
  account: one(accounts, {
    fields: [transactions.accountId],
    references: [accounts.id],
  }),
  subcategories: many(transactionSubcategories),
}));

export const transactionSubcategoriesRelations = relations(transactionSubcategories, ({ one }) => ({
  transaction: one(transactions, {
    fields: [transactionSubcategories.transactionId],
    references: [transactions.id],
  }),
  subcategory: one(subcategories, {
    fields: [transactionSubcategories.subcategoryId],
    references: [subcategories.id],
  }),
}));

export const recurringTransactionsRelations = relations(recurringTransactions, ({ one, many }) => ({
  account: one(accounts, {
    fields: [recurringTransactions.accountId],
    references: [accounts.id],
  }),
  subcategories: many(recurringSubcategories),
}));

export const recurringSubcategoriesRelations = relations(recurringSubcategories, ({ one }) => ({
  recurring: one(recurringTransactions, {
    fields: [recurringSubcategories.recurringId],
    references: [recurringTransactions.id],
  }),
  subcategory: one(subcategories, {
    fields: [recurringSubcategories.subcategoryId],
    references: [subcategories.id],
  }),
}));

export const cashbackRulesRelations = relations(cashbackRules, ({ one }) => ({
  account: one(accounts, {
    fields: [cashbackRules.accountId],
    references: [accounts.id],
  }),
  subcategory: one(subcategories, {
    fields: [cashbackRules.subcategoryId],
    references: [subcategories.id],
  }),
}));

// --- Re-exports ---

export { accounts, type Account, type NewAccount } from "./accounts";
export {
  categories,
  subcategories,
  type Category,
  type NewCategory,
  type Subcategory,
  type NewSubcategory,
} from "./categories";
export {
  transactions,
  transactionSubcategories,
  type Transaction,
  type NewTransaction,
  type TransactionSubcategory,
} from "./transactions";
export {
  recurringTransactions,
  recurringSubcategories,
  type RecurringTransaction,
  type NewRecurringTransaction,
} from "./recurring";
export { cashbackRules, type CashbackRule, type NewCashbackRule } from "./cashback";
export { themes, type Theme, type NewTheme } from "./themes";
export { settings, type Setting } from "./settings";
export { backups, type Backup, type NewBackup } from "./backups";
export { templates, templateSubcategories, type Template, type NewTemplate } from "./templates";
