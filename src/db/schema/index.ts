import { relations } from "drizzle-orm";
import { accounts } from "./accounts";
import { categories, subcategories } from "./categories";
import { transactions, transactionSubcategories } from "./transactions";
import { recurringTransactions, recurringSubcategories } from "./recurring";
import { budgets } from "./budgets";
import { places } from "./places";

// --- Relations ---

export const accountsRelations = relations(accounts, ({ many }) => ({
  transactions: many(transactions),
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
  budgets: many(budgets),
}));

export const budgetsRelations = relations(budgets, ({ one }) => ({
  category: one(categories, {
    fields: [budgets.categoryId],
    references: [categories.id],
  }),
  subcategory: one(subcategories, {
    fields: [budgets.subcategoryId],
    references: [subcategories.id],
  }),
}));

export const transactionsRelations = relations(transactions, ({ one, many }) => ({
  account: one(accounts, {
    fields: [transactions.accountId],
    references: [accounts.id],
  }),
  place: one(places, {
    fields: [transactions.placeId],
    references: [places.id],
  }),
  subcategories: many(transactionSubcategories),
}));

export const placesRelations = relations(places, ({ many }) => ({
  transactions: many(transactions),
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
export { themes, type Theme, type NewTheme } from "./themes";
export { settings, type Setting } from "./settings";
export { backups, type Backup, type NewBackup } from "./backups";
export { templates, templateSubcategories, type Template, type NewTemplate } from "./templates";
export { budgets, type Budget, type NewBudget } from "./budgets";
export { places, type Place, type NewPlace } from "./places";
