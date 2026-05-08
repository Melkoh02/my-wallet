/* eslint-disable import/first */
import { setupTestDb, resetTestDb, getTestDb } from "@/db/test-client";

jest.mock("@/db/client", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getTestDb } = require("@/db/test-client");
  return {
    get db() {
      return getTestDb();
    },
  };
});

// Display = USD; rates relative to display: 1 EUR = 1.10 USD, 1 GBP = 1.30 USD.
// Tests that simulate "missing rate" use a currency outside this map (XYZ).
const FAKE_DISPLAY = "USD";
const FAKE_RATES: Record<string, number> = { USD: 1, EUR: 1 / 1.1, GBP: 1 / 1.3 };
const fakeConverter = {
  displayCurrency: FAKE_DISPLAY,
  convert(amount: number, fromCurrency: string) {
    if (fromCurrency === FAKE_DISPLAY) return amount;
    const rate = FAKE_RATES[fromCurrency];
    if (!rate || rate === 0) return amount;
    return amount / rate;
  },
  hasRateFor(fromCurrency: string) {
    if (fromCurrency === FAKE_DISPLAY) return true;
    const rate = FAKE_RATES[fromCurrency];
    return !!rate && rate !== 0;
  },
};

import {
  archivePlace,
  createPlace,
  decrementVisitCount,
  deletePlace,
  findNearestPlace,
  getActivePlaces,
  getPlaceById,
  getPlacesAsGeoJSON,
  getPlacesWithStats,
  incrementVisitCount,
  recomputeAllVisitCounts,
  searchPlacesByName,
  unarchivePlace,
  updatePlace,
} from "./places";
import { transactions } from "@/db/schema";
import { makeAccount } from "@/db/test-fixtures";
import { sql } from "drizzle-orm";
import type { Account } from "@/db/schema";

beforeAll(() => setupTestDb());
beforeEach(() => {
  resetTestDb();
});

let account: Account;

async function makeTxnLinkedTo(placeId: number | null = null) {
  const db = getTestDb();
  if (!account) account = await makeAccount();
  const [row] = await db
    .insert(transactions)
    .values({
      type: "expense",
      amount: 10,
      accountId: account.id,
      date: "2026-01-01",
      time: "12:00",
      currency: account.currency,
      placeId,
    })
    .returning();
  return row;
}

describe("places CRUD", () => {
  beforeEach(async () => {
    account = await makeAccount();
  });

  it("creates and retrieves a place", async () => {
    const created = await createPlace({
      name: "Home",
      latitude: 37.7749,
      longitude: -122.4194,
      source: "manual",
    });
    const fetched = await getPlaceById(created.id);
    expect(fetched?.name).toBe("Home");
    expect(fetched?.isActive).toBe(true);
    expect(fetched?.visitCount).toBe(0);
  });

  it("lists active places ordered by visit count then name", async () => {
    const a = await createPlace({ name: "Cafe", source: "manual", visitCount: 1 });
    await createPlace({ name: "Restaurant", source: "manual", visitCount: 5 });
    await createPlace({ name: "Hotel", source: "manual", visitCount: 5 });
    await archivePlace(a.id); // hidden from active list

    const active = await getActivePlaces();
    expect(active.map((p) => p.name)).toEqual(["Hotel", "Restaurant"]);
  });

  it("updates a place", async () => {
    const p = await createPlace({ name: "Old", source: "manual" });
    await updatePlace(p.id, { name: "New", address: "123 Main St" });
    const fetched = await getPlaceById(p.id);
    expect(fetched?.name).toBe("New");
    expect(fetched?.address).toBe("123 Main St");
  });

  it("archives + unarchives", async () => {
    const p = await createPlace({ name: "X", source: "manual" });
    await archivePlace(p.id);
    expect((await getPlaceById(p.id))?.isActive).toBe(false);
    expect(await getActivePlaces()).toHaveLength(0);
    await unarchivePlace(p.id);
    expect((await getPlaceById(p.id))?.isActive).toBe(true);
  });

  it("hard-deletes a place", async () => {
    const p = await createPlace({ name: "Goner", source: "manual" });
    await deletePlace(p.id);
    expect(await getPlaceById(p.id)).toBeUndefined();
  });
});

describe("findNearestPlace", () => {
  beforeEach(async () => {
    account = await makeAccount();
  });

  it("returns null when nothing is in range", async () => {
    await createPlace({ name: "Far", latitude: 40, longitude: -74, source: "manual" });
    const hit = await findNearestPlace(37.7749, -122.4194, 100);
    expect(hit).toBeNull();
  });

  it("finds an exact-coords match within radius", async () => {
    const home = await createPlace({
      name: "Home",
      latitude: 37.7749,
      longitude: -122.4194,
      source: "manual",
    });
    const hit = await findNearestPlace(37.7749, -122.4194, 100);
    expect(hit?.place.id).toBe(home.id);
    expect(hit?.distanceM).toBeCloseTo(0, 3);
  });

  it("picks the closest place when multiple are in range", async () => {
    const near = await createPlace({
      name: "Near",
      latitude: 37.7749,
      longitude: -122.4194,
      source: "manual",
    });
    await createPlace({
      name: "Farther",
      // ~88 m east of `Near` (still inside a 100 m radius from the centre)
      latitude: 37.7749,
      longitude: -122.4184,
      source: "manual",
    });
    const hit = await findNearestPlace(37.7749, -122.4194, 200);
    expect(hit?.place.id).toBe(near.id);
  });

  it("ignores archived (soft-deleted) places", async () => {
    const archived = await createPlace({
      name: "Archived",
      latitude: 37.7749,
      longitude: -122.4194,
      source: "manual",
    });
    await archivePlace(archived.id);
    const hit = await findNearestPlace(37.7749, -122.4194, 100);
    expect(hit).toBeNull();
  });

  it("ignores places without coords (name-only)", async () => {
    await createPlace({ name: "Nameless", source: "manual" }); // no lat/lng
    const hit = await findNearestPlace(37.7749, -122.4194, 100);
    expect(hit).toBeNull();
  });

  it("matches across the antimeridian (Fiji at lng ≈ 178°)", async () => {
    // Place at lng = -179.9° (just east of the dateline). Query at lng =
    // 179.9° (just west of the dateline). Real-world distance is ~22 km;
    // a naive bounding-box filter would never let the candidate through.
    const place = await createPlace({
      name: "Across the line",
      latitude: -17.7,
      longitude: -179.9,
      source: "manual",
    });
    const hit = await findNearestPlace(-17.7, 179.9, 50000); // 50 km
    expect(hit?.place.id).toBe(place.id);
  });

  it("respects the radius boundary (point just outside is rejected)", async () => {
    // Place ~150 m from query point.
    await createPlace({
      name: "Edge",
      latitude: 37.7749,
      longitude: -122.4194,
      source: "manual",
    });
    // Query 200 m away — outside 100 m radius.
    const hit = await findNearestPlace(37.7765, -122.4194, 100);
    expect(hit).toBeNull();
  });
});

describe("visit count maintenance", () => {
  it("increments and decrements", async () => {
    const p = await createPlace({ name: "X", source: "manual" });
    await incrementVisitCount(p.id);
    await incrementVisitCount(p.id);
    expect((await getPlaceById(p.id))?.visitCount).toBe(2);
    await decrementVisitCount(p.id);
    expect((await getPlaceById(p.id))?.visitCount).toBe(1);
  });

  it("decrement floors at 0", async () => {
    const p = await createPlace({ name: "X", source: "manual" });
    await decrementVisitCount(p.id);
    await decrementVisitCount(p.id);
    expect((await getPlaceById(p.id))?.visitCount).toBe(0);
  });

  it("recomputeAllVisitCounts realigns with live transactions", async () => {
    account = await makeAccount();
    const p = await createPlace({ name: "Y", source: "manual", visitCount: 99 });
    await makeTxnLinkedTo(p.id);
    await makeTxnLinkedTo(p.id);

    await recomputeAllVisitCounts();

    expect((await getPlaceById(p.id))?.visitCount).toBe(2);
  });
});

describe("getPlacesWithStats", () => {
  it("includes a live transaction count", async () => {
    account = await makeAccount();
    const p = await createPlace({ name: "Z", source: "manual" });
    await makeTxnLinkedTo(p.id);
    await makeTxnLinkedTo(p.id);
    await makeTxnLinkedTo(null); // unrelated row

    const rows = await getPlacesWithStats();
    expect(rows).toHaveLength(1);
    expect(rows[0].transactionCount).toBe(2);
  });
});

describe("searchPlacesByName", () => {
  beforeEach(async () => {
    await createPlace({ name: "Starbucks Mission", source: "manual", visitCount: 3 });
    await createPlace({ name: "Starbucks Castro", source: "manual", visitCount: 1 });
    await createPlace({
      name: "Blue Bottle",
      source: "manual",
      address: "Mission St",
      visitCount: 5,
    });
    await createPlace({ name: "Empty Search Result", source: "manual", visitCount: 0 });
  });

  it("matches by name substring (case-insensitive)", async () => {
    const rows = await searchPlacesByName("starbucks");
    expect(rows.map((r) => r.name).sort()).toEqual(["Starbucks Castro", "Starbucks Mission"]);
  });

  it("matches by address substring", async () => {
    const rows = await searchPlacesByName("Mission");
    const names = rows.map((r) => r.name);
    expect(names).toContain("Blue Bottle");
    expect(names).toContain("Starbucks Mission");
  });

  it("returns all active places (sorted) when query is empty", async () => {
    const rows = await searchPlacesByName("");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].visitCount).toBeGreaterThanOrEqual(rows[rows.length - 1].visitCount);
  });

  it("respects the result limit", async () => {
    const rows = await searchPlacesByName("", 2);
    expect(rows).toHaveLength(2);
  });

  it("treats LIKE wildcards as literal characters", async () => {
    // A place whose name contains a literal "%" — a naive LIKE without
    // ESCAPE would treat "%" as a wildcard and match everything else too.
    await createPlace({ name: "Sale 50% Off", source: "manual" });
    const rows = await searchPlacesByName("50%");
    expect(rows.map((r) => r.name)).toEqual(["Sale 50% Off"]);
  });

  it("matches non-ASCII text case-insensitively", async () => {
    await createPlace({ name: "Café Münich", source: "manual" });
    const rows = await searchPlacesByName("café");
    expect(rows.map((r) => r.name)).toContain("Café Münich");
  });
});

// Sanity: ensure the migration index exists. If a future schema change drops it,
// findNearestPlace silently slows down — this catches that at test time.
test("idx_places_coords exists", async () => {
  const db = getTestDb();
  const rows = await db.all(
    sql`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_places_coords'`,
  );
  expect(rows).toHaveLength(1);
});

describe("getPlacesAsGeoJSON", () => {
  // Helper: insert an expense transaction at the given place with overrides.
  async function insertExpense(
    placeId: number | null,
    amount: number,
    currency: string,
    rateToDisplay: number | null,
    displayCurrencySnapshot: string | null,
  ) {
    const db = getTestDb();
    if (!account) account = await makeAccount();
    await db.insert(transactions).values({
      type: "expense",
      amount,
      accountId: account.id,
      date: "2026-01-01",
      time: "12:00",
      currency,
      rateToDisplay,
      displayCurrencySnapshot,
      placeId,
    });
  }

  beforeEach(async () => {
    account = await makeAccount();
  });

  it("returns an empty FeatureCollection when there are no plottable expenses", async () => {
    const result = await getPlacesAsGeoJSON("amount", fakeConverter);
    expect(result.geojson.features).toHaveLength(0);
    expect(result.approximate).toBe(false);
    expect(result.missingRates).toEqual([]);
    expect(result.excludedTransactionCount).toBe(0);
  });

  it("count metric: emits one feature per place with weight = expense count", async () => {
    const home = await createPlace({
      name: "Home",
      latitude: 37.7749,
      longitude: -122.4194,
      source: "manual",
    });
    const cafe = await createPlace({
      name: "Cafe",
      latitude: 37.78,
      longitude: -122.42,
      source: "manual",
    });
    await insertExpense(home.id, 10, "USD", 1, "USD");
    await insertExpense(home.id, 20, "USD", 1, "USD");
    await insertExpense(cafe.id, 7, "USD", 1, "USD");

    const result = await getPlacesAsGeoJSON("count", fakeConverter);
    expect(result.geojson.features).toHaveLength(2);
    const homeFeature = result.geojson.features.find((f) => f.properties.placeId === home.id);
    const cafeFeature = result.geojson.features.find((f) => f.properties.placeId === cafe.id);
    expect(homeFeature?.properties.weight).toBe(2);
    expect(cafeFeature?.properties.weight).toBe(1);
    // Coords are [lng, lat] per GeoJSON convention.
    expect(homeFeature?.geometry.coordinates).toEqual([-122.4194, 37.7749]);
  });

  it("amount metric: sums to display currency, honouring stored rates", async () => {
    const place = await createPlace({
      name: "X",
      latitude: 1,
      longitude: 1,
      source: "manual",
    });
    // 100 EUR, snapshot says 1 EUR = 1.10 USD → 110 USD. Stored rate honoured;
    // not approximate.
    await insertExpense(place.id, 100, "EUR", 1.1, "USD");
    // 50 USD; pass-through.
    await insertExpense(place.id, 50, "USD", 1, "USD");

    const result = await getPlacesAsGeoJSON("amount", fakeConverter);
    expect(result.geojson.features).toHaveLength(1);
    expect(result.geojson.features[0].properties.weight).toBeCloseTo(160, 5);
    expect(result.approximate).toBe(false);
  });

  it("amount metric: stale rate falls back to today's rate and flags approximate", async () => {
    const place = await createPlace({
      name: "X",
      latitude: 1,
      longitude: 1,
      source: "manual",
    });
    // 100 EUR stamped against EUR display (different from current USD) — convertRow
    // detects the stale snapshot and re-applies today's rate.
    await insertExpense(place.id, 100, "EUR", 1, "EUR");
    const result = await getPlacesAsGeoJSON("amount", fakeConverter);
    expect(result.geojson.features).toHaveLength(1);
    expect(result.geojson.features[0].properties.weight).toBeCloseTo(110, 5);
    expect(result.approximate).toBe(true);
  });

  it("amount metric: drops rows with no rate and reports missing currency", async () => {
    const place = await createPlace({
      name: "X",
      latitude: 1,
      longitude: 1,
      source: "manual",
    });
    await insertExpense(place.id, 50, "USD", 1, "USD"); // included
    await insertExpense(place.id, 100, "XYZ", null, null); // dropped, no rate

    const result = await getPlacesAsGeoJSON("amount", fakeConverter);
    expect(result.geojson.features[0].properties.weight).toBeCloseTo(50, 5);
    expect(result.missingRates).toContain("XYZ");
  });

  it("excludes places with no coords from the heatmap", async () => {
    const noCoords = await createPlace({ name: "Online", source: "manual" }); // no lat/lng
    await insertExpense(noCoords.id, 25, "USD", 1, "USD");

    const result = await getPlacesAsGeoJSON("count", fakeConverter);
    expect(result.geojson.features).toHaveLength(0);
    expect(result.excludedTransactionCount).toBeGreaterThanOrEqual(1);
  });

  it("counts expenses with no place at all toward excludedTransactionCount", async () => {
    await insertExpense(null, 33, "USD", 1, "USD");
    const result = await getPlacesAsGeoJSON("count", fakeConverter);
    expect(result.geojson.features).toHaveLength(0);
    expect(result.excludedTransactionCount).toBeGreaterThanOrEqual(1);
  });

  it("includes archived places (analytics shouldn't hide history)", async () => {
    const archivedPlace = await createPlace({
      name: "Archived",
      latitude: 1,
      longitude: 1,
      source: "manual",
    });
    await insertExpense(archivedPlace.id, 42, "USD", 1, "USD");
    await archivePlace(archivedPlace.id);

    const result = await getPlacesAsGeoJSON("count", fakeConverter);
    expect(result.geojson.features).toHaveLength(1);
    expect(result.geojson.features[0].properties.weight).toBe(1);
  });

  it("ignores income transactions even when linked to a place with coords", async () => {
    const place = await createPlace({
      name: "Office",
      latitude: 1,
      longitude: 1,
      source: "manual",
    });
    const db = getTestDb();
    // Salary deposit at the office address.
    await db.insert(transactions).values({
      type: "income",
      amount: 1000,
      accountId: account.id,
      date: "2026-01-01",
      time: "12:00",
      currency: "USD",
      rateToDisplay: 1,
      displayCurrencySnapshot: "USD",
      placeId: place.id,
    });
    const result = await getPlacesAsGeoJSON("count", fakeConverter);
    expect(result.geojson.features).toHaveLength(0);
  });
});
