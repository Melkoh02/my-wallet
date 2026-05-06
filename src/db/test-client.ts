// Test-only DB client. Wraps better-sqlite3 (pure Node, no native build) with
// the Drizzle adapter so DB-touching queries run identically to production
// against an in-memory SQLite. Production code keeps using @/db/client which
// wraps expo-sqlite — never import this from production code.
//
// Usage in a test file:
//
//   import { setupTestDb, resetTestDb } from "@/db/test-client";
//   beforeAll(() => setupTestDb());
//   beforeEach(() => resetTestDb());
//   import { db } from "@/db/client";  // automatically mocked, points at the test DB
//
// The @/db/client mock and the test DB share state via this module's
// `currentDb` variable, swapped each `setupTestDb()` call.

import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import migrationData from "./migrations/migrations";

type Migrations = {
  journal: { entries: { idx: number; tag: string }[] };
  migrations: Record<string, string>;
};

let currentDb: BetterSQLite3Database<typeof schema> | null = null;
let currentSqlite: Database.Database | null = null;

export function setupTestDb(): BetterSQLite3Database<typeof schema> {
  // Close any prior in-memory DB so each test file starts fresh.
  if (currentSqlite) currentSqlite.close();

  const sqlite = new Database(":memory:");
  // Mirror production: expo-sqlite leaves PRAGMA foreign_keys = OFF, and code
  // guards FK constraints in the query layer. Tests should match that
  // contract — keep FKs off so we test what we ship.
  sqlite.pragma("foreign_keys = OFF");

  const db = drizzle(sqlite, { schema });

  const data = migrationData as Migrations;
  const sortedTags = data.journal.entries
    .slice()
    .sort((a, b) => a.idx - b.idx)
    .map((e) => e.idx);

  for (const idx of sortedTags) {
    const key = `m${String(idx).padStart(4, "0")}`;
    const sql = data.migrations[key];
    if (!sql) continue;
    // Each migration may contain multiple statements separated by Drizzle's
    // statement-breakpoint marker. Apply them one at a time.
    const statements = sql.split("--> statement-breakpoint");
    for (const stmt of statements) {
      const trimmed = stmt.trim();
      if (trimmed) sqlite.exec(trimmed);
    }
  }

  currentSqlite = sqlite;
  currentDb = db;
  return db;
}

export function resetTestDb(): void {
  if (!currentSqlite) {
    setupTestDb();
    return;
  }
  // Rebuild schema rather than truncating each table — robust against
  // changes to FK relationships and avoids reset bugs from missed tables.
  currentSqlite.close();
  setupTestDb();
}

export function getTestDb(): BetterSQLite3Database<typeof schema> {
  if (!currentDb) setupTestDb();
  return currentDb!;
}
