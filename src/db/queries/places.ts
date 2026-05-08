import { and, between, count, desc, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { places, transactions, type NewPlace, type Place } from "@/db/schema";
import { boundingBox, haversineMeters } from "@/utils/geo";
import { convertRow } from "./convert";
import type { CurrencyConverter } from "@/services/exchangeRate.service";

export type PlaceWithStats = Place & {
  /**
   * Live count of *non-soft-deleted* transactions referencing this place via
   * `place_id`. Recomputed on read so it stays accurate even if the
   * denormalised `places.visit_count` drifts.
   */
  transactionCount: number;
};

/** Active places (`is_active = true`), most-frequent first. */
export async function getActivePlaces(): Promise<Place[]> {
  return db
    .select()
    .from(places)
    .where(eq(places.isActive, true))
    .orderBy(desc(places.visitCount), places.name);
}

/**
 * Active places joined with a live transaction count. Use for the Places list
 * screen, where we want the displayed count to match what the user sees in
 * Transactions even if they restored a backup that didn't update visit_count.
 */
export async function getPlacesWithStats(): Promise<PlaceWithStats[]> {
  const rows = await db
    .select({
      place: places,
      transactionCount: count(transactions.id),
    })
    .from(places)
    .leftJoin(transactions, eq(transactions.placeId, places.id))
    .where(eq(places.isActive, true))
    .groupBy(places.id)
    .orderBy(desc(places.visitCount), places.name);

  return rows.map((r) => ({ ...r.place, transactionCount: r.transactionCount }));
}

export async function getPlaceById(id: number): Promise<Place | undefined> {
  const [row] = await db.select().from(places).where(eq(places.id, id));
  return row;
}

export async function createPlace(data: NewPlace): Promise<Place> {
  const [row] = await db.insert(places).values(data).returning();
  return row;
}

export async function updatePlace(id: number, data: Partial<Omit<NewPlace, "id">>): Promise<void> {
  await db.update(places).set(data).where(eq(places.id, id));
}

/**
 * Soft-delete: set `is_active = false`. Existing transactions still resolve
 * the place's name via the FK; the place just disappears from pickers and
 * lists. We deliberately don't hard-delete because the FK has no
 * `ON DELETE` clause (FKs are off in expo-sqlite) and clearing place_id on
 * many rows is the user's call to make manually.
 */
export async function archivePlace(id: number): Promise<void> {
  await db.update(places).set({ isActive: false }).where(eq(places.id, id));
}

export async function unarchivePlace(id: number): Promise<void> {
  await db.update(places).set({ isActive: true }).where(eq(places.id, id));
}

/**
 * Hard-delete a place. Caller must ensure no transactions still reference it
 * (or accept that those rows' place_id becomes a dangling pointer — display
 * code handles that by falling back to legacy locationName / nothing).
 */
export async function deletePlace(id: number): Promise<void> {
  await db.delete(places).where(eq(places.id, id));
}

/**
 * Find the closest *active* place within `radiusM` metres of the given
 * coordinates. Returns null if nothing is in range.
 *
 * Two-stage filter:
 *   1. SQL bounding-box pre-filter using `idx_places_coords` — narrows the
 *      candidate set without paying the Haversine cost per row.
 *   2. JS Haversine refinement — computes true great-circle distance and
 *      picks the nearest.
 *
 * The bounding box is loose by design (computed at the centre's latitude,
 * not per-edge), but that just means a few extra candidates trickle into
 * the JS pass — never that a real match gets excluded.
 */
export async function findNearestPlace(
  lat: number,
  lng: number,
  radiusM: number,
): Promise<{ place: Place; distanceM: number } | null> {
  const box = boundingBox(lat, lng, radiusM);

  // why: when the bounding box would straddle the antimeridian (a query near
  // ±180° longitude), we drop the longitude filter and let the Haversine pass
  // do the full check. The candidate pool is already small in that case, and a
  // disjoint two-range filter complicates the query for a rare geography.
  const filters = [
    eq(places.isActive, true),
    isNotNull(places.latitude),
    isNotNull(places.longitude),
    between(places.latitude, box.latMin, box.latMax),
  ];
  if (!box.wrapsAntimeridian) {
    filters.push(between(places.longitude, box.lngMin, box.lngMax));
  }

  const candidates = await db
    .select()
    .from(places)
    .where(and(...filters));

  let best: { place: Place; distanceM: number } | null = null;
  for (const place of candidates) {
    // latitude/longitude are guaranteed non-null by the WHERE clause above.
    const d = haversineMeters(lat, lng, place.latitude as number, place.longitude as number);
    if (d <= radiusM && (best === null || d < best.distanceM)) {
      best = { place, distanceM: d };
    }
  }
  return best;
}

/**
 * Atomically increment `visit_count` for a place. Called after creating a
 * transaction whose `place_id` points here. Wrapping in a single SQL
 * statement keeps it correct under concurrent writes (which we don't have
 * yet, but the cost of being correct is zero).
 */
export async function incrementVisitCount(placeId: number): Promise<void> {
  await db
    .update(places)
    .set({ visitCount: sql`${places.visitCount} + 1` })
    .where(eq(places.id, placeId));
}

/**
 * Decrement `visit_count` (used when a transaction is deleted or its
 * place_id is cleared). Floors at 0 so a drift in the counter can't make
 * it go negative and look weird in the picker.
 */
export async function decrementVisitCount(placeId: number): Promise<void> {
  await db
    .update(places)
    .set({ visitCount: sql`MAX(0, ${places.visitCount} - 1)` })
    .where(eq(places.id, placeId));
}

/**
 * Search active places by name (case-insensitive substring match). Used by
 * the picker's search bar. Caps the result set to keep the UI responsive
 * for users with hundreds of places.
 *
 * Uses `lower()` on both sides so non-ASCII text (Japanese, Chinese, accented
 * characters) is handled the same way as ASCII — SQLite's bare LIKE is only
 * case-insensitive for ASCII. Escapes `%` and `_` so a user typing "50%" or
 * "a_b" gets a literal substring match instead of pattern matches.
 */
export async function searchPlacesByName(query: string, limit = 50): Promise<Place[]> {
  const trimmed = query.trim();
  if (!trimmed) return getActivePlaces().then((rows) => rows.slice(0, limit));

  // Escape SQL LIKE wildcards so the user's text matches literally.
  const escaped = trimmed.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
  const pattern = `%${escaped.toLowerCase()}%`;

  return db
    .select()
    .from(places)
    .where(
      and(
        eq(places.isActive, true),
        or(
          sql`lower(${places.name}) LIKE ${pattern} ESCAPE '\\'`,
          and(isNotNull(places.address), sql`lower(${places.address}) LIKE ${pattern} ESCAPE '\\'`),
        ),
      ),
    )
    .orderBy(desc(places.visitCount), places.name)
    .limit(limit);
}

/**
 * Recompute every place's `visit_count` from the live transactions table.
 * Cheap to run (one UPDATE) and useful after a backup restore where the
 * denormalised count and the actual rows might disagree.
 */
export async function recomputeAllVisitCounts(): Promise<void> {
  await db.run(sql`
    UPDATE places
    SET visit_count = (
      SELECT COUNT(*) FROM transactions WHERE transactions.place_id = places.id
    )
  `);
}

// --- Spending heatmap ----------------------------------------------------

/**
 * GeoJSON Point feature with the heatmap weight + a name for tooltip use.
 * Coordinates follow GeoJSON convention: [longitude, latitude].
 */
export type HeatmapFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: { weight: number; name: string; placeId: number };
};

export type HeatmapFeatureCollection = {
  type: "FeatureCollection";
  features: HeatmapFeature[];
};

export type HeatmapMetric = "count" | "amount";

export type PlacesHeatmapData = {
  geojson: HeatmapFeatureCollection;
  /** True when at least one row needed today's rate to convert (display "≈"). */
  approximate: boolean;
  /** Source currencies whose rate couldn't be resolved — those rows were dropped. */
  missingRates: string[];
  /**
   * Number of expense transactions that could not be plotted because they
   * pointed at a place with no coords (or no place at all). UI surfaces this
   * as "X transactions excluded — they have no map location."
   */
  excludedTransactionCount: number;
};

/**
 * Build a GeoJSON feature collection of places weighted by either visit
 * count or total expense amount in the user's display currency. Designed to
 * feed a MapLibre `<HeatmapLayer>` directly via `[\"get\", \"weight\"]`.
 *
 * Filters:
 *   - Only places with non-null coords (heatmap has no representation for
 *     coord-less places — those are reported via `excludedTransactionCount`).
 *   - Includes archived places too: archive only affects the picker; analytics
 *     should reflect the full spending history.
 *   - Counts/sums **expense** transactions only — income (refunds, salary
 *     deposits) doesn't represent "where the user spent".
 *
 * Currency handling for `metric: "amount"` mirrors the existing aggregate
 * pattern in `getMonthSummary` / `getCategorySummary`: stored
 * `rateToDisplay` honoured when stable, today's rate substituted when
 * stale (sets `approximate: true`), row excluded entirely when no rate is
 * available (source currency added to `missingRates`).
 */
export async function getPlacesAsGeoJSON(
  metric: HeatmapMetric,
  converter: CurrencyConverter,
): Promise<PlacesHeatmapData> {
  // Pull every expense transaction with its currency snapshot + the linked
  // place's coords + name. A LEFT JOIN here would let us count "excluded"
  // unplotted rows; INNER JOIN is fine because we report excluded count
  // separately via a follow-up cheap COUNT(*) — keeps this query small.
  const plottable = await db
    .select({
      placeId: places.id,
      placeName: places.name,
      latitude: places.latitude,
      longitude: places.longitude,
      amount: transactions.amount,
      currency: transactions.currency,
      rateToDisplay: transactions.rateToDisplay,
      displayCurrencySnapshot: transactions.displayCurrencySnapshot,
    })
    .from(transactions)
    .innerJoin(places, eq(transactions.placeId, places.id))
    .where(
      and(
        eq(transactions.type, "expense"),
        isNotNull(places.latitude),
        isNotNull(places.longitude),
      ),
    );

  type Acc = { name: string; lat: number; lng: number; weight: number };
  const byPlace = new Map<number, Acc>();
  const missing = new Set<string>();
  let approximate = false;

  for (const row of plottable) {
    let contribution: number;
    if (metric === "count") {
      contribution = 1;
    } else {
      const result = convertRow(
        {
          amount: row.amount,
          currency: row.currency,
          rateToDisplay: row.rateToDisplay,
          displayCurrencySnapshot: row.displayCurrencySnapshot,
        },
        converter,
      );
      if (result.state === "excluded") {
        if (result.currency) missing.add(result.currency);
        continue;
      }
      if (result.usedTodaysRate) approximate = true;
      contribution = result.value;
    }
    const existing = byPlace.get(row.placeId);
    if (existing) {
      existing.weight += contribution;
    } else {
      byPlace.set(row.placeId, {
        name: row.placeName,
        lat: row.latitude as number,
        lng: row.longitude as number,
        weight: contribution,
      });
    }
  }

  const features: HeatmapFeature[] = [];
  for (const [placeId, acc] of byPlace) {
    if (acc.weight <= 0) continue; // skip zero-weight points (no rendering value)
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [acc.lng, acc.lat] },
      properties: { weight: acc.weight, name: acc.name, placeId },
    });
  }

  // Cheap follow-up: how many expense transactions couldn't be plotted? A
  // row is "excluded" if its place has no coords OR it has no place at all.
  // This is purely UI footnote material — the heatmap doesn't depend on it.
  const [excluded] = await db
    .select({ c: count(transactions.id) })
    .from(transactions)
    .leftJoin(places, eq(transactions.placeId, places.id))
    .where(
      and(
        eq(transactions.type, "expense"),
        or(isNull(transactions.placeId), isNull(places.latitude)),
      ),
    );

  return {
    geojson: { type: "FeatureCollection", features },
    approximate,
    missingRates: [...missing],
    excludedTransactionCount: excluded?.c ?? 0,
  };
}
