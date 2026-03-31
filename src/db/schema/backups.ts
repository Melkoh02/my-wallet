import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const backups = sqliteTable("backups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  filename: text("filename").notNull(),
  filePath: text("file_path").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  isAuto: integer("is_auto", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export type Backup = typeof backups.$inferSelect;
export type NewBackup = typeof backups.$inferInsert;
