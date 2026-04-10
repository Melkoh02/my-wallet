import { sqliteTable, text, integer, real, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { accounts } from "./accounts";
import { subcategories } from "./categories";

export const templates = sqliteTable("templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  icon: text("icon").notNull().default("file-document"),
  type: text("type").notNull(), // income | expense | transfer
  amount: real("amount").notNull().default(0),
  description: text("description").notNull().default(""),
  accountId: integer("account_id").references(() => accounts.id),
  toAccountId: integer("to_account_id").references(() => accounts.id),
  contactId: text("contact_id"),
  contactName: text("contact_name"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const templateSubcategories = sqliteTable(
  "template_subcategories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    templateId: integer("template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    subcategoryId: integer("subcategory_id")
      .notNull()
      .references(() => subcategories.id),
  },
  (table) => [uniqueIndex("idx_tpl_sub_unique").on(table.templateId, table.subcategoryId)],
);

export type Template = typeof templates.$inferSelect;
export type NewTemplate = typeof templates.$inferInsert;
