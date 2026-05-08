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

import { backfillPlaces } from "./dataMigrations";
import { places, settings, transactions } from "@/db/schema";
import { makeAccount } from "@/db/test-fixtures";
import { eq } from "drizzle-orm";

beforeAll(() => setupTestDb());
beforeEach(() => {
  resetTestDb();
});

describe("backfillPlaces", () => {
  it("converts legacy lat/lng/locationName rows into Place records and links them", async () => {
    const db = getTestDb();
    const acc = await makeAccount();
    await db.insert(transactions).values([
      {
        type: "expense",
        amount: 10,
        accountId: acc.id,
        date: "2026-01-01",
        time: "12:00",
        currency: "USD",
        latitude: 37.7749,
        longitude: -122.4194,
        locationName: "Home",
      },
      {
        type: "expense",
        amount: 20,
        accountId: acc.id,
        date: "2026-01-02",
        time: "12:00",
        currency: "USD",
        latitude: 37.7749,
        longitude: -122.4194,
        locationName: "Home",
      },
      {
        type: "expense",
        amount: 5,
        accountId: acc.id,
        date: "2026-01-03",
        time: "12:00",
        currency: "USD",
        latitude: null,
        longitude: null,
        locationName: "Online",
      },
    ]);

    await backfillPlaces();

    const placeRows = await db.select().from(places);
    expect(placeRows).toHaveLength(2);
    const home = placeRows.find((p) => p.name === "Home");
    const online = placeRows.find((p) => p.name === "Online");
    expect(home?.source).toBe("migrated");
    expect(home?.visitCount).toBe(2);
    expect(online?.latitude).toBeNull();
    expect(online?.visitCount).toBe(1);

    const txns = await db.select().from(transactions);
    expect(txns.every((t) => t.placeId !== null)).toBe(true);
    const flag = await db.select().from(settings).where(eq(settings.key, "places_migrated"));
    expect(flag).toHaveLength(1);
  });

  it("is a no-op once the places_migrated flag is set", async () => {
    const db = getTestDb();
    const acc = await makeAccount();
    // Pre-set the flag so the migration short-circuits.
    await db.insert(settings).values({ key: "places_migrated", value: "true" });
    await db.insert(transactions).values({
      type: "expense",
      amount: 10,
      accountId: acc.id,
      date: "2026-01-01",
      time: "12:00",
      currency: "USD",
      latitude: 37.7749,
      longitude: -122.4194,
      locationName: "Should not migrate",
    });

    await backfillPlaces();

    expect(await db.select().from(places)).toHaveLength(0);
  });

  it("skips rows that already have a placeId (restore-from-v2-onto-v1 path)", async () => {
    // Simulate a re-run after a partial v2 import: some transactions already
    // link to places (existing place_id), others don't. Only the unlinked
    // ones should get backfilled.
    const db = getTestDb();
    const acc = await makeAccount();
    const [existing] = await db
      .insert(places)
      .values({ name: "Existing", source: "manual" })
      .returning();
    await db.insert(transactions).values([
      {
        type: "expense",
        amount: 1,
        accountId: acc.id,
        date: "2026-01-01",
        time: "12:00",
        currency: "USD",
        latitude: 37.7749,
        longitude: -122.4194,
        locationName: "Home",
        placeId: existing.id, // already linked, skipped
      },
      {
        type: "expense",
        amount: 2,
        accountId: acc.id,
        date: "2026-01-02",
        time: "12:00",
        currency: "USD",
        latitude: 40.7128,
        longitude: -74.006,
        locationName: "NYC",
        // placeId null — should be migrated
      },
    ]);

    await backfillPlaces();

    const placeRows = await db.select().from(places);
    // Existing place + 1 new ("NYC"). "Home" is NOT re-bucketed because its
    // transaction already has a placeId.
    expect(placeRows.map((p) => p.name).sort()).toEqual(["Existing", "NYC"]);
  });

  it("sets the flag and does no work when there are no legacy rows", async () => {
    const db = getTestDb();
    await makeAccount();
    await backfillPlaces();
    expect(await db.select().from(places)).toHaveLength(0);
    const flag = await db.select().from(settings).where(eq(settings.key, "places_migrated"));
    expect(flag).toHaveLength(1);
  });
});
