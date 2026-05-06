/**
 * Great-circle distance between two GPS points using the Haversine formula.
 * Mean Earth radius (R = 6371008.8 m) gives accuracy within ~0.5% globally,
 * which is well below the precision of any consumer GPS chip and far below
 * the smallest "auto-pick a nearby place" radius we care about (50–500 m).
 *
 * Returns distance in metres. Pure function — no allocations, no side effects.
 */
const EARTH_RADIUS_M = 6_371_008.8;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/**
 * Bounding box around a centre point that contains every point within
 * `radiusM` metres. Used to pre-filter SQL queries (`WHERE lat BETWEEN ... AND
 * lng BETWEEN ...`) before doing the per-row Haversine refinement — avoids a
 * full table scan when the user has lots of places.
 *
 * The expansion is deliberately a touch loose (computes lat/lng deltas at the
 * centre's latitude and uses them at both edges); for radii under ~5 km the
 * approximation introduces well under 1% slack, which is fine for a pre-filter.
 *
 * `wrapsAntimeridian` flags the rare case where the centre is close to ±180°
 * and the box would otherwise need two disjoint longitude ranges. Callers can
 * see that flag and skip the longitude pre-filter (letting the Haversine pass
 * see every row in the candidate latitude band). Same for the poles, where the
 * latitude clamp keeps the box geometrically valid.
 */
export function boundingBox(
  lat: number,
  lng: number,
  radiusM: number,
): {
  latMin: number;
  latMax: number;
  lngMin: number;
  lngMax: number;
  wrapsAntimeridian: boolean;
} {
  const latDelta = (radiusM / EARTH_RADIUS_M) * (180 / Math.PI);
  // longitude degrees shrink as latitude approaches the poles.
  const cosLat = Math.cos(toRad(lat));
  const lngDelta = cosLat < 1e-9 ? 180 : (radiusM / (EARTH_RADIUS_M * cosLat)) * (180 / Math.PI);
  const lngMin = lng - lngDelta;
  const lngMax = lng + lngDelta;
  const wrapsAntimeridian = lngMin < -180 || lngMax > 180;
  return {
    latMin: Math.max(-90, lat - latDelta),
    latMax: Math.min(90, lat + latDelta),
    lngMin,
    lngMax,
    wrapsAntimeridian,
  };
}
