import { useEffect, useState } from "react";
import { View, Pressable, Switch, StyleSheet, Alert } from "react-native";
import { useRouter } from "expo-router";
import { ScreenLayout } from "@/components/templates/ScreenLayout";
import { HeaderBar } from "@/components/templates/HeaderBar";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { Chip } from "@/components/atoms/Chip";
import { Divider } from "@/components/atoms/Divider";
import { useTheme } from "@/providers/ThemeProvider";
import { getSetting, setSetting } from "@/db/queries/settings";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import { refreshExchangeRates } from "@/services/exchangeRate.service";
import { spacing } from "@/theme/spacing";

const CURRENCIES = ["USD", "EUR", "GBP", "PYG", "BRL", "ARS", "JPY", "CAD"];

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
  const { colors } = useTheme();
  const { invalidate } = useDataRefresh();
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [displayCurrency, setDisplayCurrency] = useState("USD");
  const [refreshing, setRefreshing] = useState(false);
  const [ratesUpdatedAt, setRatesUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    getSetting("location_enabled").then((v) => setLocationEnabled(v === "true"));
    getSetting("display_currency").then((v) => setDisplayCurrency(v ?? "USD"));
    getSetting("exchange_rates_cache").then((v) => {
      if (v) {
        try {
          const cache = JSON.parse(v);
          setRatesUpdatedAt(cache.updatedAt ?? null);
        } catch {}
      }
    });
  }, []);

  const handleLocationToggle = async (value: boolean) => {
    setLocationEnabled(value);
    await setSetting("location_enabled", value.toString());
    invalidate("settings");
  };

  const handleCurrencyChange = async (currency: string) => {
    setDisplayCurrency(currency);
    await setSetting("display_currency", currency);
    invalidate("settings", "accounts");
  };

  const handleRefreshRates = async () => {
    setRefreshing(true);
    const success = await refreshExchangeRates();
    setRefreshing(false);
    if (success) {
      invalidate("accounts");
      setRatesUpdatedAt(new Date().toISOString());
      Alert.alert("Rates Updated", "Exchange rates have been refreshed.");
    } else {
      Alert.alert("Update Failed", "Could not fetch exchange rates. Check your connection.");
    }
  };

  return (
    <ScreenLayout scrollable edges={["top"]}>
      <HeaderBar title="Settings" onBack={() => router.back()} />

      {/* Display Currency */}
      <View style={styles.section}>
        <View style={styles.row}>
          <AppIcon name="currency-usd" size={22} color={colors.primary} />
          <View style={styles.rowText}>
            <AppText variant="body">Display Currency</AppText>
            <AppText variant="caption" color={colors.textSecondary}>
              All balances converted to this currency
            </AppText>
          </View>
        </View>
        <View style={styles.chipWrap}>
          {CURRENCIES.map((c) => (
            <Chip
              key={c}
              label={c}
              selected={displayCurrency === c}
              onPress={() => handleCurrencyChange(c)}
            />
          ))}
        </View>
        <View style={styles.ratesRow}>
          <Pressable onPress={handleRefreshRates} disabled={refreshing} style={styles.refreshRow}>
            <AppIcon name="refresh" size={18} color={colors.primary} />
            <AppText variant="bodySmall" color={colors.primary}>
              {refreshing ? "Updating rates..." : "Update exchange rates"}
            </AppText>
          </Pressable>
          {ratesUpdatedAt && (
            <AppText variant="caption" color={colors.textTertiary}>
              Last updated: {new Date(ratesUpdatedAt).toLocaleDateString()}
            </AppText>
          )}
        </View>
      </View>
      <Divider />

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
  section: {
    paddingBottom: spacing.sm,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  ratesRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  refreshRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
});
