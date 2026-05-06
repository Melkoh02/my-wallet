import { useEffect, useState } from "react";
import { View, FlatList, Pressable, StyleSheet, Switch, Platform, Linking } from "react-native";
import { useRouter } from "expo-router";
import { ScreenLayout } from "@/components/templates/ScreenLayout";
import { HeaderBar } from "@/components/templates/HeaderBar";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { AppButton } from "@/components/atoms/AppButton";
import { Divider } from "@/components/atoms/Divider";
import { ConfirmModal } from "@/components/atoms/ConfirmModal";
import { HelpModal } from "@/components/molecules/HelpModal";
import { useTheme } from "@/providers/ThemeProvider";
import { useTranslation } from "react-i18next";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import { getSetting, setSetting } from "@/db/queries/settings";
import {
  createBackup,
  exportBackup,
  importBackup,
  restoreFromBackup,
  getBackupList,
  deleteBackup,
  pickBackupFolder,
  clearBackupFolder,
  migrateLegacyBackupsToFolder,
  verifyBackupFolderAccess,
  BACKUP_FOLDER_KEY,
} from "@/services/backup.service";
import { spacing } from "@/theme/spacing";
import type { Backup } from "@/db/schema";

export default function BackupScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { invalidate } = useDataRefresh();
  const [backupList, setBackupList] = useState<Backup[]>([]);
  const [autoEnabled, setAutoEnabled] = useState(true);
  const [keepCount, setKeepCount] = useState(2);
  const [folderUri, setFolderUri] = useState<string | null>(null);
  const [folderAccessible, setFolderAccessible] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showClearFolder, setShowClearFolder] = useState(false);
  const [deleteBackupId, setDeleteBackupId] = useState<number | null>(null);
  const [restoreFilePath, setRestoreFilePath] = useState<string | null>(null);
  const [resultModal, setResultModal] = useState<{ title: string; message: string } | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const loadData = async () => {
    const [list, enabled, count, folder] = await Promise.all([
      getBackupList(),
      getSetting("backup_enabled"),
      getSetting("backup_keep_count"),
      getSetting(BACKUP_FOLDER_KEY),
    ]);
    setBackupList(list);
    setAutoEnabled(enabled !== "false");
    setKeepCount(parseInt(count ?? "2", 10));
    const uri = folder && folder.length > 0 ? folder : null;
    setFolderUri(uri);
    if (uri && Platform.OS === "android") {
      setFolderAccessible(await verifyBackupFolderAccess(uri));
    } else {
      setFolderAccessible(true);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleAuto = async (value: boolean) => {
    setAutoEnabled(value);
    await setSetting("backup_enabled", value.toString());
    invalidate("settings");
  };

  const handleKeepCountChange = async (delta: number) => {
    const newCount = Math.max(1, Math.min(10, keepCount + delta));
    setKeepCount(newCount);
    await setSetting("backup_keep_count", newCount.toString());
    invalidate("settings");
  };

  const handleChangeFolder = async () => {
    setLoading(true);
    try {
      const pick = await pickBackupFolder();
      if (pick.cancelled || !pick.folderUri) return;
      if (pick.error) {
        setResultModal({ title: t("common.error"), message: pick.error });
        return;
      }
      const migration = await migrateLegacyBackupsToFolder(pick.folderUri);
      await loadData();
      const message =
        migration.migrated === 0
          ? t("backup.migrationNothing")
          : migration.failed > 0
            ? t("backup.migrationPartial", {
                migrated: migration.migrated,
                total: migration.migrated + migration.failed,
                failed: migration.failed,
              })
            : t("backup.migrationDone", { count: migration.migrated });
      setResultModal({ title: t("backup.setupReady"), message });
    } finally {
      setLoading(false);
    }
  };

  const confirmClearFolder = async () => {
    setShowClearFolder(false);
    await clearBackupFolder();
    await loadData();
  };

  const handleOpenFilesApp = () => {
    Linking.openURL("shareddocuments://").catch(() => {
      // Files app not installed (rare on iOS) — silently ignore.
    });
  };

  const handleManualBackup = async () => {
    setLoading(true);
    try {
      await createBackup(false);
      await loadData();
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    setLoading(true);
    try {
      await exportBackup();
    } finally {
      setLoading(false);
    }
  };

  const invalidateAll = () => {
    invalidate(
      "accounts",
      "categories",
      "transactions",
      "recurring",
      "themes",
      "settings",
      "backups",
      "templates",
      "budgets",
      "places",
    );
  };

  const confirmImport = async () => {
    setShowImport(false);
    setLoading(true);
    const result = await importBackup();
    setLoading(false);
    if (result.success) {
      invalidateAll();
      setResultModal({ title: t("common.success"), message: t("backup.dataImported") });
      await loadData();
    } else {
      setResultModal({
        title: t("common.error"),
        message: result.error ?? t("backup.importFailed"),
      });
    }
  };

  const confirmRestore = async () => {
    if (!restoreFilePath) return;
    setRestoreFilePath(null);
    setLoading(true);
    const result = await restoreFromBackup(restoreFilePath);
    setLoading(false);
    if (result.success) {
      invalidateAll();
      setResultModal({ title: t("common.success"), message: t("backup.dataImported") });
      await loadData();
    } else {
      setResultModal({
        title: t("common.error"),
        message: result.error ?? t("backup.importFailed"),
      });
    }
  };

  const confirmDeleteBackup = async () => {
    if (deleteBackupId === null) return;
    await deleteBackup(deleteBackupId);
    setDeleteBackupId(null);
    await loadData();
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <ScreenLayout>
      <HeaderBar
        title={t("backup.title")}
        onBack={() => router.back()}
        rightIcon="help-circle-outline"
        onRightPress={() => setShowHelp(true)}
      />
      <FlatList
        data={backupList}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            {/* Folder warning banner — Android only, when no folder is set or grant was revoked */}
            {Platform.OS === "android" && (!folderUri || !folderAccessible) && (
              <View style={[styles.warning, { backgroundColor: colors.danger + "15" }]}>
                <AppIcon name="alert-circle" size={20} color={colors.danger} />
                <AppText variant="caption" color={colors.danger} style={styles.flex}>
                  {!folderUri ? t("backup.folderUnsafeWarning") : t("backup.folderRevoked")}
                </AppText>
              </View>
            )}

            {/* Backup folder row */}
            <View style={[styles.settingRow, { borderColor: colors.border }]}>
              <View style={styles.settingInfo}>
                <AppText variant="label">{t("backup.folder")}</AppText>
                <AppText variant="caption" color={colors.textSecondary} numberOfLines={2}>
                  {Platform.OS === "ios"
                    ? t("backup.iosFolderLabel")
                    : folderUri
                      ? folderAccessible
                        ? t("backup.folderExternal")
                        : t("backup.folderRevoked")
                      : t("backup.folderNotSet")}
                </AppText>
              </View>
              {Platform.OS === "android" ? (
                folderUri ? (
                  <View style={styles.folderActions}>
                    <Pressable onPress={handleChangeFolder} hitSlop={8} disabled={loading}>
                      <AppText variant="bodySmall" color={colors.primary}>
                        {t("backup.changeFolder")}
                      </AppText>
                    </Pressable>
                    <Pressable
                      onPress={() => setShowClearFolder(true)}
                      hitSlop={8}
                      disabled={loading}
                    >
                      <AppText variant="bodySmall" color={colors.danger}>
                        {t("backup.clearFolder")}
                      </AppText>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable onPress={handleChangeFolder} hitSlop={8} disabled={loading}>
                    <AppText variant="bodySmall" color={colors.primary}>
                      {t("backup.chooseFolder")}
                    </AppText>
                  </Pressable>
                )
              ) : (
                <Pressable onPress={handleOpenFilesApp} hitSlop={8}>
                  <AppText variant="bodySmall" color={colors.primary}>
                    {t("backup.openFilesApp")}
                  </AppText>
                </Pressable>
              )}
            </View>

            {/* Auto backup toggle */}
            <View style={[styles.settingRow, { borderColor: colors.border }]}>
              <View style={styles.settingInfo}>
                <AppText variant="label">{t("backup.autoBackup")}</AppText>
                <AppText variant="caption" color={colors.textSecondary}>
                  {t("backup.autoBackupDesc")}
                </AppText>
              </View>
              <Switch value={autoEnabled} onValueChange={handleToggleAuto} />
            </View>

            {/* Keep count */}
            {autoEnabled && (
              <View style={[styles.settingRow, { borderColor: colors.border }]}>
                <View style={styles.settingInfo}>
                  <AppText variant="label">{t("backup.keepLast")}</AppText>
                  <AppText variant="caption" color={colors.textSecondary}>
                    {t("backup.keepDesc")}
                  </AppText>
                </View>
                <View style={styles.stepper}>
                  <Pressable onPress={() => handleKeepCountChange(-1)} hitSlop={8}>
                    <AppIcon name="minus-circle-outline" size={28} color={colors.primary} />
                  </Pressable>
                  <AppText variant="h3">{keepCount}</AppText>
                  <Pressable onPress={() => handleKeepCountChange(1)} hitSlop={8}>
                    <AppIcon name="plus-circle-outline" size={28} color={colors.primary} />
                  </Pressable>
                </View>
              </View>
            )}

            {/* Action buttons */}
            <View style={styles.actions}>
              <AppButton
                title={loading ? t("common.working") : t("backup.backupNow")}
                icon="cloud-upload"
                onPress={handleManualBackup}
                disabled={loading}
              />
              <AppButton
                title={t("backup.export")}
                variant="secondary"
                icon="share-variant"
                onPress={handleExport}
                disabled={loading}
              />
              <AppButton
                title={t("backup.import")}
                variant="secondary"
                icon="cloud-download"
                onPress={() => setShowImport(true)}
                disabled={loading}
              />
            </View>

            <Divider />
            <AppText variant="label" color={colors.textSecondary} style={styles.sectionTitle}>
              {t("backup.backupHistory")}
            </AppText>
            <AppText variant="caption" color={colors.textTertiary} style={styles.backupDir}>
              {t("backup.storageNote")}
            </AppText>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.backupRow, { borderColor: colors.border }]}>
            <AppIcon
              name={item.isAuto ? "cloud-sync" : "cloud-check"}
              size={24}
              color={colors.primary}
            />
            <View style={styles.backupInfo}>
              <AppText variant="bodySmall" numberOfLines={1}>
                {item.filename}
              </AppText>
              <AppText variant="caption" color={colors.textSecondary}>
                {new Date(item.createdAt).toLocaleDateString()} · {formatSize(item.sizeBytes)} ·{" "}
                {item.isAuto ? t("backup.auto") : t("backup.manual")}
              </AppText>
            </View>
            <Pressable onPress={() => setRestoreFilePath(item.filePath)} hitSlop={8}>
              <AppIcon name="backup-restore" size={20} color={colors.primary} />
            </Pressable>
            <Pressable onPress={() => setDeleteBackupId(item.id)} hitSlop={8}>
              <AppIcon name="delete-outline" size={20} color={colors.iconSecondary} />
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          <AppText variant="bodySmall" color={colors.textTertiary} style={styles.emptyText}>
            {t("backup.noBackups")}
          </AppText>
        }
      />
      <ConfirmModal
        visible={showClearFolder}
        title={t("backup.clearFolderTitle")}
        message={t("backup.clearFolderMessage")}
        confirmLabel={t("backup.clearFolder")}
        cancelLabel={t("common.cancel")}
        variant="danger"
        onConfirm={confirmClearFolder}
        onCancel={() => setShowClearFolder(false)}
      />
      <ConfirmModal
        visible={showImport}
        title={t("backup.importTitle")}
        message={t("backup.importMessage")}
        confirmLabel={t("backup.import")}
        cancelLabel={t("common.cancel")}
        onConfirm={confirmImport}
        onCancel={() => setShowImport(false)}
      />
      <ConfirmModal
        visible={restoreFilePath !== null}
        title={t("backup.restoreTitle")}
        message={t("backup.restoreMessage")}
        confirmLabel={t("backup.restore")}
        cancelLabel={t("common.cancel")}
        onConfirm={confirmRestore}
        onCancel={() => setRestoreFilePath(null)}
      />
      <ConfirmModal
        visible={deleteBackupId !== null}
        title={t("common.delete")}
        message={t("common.confirm")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={confirmDeleteBackup}
        onCancel={() => setDeleteBackupId(null)}
      />
      <ConfirmModal
        visible={!!resultModal}
        title={resultModal?.title ?? ""}
        message={resultModal?.message ?? ""}
        confirmLabel={t("common.done")}
        variant="primary"
        onConfirm={() => setResultModal(null)}
      />
      <HelpModal
        visible={showHelp}
        title={t("backup.title")}
        helpKey="backup"
        onClose={() => setShowHelp(false)}
      />
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg },
  header: { gap: spacing.md, marginBottom: spacing.md },
  warning: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 10,
  },
  flex: { flex: 1 },
  folderActions: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
    borderRadius: 12,
    borderWidth: 1,
  },
  settingInfo: { flex: 1, gap: 2 },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  actions: { gap: spacing.sm },
  sectionTitle: { marginTop: spacing.sm },
  backupDir: { marginTop: spacing.xs, fontSize: 11 },
  backupRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  backupInfo: { flex: 1, gap: 2 },
  emptyText: { textAlign: "center", padding: spacing.xl },
});
