import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const accounts = sqliteTable("accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  institution: text("institution").notNull().default(""),
  type: text("type").notNull(), // credit | debit | savings | wallet | cash | loan_borrowed | loan_lent | investment
  balance: real("balance").notNull().default(0),
  creditLimit: real("credit_limit"),
  currency: text("currency").notNull().default("USD"),
  color: text("color").notNull().default("#607D8B"),
  icon: text("icon").notNull().default("wallet"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  counterparty: text("counterparty"),
  interestRate: real("interest_rate"),
  dueDate: text("due_date"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
