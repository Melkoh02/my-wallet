// Jest setup — runs before each test file.
//
// We mock the Expo modules that touch native code so unit tests can import
// modules whose dependency chains include them without actually invoking
// platform APIs. Tests that need richer mock behaviour override these per-file
// with `jest.mock(...)`.

// Pin time zone + locale so date math and `Intl.NumberFormat` produce
// deterministic results across local-dev and CI environments. Set before any
// Date or Intl usage anywhere in the test process.
process.env.TZ = "UTC";
process.env.LANG = "en_US.UTF-8";

jest.mock("expo-localization", () => ({
  getLocales: () => [{ languageCode: "en", regionCode: "US" }],
}));

jest.mock("expo-local-authentication", () => ({
  hasHardwareAsync: jest.fn(async () => false),
  isEnrolledAsync: jest.fn(async () => false),
  authenticateAsync: jest.fn(async () => ({ success: false })),
}));

// expo-location: stub the geocoding helpers so the location.service tests
// don't need a real Geocoder. Per-test code can override behaviour via
// `jest.spyOn`.
jest.mock("expo-location", () => ({
  Accuracy: { Low: 1, Balanced: 3, High: 4, Highest: 5 },
  getForegroundPermissionsAsync: jest.fn(async () => ({ status: "denied" })),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: "denied" })),
  getLastKnownPositionAsync: jest.fn(async () => null),
  getCurrentPositionAsync: jest.fn(async () => null),
  reverseGeocodeAsync: jest.fn(async () => []),
}));

// MapLibre RN — native module. Stubs are minimal because nothing under test
// actually mounts a map view; they exist so transitive imports don't crash
// the JS module graph. Names match the v11 API (Map, Camera, Marker,
// GeoJSONSource, Layer).
jest.mock("@maplibre/maplibre-react-native", () => ({
  Map: "Map",
  Camera: "Camera",
  Marker: "Marker",
  GeoJSONSource: "GeoJSONSource",
  Layer: "Layer",
  ViewAnnotation: "ViewAnnotation",
}));

jest.mock("expo-crypto", () => {
  const crypto = require("crypto");
  return {
    CryptoDigestAlgorithm: { SHA256: "SHA-256" },
    digestStringAsync: jest.fn(async (_alg: string, data: string) =>
      crypto.createHash("sha256").update(data).digest("hex"),
    ),
    getRandomBytes: jest.fn((n: number) => {
      const arr = new Uint8Array(n);
      crypto.randomFillSync(arr);
      return arr;
    }),
  };
});

// i18next — tests don't load translation files, just need the t() shape.
jest.mock("@/i18n", () => ({
  __esModule: true,
  default: {
    t: (key: string) => key,
  },
}));

// expo-sqlite is pulled in transitively by @/db/client. Tests that exercise
// the DB layer MUST `jest.mock("@/db/client", ...)` to swap in the
// better-sqlite3-backed test client (see src/db/test-client.ts). The stub
// below throws loudly if a test reaches the real module — silent emptiness
// would let a forgotten mock pass tests against a fake-empty DB.
jest.mock("expo-sqlite", () => {
  const explode = () => {
    throw new Error(
      "expo-sqlite was called from a test. Did you forget to `jest.mock(\"@/db/client\", ...)` " +
        "with the test client? See src/db/queries/accounts.test.ts for the pattern.",
    );
  };
  return {
    openDatabaseSync: () => ({
      execSync: explode,
      runSync: explode,
      getAllSync: explode,
      getFirstSync: explode,
    }),
  };
});
