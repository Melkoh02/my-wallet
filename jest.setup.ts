// Jest setup — runs before each test file.
//
// We mock the Expo modules that touch native code so unit tests can import
// modules whose dependency chains include them without actually invoking
// platform APIs. Tests that need richer mock behaviour override these per-file
// with `jest.mock(...)`.

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
// the DB layer mock @/db/client to swap in a better-sqlite3-backed driver
// (see src/db/test-client.ts). For tests that don't touch the DB at all,
// stub expo-sqlite so the import doesn't crash on Node.
jest.mock("expo-sqlite", () => ({
  openDatabaseSync: () => ({
    execSync: () => undefined,
    runSync: () => undefined,
    getAllSync: () => [],
    getFirstSync: () => null,
  }),
}));
