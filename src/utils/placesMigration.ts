/**
 * Heuristic for grouping legacy `transactions.{latitude,longitude,locationName}`
 * rows into Place records during the one-time v2.0 backfill.
 *
 * The principle is "over-split rather than over-merge": users can manually
 * merge two places that should be one (rename + reassign), but a wrong merge
 * silently corrupts visit counts and is much harder to recover from.
 *
 * Bucket key strategy:
 *   - rows with coords           → "C:<roundedLat>:<roundedLng>:<name>"
 *                                  rounded to 4 decimals (~11 m at the equator);
 *                                  name is part of the key so two visits to the
 *                                  same address with different labels stay split.
 *   - rows with name only        → "N:<lowercased name>"
 *                                  case-insensitive so "Starbucks" and
 *                                  "starbucks" merge.
 *   - rows with neither          → skipped.
 *
 * Pure function: no DB access, no allocations beyond the result map. Lives in
 * utils/ so the migration code in DatabaseProvider can stay thin and the
 * heuristic can be unit-tested against synthetic inputs.
 */

export type LegacyLocationRow = {
  id: number;
  latitude: number | null;
  longitude: number | null;
  locationName: string | null;
};

export type PlaceBucket = {
  name: string;
  latitude: number | null;
  longitude: number | null;
  transactionIds: number[];
};

const COORD_PRECISION = 4; // ~11 m at the equator

function round(n: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}

export function bucketLegacyLocations(rows: LegacyLocationRow[]): PlaceBucket[] {
  const buckets = new Map<string, PlaceBucket>();

  for (const row of rows) {
    const name = row.locationName?.trim() ?? "";
    const hasCoords = row.latitude !== null && row.longitude !== null;

    let key: string;
    let bucketName: string;
    let bucketLat: number | null;
    let bucketLng: number | null;

    if (hasCoords) {
      const rLat = round(row.latitude as number, COORD_PRECISION);
      const rLng = round(row.longitude as number, COORD_PRECISION);
      // Name is part of the key — same coords + different labels stay split.
      key = `C:${rLat}:${rLng}:${name.toLowerCase()}`;
      bucketName = name || `${rLat.toFixed(4)}, ${rLng.toFixed(4)}`;
      // Use the *first row's* coords (not the rounded key coords) so the
      // resulting place has higher-precision coords than the key suggests.
      bucketLat = row.latitude;
      bucketLng = row.longitude;
    } else if (name) {
      key = `N:${name.toLowerCase()}`;
      bucketName = name;
      bucketLat = null;
      bucketLng = null;
    } else {
      // No location data at all — skip. The caller filters these out too,
      // but defending against accidental inclusion keeps the function safe
      // to feed any row set.
      continue;
    }

    const existing = buckets.get(key);
    if (existing) {
      existing.transactionIds.push(row.id);
    } else {
      buckets.set(key, {
        name: bucketName,
        latitude: bucketLat,
        longitude: bucketLng,
        transactionIds: [row.id],
      });
    }
  }

  return Array.from(buckets.values());
}
