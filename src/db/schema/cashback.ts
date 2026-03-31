import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { accounts } from "./accounts";
import { subcategories } from "./categories";

export const cashbackRules = sqliteTable("cashback_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: integer("account_id")
    .notNull()
    .references(() => accounts.id),
  subcategoryId: integer("subcategory_id").references(() => subcategories.id),
  percentage: real("percentage").notNull(),
  monthlyCap: real("monthly_cap"),
  cashbackAccountId: integer("cashback_account_id")
    .notNull()
    .references(() => accounts.id),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export type CashbackRule = typeof cashbackRules.$inferSelect;
export type NewCashbackRule = typeof cashbackRules.$inferInsert;
