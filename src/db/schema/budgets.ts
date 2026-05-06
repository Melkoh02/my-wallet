import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { categories, subcategories } from "./categories";

export const budgets = sqliteTable(
  "budgets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id),
    // Optional: when set, the budget tracks only transactions tagged with
    // this specific subcategory. When null, the budget covers all
    // subcategories of `categoryId`.
    subcategoryId: integer("subcategory_id").references(() => subcategories.id),
    amount: real("amount").notNull(),
    // Currency contract:
    //   - NULL  ⇒ "follow display currency" — spend computed against today's
    //             display currency. Switching display ccy changes the
    //             interpretation of `amount` for this budget.
    //   - SET   ⇒ "pinned" to this currency code (e.g. "USD"). `amount` is
    //             always in that currency; spend converts transactions into
    //             this currency for the comparison.
    currency: text("currency"),
    // 'monthly' is the only period in v2.0. Reserved for future expansion
    // ('weekly' | 'yearly'). Stored as text so additions don't need a
    // schema migration.
    period: text("period").notNull().default("monthly"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [index("idx_budgets_category").on(table.categoryId)],
);

export type Budget = typeof budgets.$inferSelect;
export type NewBudget = typeof budgets.$inferInsert;
