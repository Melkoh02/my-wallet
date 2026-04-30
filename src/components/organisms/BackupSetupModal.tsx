import { useState } from "react";
import { Modal, View, StyleSheet, ActivityIndicator, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { AppText } from "@/components/atoms/AppText";
import { AppButton } from "@/components/atoms/AppButton";
import { AppIcon } from "@/components/atoms/AppIcon";
import { useTheme } from "@/providers/ThemeProvider";
import { spacing } from "@/theme/spacing";
import {
  pickBackupFolder,
  migrateLegacyBackupsToFolder,
  BACKUP_SETUP_DONE_KEY,
} from "@/services/backup.service";
import { setSetting } from "@/db/queries/settings";

type Step = "intro" | "skipConfirm" | "working" | "result";

type Result = { migrated: number; failed: number; removed: number } | { error: string };

type BackupSetupModalProps = {
  visible: boolean;
  onComplete: () => void;
};

export function BackupSetupModal({ visible, onComplete }: BackupSetupModalProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>("intro");
  const [result, setResult] = useState<Result | null>(null);

  const isAndroid = Platform.OS === "android";

  const handleChooseFolder = async () => {
    setStep("working");
    const pick = await pickBackupFolder();
    if (pick.cancelled || !pick.folderUri) {
      setStep("intro");
      return;
    }
    if (pick.error) {
      setResult({ error: pick.error });
      setStep("result");
      return;
    }
    const migration = await migrateLegacyBackupsToFolder(pick.folderUri);
    setResult(migration);
    setStep("result");
  };

  const handleIosAcknowledge = async () => {
    await setSetting(BACKUP_SETUP_DONE_KEY, "true");
    onComplete();
  };

  const handleSkipConfirm = async () => {
    await setSetting(BACKUP_SETUP_DONE_KEY, "true");
    onComplete();
  };

  const handleResultDone = async () => {
    // Mark setup done on both success and error paths so the user isn't
    // re-prompted on next launch — the SAF picker either worked or failed in a
    // way that would just fail again.
    await setSetting(BACKUP_SETUP_DONE_KEY, "true");
    setStep("intro");
    setResult(null);
    onComplete();
  };

  // Hardware back (Android): route to the skip-confirm step rather than
  // silently ignore. iOS doesn't have a system back button for modals.
  const handleRequestClose = () => {
    if (step === "intro" && isAndroid) setStep("skipConfirm");
    else if (step === "skipConfirm") setStep("intro");
    // working / result: ignore — let the flow finish.
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleRequestClose}>
      <View style={styles.backdrop}>
        <View
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          {step === "intro" && (
            <>
              <View style={styles.iconHeader}>
                <AppIcon name="shield-check" size={40} color={colors.primary} />
              </View>
              <AppText variant="h3" style={styles.centered}>
                {t("backup.setupTitle")}
              </AppText>
              <AppText variant="body" color={colors.textSecondary} style={styles.centered}>
                {isAndroid ? t("backup.setupAndroidMessage") : t("backup.setupIosMessage")}
              </AppText>
              <View style={styles.actions}>
                {isAndroid ? (
                  <>
                    <AppButton
                      title={t("backup.setupChooseFolder")}
                      icon="folder-open"
                      onPress={handleChooseFolder}
                    />
                    <AppButton
                      title={t("backup.setupSkip")}
                      variant="ghost"
                      onPress={() => setStep("skipConfirm")}
                    />
                  </>
                ) : (
                  <AppButton title={t("backup.setupGotIt")} onPress={handleIosAcknowledge} />
                )}
              </View>
            </>
          )}

          {step === "skipConfirm" && (
            <>
              <View style={styles.iconHeader}>
                <AppIcon name="alert-circle" size={40} color={colors.danger} />
              </View>
              <AppText variant="h3" style={styles.centered}>
                {t("backup.setupSkipConfirmTitle")}
              </AppText>
              <AppText variant="body" color={colors.textSecondary} style={styles.centered}>
                {t("backup.setupSkipConfirmMessage")}
              </AppText>
              <View style={styles.actionsRow}>
                <AppButton
                  title={t("common.cancel")}
                  variant="ghost"
                  onPress={() => setStep("intro")}
                  style={styles.flex}
                />
                <AppButton
                  title={t("backup.setupSkipConfirmYes")}
                  variant="danger"
                  onPress={handleSkipConfirm}
                  style={styles.flex}
                />
              </View>
            </>
          )}

          {step === "working" && (
            <View style={styles.workingArea}>
              <ActivityIndicator size="large" color={colors.primary} />
              <AppText variant="body" color={colors.textSecondary}>
                {t("backup.migratingBackups")}
              </AppText>
            </View>
          )}

          {step === "result" && result && (
            <>
              <View style={styles.iconHeader}>
                <AppIcon
                  name={"error" in result ? "alert-circle" : "check-circle"}
                  size={40}
                  color={"error" in result ? colors.danger : colors.income}
                />
              </View>
              <AppText variant="h3" style={styles.centered}>
                {"error" in result ? t("common.error") : t("backup.setupReady")}
              </AppText>
              <AppText variant="body" color={colors.textSecondary} style={styles.centered}>
                {"error" in result
                  ? result.error
                  : result.migrated === 0
                    ? t("backup.migrationNothing")
                    : result.failed > 0
                      ? t("backup.migrationPartial", {
                          migrated: result.migrated,
                          total: result.migrated + result.failed,
                          failed: result.failed,
                        })
                      : t("backup.migrationDone", { count: result.migrated })}
              </AppText>
              <View style={styles.actions}>
                <AppButton title={t("common.done")} onPress={handleResultDone} />
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  card: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    padding: spacing["2xl"],
    gap: spacing.md,
  },
  iconHeader: {
    alignItems: "center",
    paddingBottom: spacing.xs,
  },
  centered: {
    textAlign: "center",
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  actionsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  workingArea: {
    alignItems: "center",
    gap: spacing.lg,
    paddingVertical: spacing["2xl"],
  },
});
