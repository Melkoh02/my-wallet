import { useEffect, useState } from "react";
import { View, Pressable, Switch, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { ScreenLayout } from "@/components/templates/ScreenLayout";
import { HeaderBar } from "@/components/templates/HeaderBar";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { Divider } from "@/components/atoms/Divider";
import { useTheme } from "@/providers/ThemeProvider";
import { getSetting, setSetting } from "@/db/queries/settings";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
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

function SettingsToggle({
  icon,
  title,
  subtitle,
  value,
  onToggle,
}: {
  icon: string;
  title: string;
  subtitle: string;
  value: boolean;
  onToggle: (v: boolean) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <AppIcon name={icon} size={22} color={colors.primary} />
      <View style={styles.rowText}>
        <AppText variant="body">{title}</AppText>
        <AppText variant="caption" color={colors.textSecondary}>
          {subtitle}
        </AppText>
      </View>
      <Switch value={value} onValueChange={onToggle} />
    </View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const { invalidate } = useDataRefresh();
  const [locationEnabled, setLocationEnabled] = useState(false);

  useEffect(() => {
    getSetting("location_enabled").then((v) => setLocationEnabled(v === "true"));
  }, []);

  const handleLocationToggle = async (value: boolean) => {
    setLocationEnabled(value);
    await setSetting("location_enabled", value.toString());
    invalidate("settings");
  };

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
      <SettingsToggle
        icon="map-marker"
        title="Location Stamps"
        subtitle="Attach location to new transactions"
        value={locationEnabled}
        onToggle={handleLocationToggle}
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
