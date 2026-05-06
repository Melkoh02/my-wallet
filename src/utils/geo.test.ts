import { haversineMeters, boundingBox } from "./geo";

describe("haversineMeters", () => {
  it("returns 0 for identical points", () => {
    expect(haversineMeters(40.7128, -74.006, 40.7128, -74.006)).toBe(0);
  });

  it("computes short-distance correctly (100 m)", () => {
    // 0.001 degree of latitude ≈ 111 m at the equator. Use that as a
    // sanity check for the small-distance regime — the auto-pick radius
    // lives here.
    const d = haversineMeters(0, 0, 0.001, 0);
    expect(d).toBeCloseTo(111.2, 0); // within 1 m
  });

  it("matches a well-known long-distance reference (NYC ↔ LA)", () => {
    // NYC: 40.7128, -74.0060 ; LA: 34.0522, -118.2437
    // Reference value from any online great-circle calculator: ~3,936 km.
    const d = haversineMeters(40.7128, -74.006, 34.0522, -118.2437);
    expect(d / 1000).toBeCloseTo(3936, -1); // within 100 km, plenty for our purposes
  });

  it("is symmetric", () => {
    const a = haversineMeters(48.8566, 2.3522, 51.5074, -0.1278); // Paris ↔ London
    const b = haversineMeters(51.5074, -0.1278, 48.8566, 2.3522);
    expect(a).toBeCloseTo(b, 6);
  });

  it("handles antipodal points", () => {
    // Half the Earth's circumference at the mean radius ≈ 20,015 km.
    const d = haversineMeters(0, 0, 0, 180);
    expect(d / 1000).toBeCloseTo(20015, -1);
  });
});

describe("boundingBox", () => {
  it("returns a tight box for a small radius at the equator", () => {
    const box = boundingBox(0, 0, 1000); // 1 km
    // 1 km of latitude ≈ 0.009 degrees — both deltas should be the same at
    // the equator.
    expect(box.latMax - box.latMin).toBeCloseTo(0.018, 3);
    expect(box.lngMax - box.lngMin).toBeCloseTo(0.018, 3);
  });

  it("widens longitude span as latitude increases", () => {
    // At 60° latitude, longitude degrees are half as wide as at the equator.
    // So the longitude delta for the same metric radius is roughly 2× larger.
    const equator = boundingBox(0, 0, 1000);
    const sixty = boundingBox(60, 0, 1000);
    const equatorLngWidth = equator.lngMax - equator.lngMin;
    const sixtyLngWidth = sixty.lngMax - sixty.lngMin;
    expect(sixtyLngWidth).toBeGreaterThan(equatorLngWidth);
    // cos(60°) = 0.5, so we expect roughly 2× — within 1% tolerance.
    expect(sixtyLngWidth / equatorLngWidth).toBeCloseTo(2, 1);
  });

  it("contains the centre point", () => {
    const box = boundingBox(48.8566, 2.3522, 5000);
    expect(box.latMin).toBeLessThan(48.8566);
    expect(box.latMax).toBeGreaterThan(48.8566);
    expect(box.lngMin).toBeLessThan(2.3522);
    expect(box.lngMax).toBeGreaterThan(2.3522);
  });

  it("flags wrapsAntimeridian when the box would straddle ±180°", () => {
    const fiji = boundingBox(-17.7, 178.0, 250000); // 250 km radius near Fiji
    expect(fiji.wrapsAntimeridian).toBe(true);
    const sf = boundingBox(37.7749, -122.4194, 250000);
    expect(sf.wrapsAntimeridian).toBe(false);
  });

  it("clamps latitude to ±90", () => {
    const nearPole = boundingBox(89.99, 0, 100000);
    expect(nearPole.latMax).toBeLessThanOrEqual(90);
  });

  it("contains every point within the radius (sanity check)", () => {
    // 100 m radius around an arbitrary point. Generate a few points just
    // inside the radius and confirm the bounding box contains them.
    const cLat = 37.7749;
    const cLng = -122.4194;
    const box = boundingBox(cLat, cLng, 100);
    // Points at roughly 90 m offsets in each cardinal direction.
    const offsets = [
      { lat: cLat + 0.0008, lng: cLng },
      { lat: cLat - 0.0008, lng: cLng },
      { lat: cLat, lng: cLng + 0.001 },
      { lat: cLat, lng: cLng - 0.001 },
    ];
    for (const p of offsets) {
      expect(p.lat).toBeGreaterThanOrEqual(box.latMin);
      expect(p.lat).toBeLessThanOrEqual(box.latMax);
      expect(p.lng).toBeGreaterThanOrEqual(box.lngMin);
      expect(p.lng).toBeLessThanOrEqual(box.lngMax);
    }
  });
});
