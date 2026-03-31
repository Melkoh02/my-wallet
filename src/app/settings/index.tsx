import { View, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { ScreenLayout } from "@/components/templates/ScreenLayout";
import { HeaderBar } from "@/components/templates/HeaderBar";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { Divider } from "@/components/atoms/Divider";
import { useTheme } from "@/providers/ThemeProvider";
import { spacing } from "@/theme/spacing";

type SettingsRowProps = {
  icon: string;
  title: string;
  subtitle?: string;
  onPress: () => void;
};

function SettingsRow({ icon, title, subtitle, onPress }: SettingsRowProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.borderLight : "transparent" },
      ]}
    >
      <AppIcon name={icon} size={22} color={colors.primary} />
      <View style={styles.rowText}>
        <AppText variant="body">{title}</AppText>
        {subtitle && (
          <AppText variant="caption" color={colors.textSecondary}>
            {subtitle}
          </AppText>
        )}
      </View>
      <AppIcon name="chevron-right" size={20} color={colors.iconSecondary} />
    </Pressable>
  );
}

export default function SettingsScreen() {
  const router = useRouter();

  return (
    <ScreenLayout scrollable edges={["top"]}>
      <HeaderBar title="Settings" onBack={() => router.back()} />

      <SettingsRow
        icon="palette"
        title="Themes"
        subtitle="Customize app appearance"
        onPress={() => router.push("/settings/themes")}
      />
      <Divider />
      <SettingsRow
        icon="cloud-upload"
        title="Backup & Export"
        subtitle="Auto-backup, export, and import data"
        onPress={() => router.push("/settings/backup")}
      />
      <Divider />
      <SettingsRow
        icon="refresh"
        title="Recurring Transactions"
        subtitle="Manage subscriptions and salary"
        onPress={() => router.push("/recurring")}
      />
      <Divider />
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
});
