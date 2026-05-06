import { bucketLegacyLocations } from "./placesMigration";

describe("bucketLegacyLocations", () => {
  it("returns no buckets for empty input", () => {
    expect(bucketLegacyLocations([])).toEqual([]);
  });

  it("creates one bucket per coord+name combination", () => {
    const buckets = bucketLegacyLocations([
      { id: 1, latitude: 37.7749, longitude: -122.4194, locationName: "Home" },
      { id: 2, latitude: 37.7749, longitude: -122.4194, locationName: "Home" },
    ]);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].name).toBe("Home");
    expect(buckets[0].transactionIds).toEqual([1, 2]);
  });

  it("merges nearby coords (within ~11 m) under the same name", () => {
    // 4-decimal rounding ≈ 11 m. These two should hash to the same bucket.
    const buckets = bucketLegacyLocations([
      { id: 1, latitude: 37.77491, longitude: -122.41941, locationName: "Cafe" },
      { id: 2, latitude: 37.77494, longitude: -122.41944, locationName: "Cafe" },
    ]);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].transactionIds).toEqual([1, 2]);
  });

  it("splits same coords with different names (over-split rather than over-merge)", () => {
    // Two visits to the same address with different labels stay separate.
    // Users can manually merge later; an unwanted merge is harder to recover.
    const buckets = bucketLegacyLocations([
      { id: 1, latitude: 37.7749, longitude: -122.4194, locationName: "Cafe" },
      { id: 2, latitude: 37.7749, longitude: -122.4194, locationName: "Restaurant" },
    ]);
    expect(buckets).toHaveLength(2);
    const names = buckets.map((b) => b.name).sort();
    expect(names).toEqual(["Cafe", "Restaurant"]);
  });

  it("merges name-only rows case-insensitively", () => {
    const buckets = bucketLegacyLocations([
      { id: 1, latitude: null, longitude: null, locationName: "Starbucks" },
      { id: 2, latitude: null, longitude: null, locationName: "starbucks" },
      { id: 3, latitude: null, longitude: null, locationName: "STARBUCKS" },
    ]);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].latitude).toBeNull();
    expect(buckets[0].longitude).toBeNull();
    expect(buckets[0].transactionIds).toEqual([1, 2, 3]);
  });

  it("keeps coord-only rows (no name) under a coord-derived label", () => {
    const buckets = bucketLegacyLocations([
      { id: 1, latitude: 37.7749, longitude: -122.4194, locationName: null },
      { id: 2, latitude: 37.7749, longitude: -122.4194, locationName: "" },
    ]);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].name).toBe("37.7749, -122.4194");
    expect(buckets[0].transactionIds).toEqual([1, 2]);
  });

  it("skips rows with neither coords nor name", () => {
    const buckets = bucketLegacyLocations([
      { id: 1, latitude: null, longitude: null, locationName: null },
      { id: 2, latitude: null, longitude: null, locationName: "" },
      { id: 3, latitude: null, longitude: null, locationName: "   " },
    ]);
    expect(buckets).toEqual([]);
  });

  it("handles a mixed input set", () => {
    const buckets = bucketLegacyLocations([
      { id: 1, latitude: 37.7749, longitude: -122.4194, locationName: "Home" },
      { id: 2, latitude: 40.7128, longitude: -74.006, locationName: "Hotel" },
      { id: 3, latitude: null, longitude: null, locationName: "Online" },
      { id: 4, latitude: null, longitude: null, locationName: "online" },
      { id: 5, latitude: 37.7749, longitude: -122.4194, locationName: "Home" },
      { id: 6, latitude: null, longitude: null, locationName: null }, // skipped
    ]);
    expect(buckets).toHaveLength(3);

    const home = buckets.find((b) => b.name === "Home");
    expect(home?.transactionIds).toEqual([1, 5]);

    const online = buckets.find((b) => b.name.toLowerCase() === "online");
    expect(online?.latitude).toBeNull();
    expect(online?.transactionIds).toEqual([3, 4]);

    const hotel = buckets.find((b) => b.name === "Hotel");
    expect(hotel?.latitude).toBe(40.7128);
  });

  it("trims whitespace around names before bucketing", () => {
    const buckets = bucketLegacyLocations([
      { id: 1, latitude: null, longitude: null, locationName: "Office" },
      { id: 2, latitude: null, longitude: null, locationName: "  Office  " },
    ]);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].transactionIds).toEqual([1, 2]);
  });

  it("preserves the first row's full-precision coords (not rounded key coords)", () => {
    // The bucket key rounds to 4 decimals, but the bucket itself keeps the
    // original lat/lng from the first row so the migrated place isn't lossy.
    const buckets = bucketLegacyLocations([
      { id: 1, latitude: 37.77491234, longitude: -122.41941234, locationName: "X" },
    ]);
    expect(buckets[0].latitude).toBe(37.77491234);
    expect(buckets[0].longitude).toBe(-122.41941234);
  });
});
