import { useEffect, useState } from "react";
import { View, FlatList, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { ScreenLayout } from "@/components/templates/ScreenLayout";
import { HeaderBar } from "@/components/templates/HeaderBar";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { AppInput } from "@/components/atoms/AppInput";
import { AppButton } from "@/components/atoms/AppButton";
import { Chip } from "@/components/atoms/Chip";
import { Divider } from "@/components/atoms/Divider";
import { ConfirmModal } from "@/components/atoms/ConfirmModal";
import { useTheme } from "@/providers/ThemeProvider";
import { lightPalette } from "@/theme/colors";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import { getThemes, createTheme, deleteTheme } from "@/db/queries/themes";
import { spacing } from "@/theme/spacing";
import type { Theme } from "@/db/schema";
import type { ThemeMode, StatusBarStyle } from "@/types";

const ACCENT_COLORS = [
  "#3B82F6",
  "#EF4444",
  "#10B981",
  "#F59E0B",
  "#8B5CF6",
  "#EC4899",
  "#06B6D4",
  "#6366F1",
  "#F97316",
  "#14B8A6",
];

export default function ThemesScreen() {
  const router = useRouter();
  const { colors, setThemeId } = useTheme();
  const { invalidate, revisions } = useDataRefresh();
  const [themeList, setThemeList] = useState<Theme[]>([]);

  // New theme form
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<ThemeMode>("light");
  const [accentColor, setAccentColor] = useState(ACCENT_COLORS[0]);
  const [statusBarStyle, setStatusBarStyle] = useState<StatusBarStyle>("auto");
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);

  useEffect(() => {
    getThemes().then(setThemeList);
  }, [revisions.themes]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    await createTheme({
      name: name.trim(),
      mode,
      accentColor,
      statusBarStyle,
    });
    invalidate("themes");
    setShowForm(false);
    setName("");
  };

  const handleActivate = async (id: number) => {
    await setThemeId(id);
    invalidate("themes");
  };

  const handleReset = async () => {
    await setThemeId(null);
    invalidate("themes");
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteTheme(deleteTarget.id);
    invalidate("themes");
    setDeleteTarget(null);
  };

  return (
    <ScreenLayout edges={["top"]}>
      <HeaderBar title="Themes" onBack={() => router.back()} />
      <FlatList
        data={themeList}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            <Pressable
              onPress={handleReset}
              style={[styles.themeRow, { borderColor: colors.border }]}
            >
              <View style={[styles.colorDot, { backgroundColor: lightPalette.primary }]} />
              <View style={styles.themeInfo}>
                <AppText variant="label">System Default</AppText>
                <AppText variant="caption" color={colors.textSecondary}>
                  Follows device theme
                </AppText>
              </View>
              <AppText variant="caption" color={colors.primary}>
                Reset
              </AppText>
            </Pressable>
            <Divider style={styles.divider} />
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => handleActivate(item.id)}
            onLongPress={() => setDeleteTarget({ id: item.id, name: item.name })}
            style={[
              styles.themeRow,
              {
                borderColor: item.isActive ? item.accentColor : colors.border,
                borderWidth: item.isActive ? 2 : 1,
              },
            ]}
          >
            <View style={[styles.colorDot, { backgroundColor: item.accentColor }]} />
            <View style={styles.themeInfo}>
              <AppText variant="label">{item.name}</AppText>
              <AppText variant="caption" color={colors.textSecondary}>
                {item.mode} · {item.statusBarStyle} status bar
              </AppText>
            </View>
            {item.isActive && <AppIcon name="check-circle" size={22} color={item.accentColor} />}
          </Pressable>
        )}
        ListFooterComponent={
          showForm ? (
            <View style={styles.form}>
              <AppInput
                label="Theme Name"
                value={name}
                onChangeText={setName}
                placeholder="e.g. Ocean Dark"
              />
              <View style={styles.section}>
                <AppText variant="label" color={colors.textSecondary}>
                  Mode
                </AppText>
                <View style={styles.chipRow}>
                  <Chip
                    label="Light"
                    selected={mode === "light"}
                    onPress={() => setMode("light")}
                  />
                  <Chip label="Dark" selected={mode === "dark"} onPress={() => setMode("dark")} />
                </View>
              </View>
              <View style={styles.section}>
                <AppText variant="label" color={colors.textSecondary}>
                  Accent Color
                </AppText>
                <View style={styles.colorGrid}>
                  {ACCENT_COLORS.map((c) => (
                    <View
                      key={c}
                      onTouchEnd={() => setAccentColor(c)}
                      style={[
                        styles.accentDot,
                        {
                          backgroundColor: c,
                          borderColor: accentColor === c ? colors.text : "transparent",
                        },
                      ]}
                    />
                  ))}
                </View>
              </View>
              <View style={styles.section}>
                <AppText variant="label" color={colors.textSecondary}>
                  Status Bar
                </AppText>
                <View style={styles.chipRow}>
                  <Chip
                    label="Auto"
                    selected={statusBarStyle === "auto"}
                    onPress={() => setStatusBarStyle("auto")}
                  />
                  <Chip
                    label="Light"
                    selected={statusBarStyle === "light"}
                    onPress={() => setStatusBarStyle("light")}
                  />
                  <Chip
                    label="Dark"
                    selected={statusBarStyle === "dark"}
                    onPress={() => setStatusBarStyle("dark")}
                  />
                </View>
              </View>
              <View style={styles.formActions}>
                <AppButton title="Create Theme" onPress={handleCreate} disabled={!name.trim()} />
                <AppButton title="Cancel" variant="ghost" onPress={() => setShowForm(false)} />
              </View>
            </View>
          ) : (
            <AppButton
              title="Create New Theme"
              variant="secondary"
              icon="plus"
              onPress={() => setShowForm(true)}
              style={styles.addBtn}
            />
          )
        }
      />
      <ConfirmModal
        visible={!!deleteTarget}
        title="Delete Theme"
        message={`Remove "${deleteTarget?.name ?? ""}"?`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, gap: spacing.sm },
  themeRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
    borderRadius: 12,
    borderWidth: 1,
    gap: spacing.md,
  },
  colorDot: { width: 32, height: 32, borderRadius: 16 },
  themeInfo: { flex: 1, gap: 2 },
  divider: { marginVertical: spacing.sm },
  form: { gap: spacing.lg, marginTop: spacing.lg },
  section: { gap: spacing.sm },
  chipRow: { flexDirection: "row", gap: spacing.sm },
  colorGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  accentDot: { width: 32, height: 32, borderRadius: 16, borderWidth: 2.5 },
  formActions: { gap: spacing.sm },
  addBtn: { marginTop: spacing.lg },
});
