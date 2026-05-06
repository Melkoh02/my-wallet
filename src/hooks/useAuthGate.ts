import { useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { getSetting } from "@/db/queries/settings";
import {
  PROTECTED_BACKUP_KEY,
  PROTECTED_RANDOM_TOGGLE_KEY,
  authenticateWithBiometric,
  hasBiometricHardware,
  isBiometricEnabled,
  isBiometricEnrolled,
  hasPinSet,
  verifyPin,
} from "@/services/auth.service";

export type ProtectedAction = "backup" | "random_toggle";

const KEY_BY_ACTION: Record<ProtectedAction, string> = {
  backup: PROTECTED_BACKUP_KEY,
  random_toggle: PROTECTED_RANDOM_TOGGLE_KEY,
};

/**
 * Gate a callback behind biometric/PIN auth when the protected-action toggle
 * is on. Returns:
 * - `guard(cb)` — call before running the action. Runs `cb` immediately if
 *   the action isn't protected; otherwise prompts biometric, then PIN, then
 *   runs `cb` on success.
 * - `pinModal` — props to spread onto a `<PinEntryModal>` rendered by the
 *   consumer. The modal is only ever opened when biometric fails or isn't
 *   configured AND a PIN is set.
 */
export function useAuthGate(action: ProtectedAction) {
  const { t } = useTranslation();
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const pendingCallback = useRef<(() => void) | null>(null);
  // Prevents concurrent guard runs (rapid double-tap). Without this, two
  // overlapping guards can trigger the system biometric prompt twice or
  // overwrite each other's pending callback.
  const inFlightRef = useRef(false);

  const guard = useCallback(
    async (callback: () => void) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const isProtected = (await getSetting(KEY_BY_ACTION[action])) === "true";
        if (!isProtected) {
          callback();
          return;
        }

        const [biometricOn, hwOk, enrolledOk] = await Promise.all([
          isBiometricEnabled(),
          hasBiometricHardware(),
          isBiometricEnrolled(),
        ]);

        if (biometricOn && hwOk && enrolledOk) {
          const ok = await authenticateWithBiometric(t("security.biometricPrompt"));
          if (ok) {
            callback();
            return;
          }
          // Biometric cancelled or failed → fall through to PIN if available.
        }

        if (await hasPinSet()) {
          pendingCallback.current = callback;
          setPinModalVisible(true);
          return;
        }

        // gotcha: protection toggle is on but no auth method is configured —
        // shouldn't happen via the security screen UI (toggles are disabled in
        // that case + cleared when all auth is removed), but defend defensively
        // by letting the action through.
        callback();
      } finally {
        inFlightRef.current = false;
      }
    },
    [action, t],
  );

  const submitPin = useCallback(async (pin: string) => {
    const ok = await verifyPin(pin);
    if (ok) {
      setPinModalVisible(false);
      pendingCallback.current?.();
      pendingCallback.current = null;
      return true;
    }
    return false;
  }, []);

  const cancelPin = useCallback(() => {
    setPinModalVisible(false);
    pendingCallback.current = null;
  }, []);

  return {
    guard,
    pinModal: {
      visible: pinModalVisible,
      mode: "verify" as const,
      onSubmit: submitPin,
      onCancel: cancelPin,
    },
  };
}
