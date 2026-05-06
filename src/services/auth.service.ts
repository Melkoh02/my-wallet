import * as LocalAuthentication from "expo-local-authentication";
import * as Crypto from "expo-crypto";
import { getSetting, setSetting } from "@/db/queries/settings";

// Settings keys (mirrored in docs/glossary.md § Settings keys)
export const BIOMETRIC_ENABLED_KEY = "security_biometric_enabled";
export const PIN_HASH_KEY = "security_pin_hash";
export const PIN_SALT_KEY = "security_pin_salt";
export const PROTECTED_RANDOM_TOGGLE_KEY = "security_protected_random_toggle";
export const PROTECTED_BACKUP_KEY = "security_protected_backup";

export const PIN_LENGTH = 6;

// --- Biometric -------------------------------------------------------------

export async function hasBiometricHardware(): Promise<boolean> {
  return LocalAuthentication.hasHardwareAsync();
}

export async function isBiometricEnrolled(): Promise<boolean> {
  return LocalAuthentication.isEnrolledAsync();
}

export async function isBiometricEnabled(): Promise<boolean> {
  return (await getSetting(BIOMETRIC_ENABLED_KEY)) === "true";
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  await setSetting(BIOMETRIC_ENABLED_KEY, enabled ? "true" : "false");
}

// invariant: caller decides the prompt reason. fallbackLabel="" hides the
// system fallback (we run our own PIN modal); disableDeviceFallback=true keeps
// the device PIN out of the picture so the user only ever sees app-defined auth.
export async function authenticateWithBiometric(reason: string): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    fallbackLabel: "",
    disableDeviceFallback: true,
  });
  return result.success;
}

// --- PIN -------------------------------------------------------------------
// invariant: PIN is hashed as sha256(salt + pin), salt is 16 random bytes per
// user. Threat model: a casual peeker who has the unlocked phone tries to
// bypass random-numbers / backups in seconds. sha256 is fast — not designed to
// resist a determined offline attacker who exfiltrates the settings table.
// Don't lean on this for actual confidentiality of the data itself.

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateSalt(): string {
  return bytesToHex(Crypto.getRandomBytes(16));
}

async function hashPin(pin: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

export async function hasPinSet(): Promise<boolean> {
  const hash = await getSetting(PIN_HASH_KEY);
  return !!hash;
}

export async function setPin(pin: string): Promise<void> {
  if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) {
    throw new Error(`PIN must be ${PIN_LENGTH} digits`);
  }
  const salt = generateSalt();
  const hash = await hashPin(pin, salt);
  await setSetting(PIN_SALT_KEY, salt);
  await setSetting(PIN_HASH_KEY, hash);
}

export async function clearPin(): Promise<void> {
  await setSetting(PIN_HASH_KEY, "");
  await setSetting(PIN_SALT_KEY, "");
}

export async function verifyPin(pin: string): Promise<boolean> {
  const [salt, hash] = await Promise.all([getSetting(PIN_SALT_KEY), getSetting(PIN_HASH_KEY)]);
  if (!salt || !hash) return false;
  const candidate = await hashPin(pin, salt);
  return candidate === hash;
}
