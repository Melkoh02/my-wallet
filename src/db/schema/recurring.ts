import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { accounts } from "./accounts";
import { subcategories } from "./categories";

export const recurringTransactions = sqliteTable(
  "recurring_transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type").notNull(), // income | expense
    amount: real("amount").notNull(),
    description: text("description").notNull(),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id),
    frequency: text("frequency").notNull(), // daily | weekly | biweekly | monthly | yearly
    nextDate: text("next_date").notNull(),
    endDate: text("end_date"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    contactId: text("contact_id"),
    contactName: text("contact_name"),
    cashbackAmount: real("cashback_amount"),
    cashbackAccountId: integer("cashback_account_id").references(() => accounts.id),
    dayOfMonth: integer("day_of_month"),
    dayOfWeek: integer("day_of_week"),
    timeOfDay: text("time_of_day"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [index("idx_recurring_next_date").on(table.nextDate, table.isActive)],
);

export const recurringSubcategories = sqliteTable(
  "recurring_subcategories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    recurringId: integer("recurring_id")
      .notNull()
      .references(() => recurringTransactions.id, { onDelete: "cascade" }),
    subcategoryId: integer("subcategory_id")
      .notNull()
      .references(() => subcategories.id),
  },
  (table) => [uniqueIndex("idx_rec_sub_unique").on(table.recurringId, table.subcategoryId)],
);

export type RecurringTransaction = typeof recurringTransactions.$inferSelect;
export type NewRecurringTransaction = typeof recurringTransactions.$inferInsert;
