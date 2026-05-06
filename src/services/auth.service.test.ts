// PIN hashing round-trip tests. Biometric paths and DB reads/writes are
// stubbed in jest.setup.ts so this file tests the pure math layer plus the
// hash↔verify contract.

import { setPin, verifyPin, clearPin, hasPinSet, PIN_LENGTH } from "./auth.service";

// Swap @/db/queries/settings for an in-memory key/value store so the PIN flow
// doesn't depend on the real DB layer. Keeps these tests fast and isolated.
jest.mock("@/db/queries/settings", () => {
  const store = new Map<string, string>();
  return {
    __resetSettingsStore: () => store.clear(),
    getSetting: jest.fn(async (key: string) => store.get(key) ?? null),
    setSetting: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
  };
});

describe("PIN setup + verify", () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require("@/db/queries/settings") as { __resetSettingsStore: () => void };
    m.__resetSettingsStore();
  });

  it("rejects non-6-digit PINs at setup", async () => {
    await expect(setPin("12345")).rejects.toThrow();
    await expect(setPin("1234567")).rejects.toThrow();
    await expect(setPin("12345a")).rejects.toThrow();
    await expect(setPin("")).rejects.toThrow();
  });

  it("accepts a 6-digit PIN and round-trips verify", async () => {
    expect(PIN_LENGTH).toBe(6);
    await setPin("123456");
    expect(await hasPinSet()).toBe(true);
    expect(await verifyPin("123456")).toBe(true);
  });

  it("rejects a wrong PIN on verify", async () => {
    await setPin("123456");
    expect(await verifyPin("000000")).toBe(false);
    expect(await verifyPin("12345")).toBe(false); // wrong length
  });

  it("uses a different salt on subsequent setPin calls", async () => {
    await setPin("123456");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getSetting } = require("@/db/queries/settings");
    const salt1 = await getSetting("security_pin_salt");
    const hash1 = await getSetting("security_pin_hash");

    await setPin("123456"); // same PIN, fresh salt
    const salt2 = await getSetting("security_pin_salt");
    const hash2 = await getSetting("security_pin_hash");

    expect(salt2).not.toBe(salt1);
    expect(hash2).not.toBe(hash1);
    expect(await verifyPin("123456")).toBe(true);
  });

  it("clearPin removes the hash and salt; verify then returns false", async () => {
    await setPin("123456");
    await clearPin();
    expect(await hasPinSet()).toBe(false);
    expect(await verifyPin("123456")).toBe(false);
  });

  it("hasPinSet returns false on a fresh store", async () => {
    expect(await hasPinSet()).toBe(false);
    expect(await verifyPin("123456")).toBe(false);
  });

  it("uses a 32-character (16-byte hex) salt", async () => {
    await setPin("123456");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getSetting } = require("@/db/queries/settings");
    const salt = await getSetting("security_pin_salt");
    expect(salt).toMatch(/^[0-9a-f]{32}$/);
  });
});
