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
