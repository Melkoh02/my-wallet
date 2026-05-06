import { useEffect, useState } from "react";
import { View, Pressable, Switch, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScreenLayout } from "@/components/templates/ScreenLayout";
import { HeaderBar } from "@/components/templates/HeaderBar";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { ConfirmModal } from "@/components/atoms/ConfirmModal";
import { PinEntryModal } from "@/components/molecules/PinEntryModal";
import { useTheme } from "@/providers/ThemeProvider";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import { spacing } from "@/theme/spacing";
import { getSetting, setSetting } from "@/db/queries/settings";
import {
  hasBiometricHardware,
  isBiometricEnrolled,
  isBiometricEnabled,
  setBiometricEnabled,
  hasPinSet,
  setPin as savePin,
  clearPin,
  PROTECTED_BACKUP_KEY,
  PROTECTED_RANDOM_TOGGLE_KEY,
} from "@/services/auth.service";

type PinFlow = "setup" | "change" | null;

export default function SecurityScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { invalidate } = useDataRefresh();

  // Auth state
  const [biometric, setBiometric] = useState(false);
  const [hwSupported, setHwSupported] = useState(false);
  const [enrolled, setEnrolled] = useState(false);
  const [pinExists, setPinExists] = useState(false);

  // Protected toggles
  const [protectRandomToggle, setProtectRandomToggle] = useState(false);
  const [protectBackup, setProtectBackup] = useState(false);

  // Modals
  const [pinFlow, setPinFlow] = useState<PinFlow>(null);
  const [showRemovePinConfirm, setShowRemovePinConfirm] = useState(false);

  useEffect(() => {
    (async () => {
      const [bioOn, hw, enr, pinIsSet, prTog, prBkp] = await Promise.all([
        isBiometricEnabled(),
        hasBiometricHardware(),
        isBiometricEnrolled(),
        hasPinSet(),
        getSetting(PROTECTED_RANDOM_TOGGLE_KEY),
        getSetting(PROTECTED_BACKUP_KEY),
      ]);
      setBiometric(bioOn);
      setHwSupported(hw);
      setEnrolled(enr);
      setPinExists(pinIsSet);
      setProtectRandomToggle(prTog === "true");
      setProtectBackup(prBkp === "true");
    })();
  }, []);

  const hasAnyAuth = (biometric && hwSupported && enrolled) || pinExists;

  const onBiometricToggle = async (value: boolean) => {
    if (value && (!hwSupported || !enrolled)) return;
    await setBiometricEnabled(value);
    setBiometric(value);
    invalidate("settings");
  };

  const onPinSubmit = async (pin: string): Promise<boolean> => {
    try {
      await savePin(pin);
      setPinExists(true);
      setPinFlow(null);
      invalidate("settings");
      return true;
    } catch {
      return false;
    }
  };

  const confirmRemovePin = async () => {
    await clearPin();
    setPinExists(false);
    setShowRemovePinConfirm(false);
    // If neither auth method is left, the protected toggles fall back to "no
    // auth configured" — keep the user's stored preference, but the gate hook
    // handles the fall-through gracefully.
    invalidate("settings");
  };

  const onProtectedToggle = async (key: string, value: boolean, setter: (v: boolean) => void) => {
    if (value && !hasAnyAuth) return;
    await setSetting(key, value ? "true" : "false");
    setter(value);
    invalidate("settings");
  };

  const biometricUnavailableHint = !hwSupported
    ? t("security.biometricNotSupported")
    : !enrolled
      ? t("security.biometricNotEnrolled")
      : null;

  return (
    <ScreenLayout scrollable>
      <HeaderBar title={t("security.title")} onBack={() => router.back()} />

      {/* Authentication methods */}
      <View style={styles.section}>
        <AppText variant="caption" color={colors.textSecondary} style={styles.sectionHeader}>
          {t("security.methodsHeader").toUpperCase()}
        </AppText>

        <View style={[styles.row, { backgroundColor: colors.card }]}>
          <AppIcon name="fingerprint" size={22} color={colors.primary} />
          <View style={styles.rowText}>
            <AppText variant="body">{t("security.biometric")}</AppText>
            <AppText variant="caption" color={colors.textSecondary}>
              {biometricUnavailableHint ?? t("security.biometricDesc")}
            </AppText>
          </View>
          <Switch
            value={biometric && hwSupported && enrolled}
            onValueChange={onBiometricToggle}
            disabled={!hwSupported || !enrolled}
          />
        </View>

        <Pressable
          onPress={() => setPinFlow(pinExists ? "change" : "setup")}
          style={({ pressed }) => [
            styles.row,
            { backgroundColor: pressed ? colors.borderLight : colors.card },
          ]}
        >
          <AppIcon name="numeric" size={22} color={colors.primary} />
          <View style={styles.rowText}>
            <AppText variant="body">
              {pinExists ? t("security.changePin") : t("security.setPin")}
            </AppText>
            {pinExists && (
              <AppText variant="caption" color={colors.textSecondary}>
                {t("security.pinSet")}
              </AppText>
            )}
          </View>
          <AppIcon name="chevron-right" size={20} color={colors.iconSecondary} />
        </Pressable>

        {pinExists && (
          <Pressable
            onPress={() => setShowRemovePinConfirm(true)}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: pressed ? colors.borderLight : colors.card },
            ]}
          >
            <AppIcon name="delete-outline" size={22} color={colors.danger} />
            <View style={styles.rowText}>
              <AppText variant="body" color={colors.danger}>
                {t("security.removePin")}
              </AppText>
            </View>
          </Pressable>
        )}
      </View>

      {/* Protected actions */}
      <View style={styles.section}>
        <AppText variant="caption" color={colors.textSecondary} style={styles.sectionHeader}>
          {t("security.protectedHeader").toUpperCase()}
        </AppText>
        <AppText variant="caption" color={colors.textTertiary} style={styles.sectionDesc}>
          {hasAnyAuth ? t("security.protectedDesc") : t("security.protectedNoAuthHint")}
        </AppText>

        <View style={[styles.row, { backgroundColor: colors.card, opacity: hasAnyAuth ? 1 : 0.5 }]}>
          <AppIcon name="dice-multiple-outline" size={22} color={colors.primary} />
          <View style={styles.rowText}>
            <AppText variant="body">{t("security.protectedRandomToggle")}</AppText>
            <AppText variant="caption" color={colors.textSecondary}>
              {t("security.protectedRandomToggleDesc")}
            </AppText>
          </View>
          <Switch
            value={protectRandomToggle && hasAnyAuth}
            onValueChange={(v) =>
              onProtectedToggle(PROTECTED_RANDOM_TOGGLE_KEY, v, setProtectRandomToggle)
            }
            disabled={!hasAnyAuth}
          />
        </View>

        <View style={[styles.row, { backgroundColor: colors.card, opacity: hasAnyAuth ? 1 : 0.5 }]}>
          <AppIcon name="cloud-lock-outline" size={22} color={colors.primary} />
          <View style={styles.rowText}>
            <AppText variant="body">{t("security.protectedBackup")}</AppText>
            <AppText variant="caption" color={colors.textSecondary}>
              {t("security.protectedBackupDesc")}
            </AppText>
          </View>
          <Switch
            value={protectBackup && hasAnyAuth}
            onValueChange={(v) => onProtectedToggle(PROTECTED_BACKUP_KEY, v, setProtectBackup)}
            disabled={!hasAnyAuth}
          />
        </View>
      </View>

      <PinEntryModal
        visible={pinFlow !== null}
        mode="setup"
        title={t("security.pinPrompt.setupTitle")}
        onSubmit={onPinSubmit}
        onCancel={() => setPinFlow(null)}
      />

      <ConfirmModal
        visible={showRemovePinConfirm}
        title={t("security.removePinConfirmTitle")}
        message={t("security.removePinConfirmMessage")}
        confirmLabel={t("security.removePin")}
        cancelLabel={t("common.cancel")}
        variant="danger"
        onConfirm={confirmRemovePin}
        onCancel={() => setShowRemovePinConfirm(false)}
      />
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.sm,
  },
  sectionHeader: {
    paddingHorizontal: spacing.xs,
    letterSpacing: 0.5,
  },
  sectionDesc: {
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 12,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
});
