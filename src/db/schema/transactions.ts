import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { accounts } from "./accounts";
import { subcategories } from "./categories";

export const transactions = sqliteTable(
  "transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type").notNull(), // income | expense | transfer
    amount: real("amount").notNull(),
    description: text("description").notNull().default(""),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id),
    toAccountId: integer("to_account_id").references(() => accounts.id),
    date: text("date").notNull(), // YYYY-MM-DD
    time: text("time").notNull(), // HH:mm
    latitude: real("latitude"),
    longitude: real("longitude"),
    locationName: text("location_name"),
    contactId: text("contact_id"),
    contactName: text("contact_name"),
    cashbackAmount: real("cashback_amount"),
    cashbackAccountId: integer("cashback_account_id").references(() => accounts.id),
    linkedTransactionId: integer("linked_transaction_id"),
    notes: text("notes"),
    recurringId: integer("recurring_id"),
    // Currency snapshot at insert time. Backfilled from account.currency for
    // pre-Phase-2 rows. New rows always set this.
    currency: text("currency"),
    // Multiplier from `currency` to display currency at insert time.
    // amountInDisplay = amount * rateToDisplay. NULL on pre-Phase-2 rows
    // (caller falls back to today's rate with an ≈ marker).
    rateToDisplay: real("rate_to_display"),
    // Display currency at the moment `rateToDisplay` was captured. Lets
    // queries detect that the user has changed display currency since insert
    // and the stored rate is no longer applicable.
    displayCurrencySnapshot: text("display_currency_snapshot"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_transactions_date").on(table.date),
    index("idx_transactions_account").on(table.accountId),
    index("idx_transactions_type").on(table.type),
    index("idx_transactions_contact").on(table.contactId),
    index("idx_transactions_recurring").on(table.recurringId),
  ],
);

export const transactionSubcategories = sqliteTable(
  "transaction_subcategories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    transactionId: integer("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    subcategoryId: integer("subcategory_id")
      .notNull()
      .references(() => subcategories.id),
  },
  (table) => [uniqueIndex("idx_txn_sub_unique").on(table.transactionId, table.subcategoryId)],
);

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type TransactionSubcategory = typeof transactionSubcategories.$inferSelect;
