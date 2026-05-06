import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const places = sqliteTable(
  "places",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    // Coords are nullable: free-typed places ("just a name") have no GPS until
    // the user adds them. Place auto-pick only considers places with coords.
    latitude: real("latitude"),
    longitude: real("longitude"),
    // Reverse-geocoded address when we have one, otherwise null. Display-only.
    address: text("address"),
    // 'manual'   = user typed a name (may have no coords)
    // 'geocoded' = picked from current GPS or address lookup
    // 'migrated' = imported from legacy transactions.locationName during the
    //              one-time migration on first launch of v2.0
    source: text("source").notNull().default("manual"),
    // Denormalised count of transactions linked via transactions.place_id.
    // Updated when transactions are created/deleted; recomputed by the
    // migration. Drives "Frequents" sort order in the picker.
    visitCount: integer("visit_count").notNull().default(0),
    // Soft-delete flag. Places referenced by transactions stay in the DB
    // (so the transactions still resolve a name) but get hidden from the
    // picker and Places list.
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  // Pre-filter index for the bounding-box step of find-nearest.
  (table) => [index("idx_places_coords").on(table.latitude, table.longitude)],
);

export type Place = typeof places.$inferSelect;
export type NewPlace = typeof places.$inferInsert;
