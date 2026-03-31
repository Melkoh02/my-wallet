import { useEffect, useState } from "react";
import { View, Pressable, Switch, StyleSheet, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
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
import { SUPPORTED_LANGUAGES } from "@/i18n";
import { useLanguage } from "@/hooks/useLanguage";
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
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { invalidate } = useDataRefresh();
  const { language, changeLanguage } = useLanguage();
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
      Alert.alert(t("settings.ratesUpdated"), t("settings.ratesUpdatedDesc"));
    } else {
      Alert.alert(t("settings.ratesFailed"), t("settings.ratesFailedDesc"));
    }
  };

  return (
    <ScreenLayout scrollable edges={["top"]}>
      <HeaderBar title={t("settings.title")} onBack={() => router.back()} />

      {/* Display Currency */}
      <View style={styles.section}>
        <View style={styles.row}>
          <AppIcon name="currency-usd" size={22} color={colors.primary} />
          <View style={styles.rowText}>
            <AppText variant="body">{t("settings.displayCurrency")}</AppText>
            <AppText variant="caption" color={colors.textSecondary}>
              {t("settings.displayCurrencyDesc")}
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
              {refreshing ? t("settings.updatingRates") : t("settings.updateRates")}
            </AppText>
          </Pressable>
          {ratesUpdatedAt && (
            <AppText variant="caption" color={colors.textTertiary}>
              {t("settings.lastUpdated", { date: new Date(ratesUpdatedAt).toLocaleDateString() })}
            </AppText>
          )}
        </View>
      </View>
      <Divider />

      {/* Language */}
      <View style={styles.section}>
        <View style={styles.row}>
          <AppIcon name="translate" size={22} color={colors.primary} />
          <View style={styles.rowText}>
            <AppText variant="body">{t("settings.language")}</AppText>
            <AppText variant="caption" color={colors.textSecondary}>
              {t("settings.languageDesc")}
            </AppText>
          </View>
        </View>
        <View style={styles.chipWrap}>
          {SUPPORTED_LANGUAGES.map((lang) => (
            <Chip
              key={lang.code}
              label={lang.label}
              selected={language === lang.code}
              onPress={() => changeLanguage(lang.code)}
            />
          ))}
        </View>
      </View>
      <Divider />

      <SettingsRow
        icon="palette"
        title={t("settings.themes")}
        subtitle={t("settings.themesDesc")}
        onPress={() => router.push("/settings/themes")}
      />
      <Divider />
      <SettingsRow
        icon="cloud-upload"
        title={t("settings.backup")}
        subtitle={t("settings.backupDesc")}
        onPress={() => router.push("/settings/backup")}
      />
      <Divider />
      <SettingsRow
        icon="refresh"
        title={t("settings.recurringTransactions")}
        subtitle={t("settings.recurringDesc")}
        onPress={() => router.push("/recurring")}
      />
      <Divider />
      <SettingsToggle
        icon="map-marker"
        title={t("settings.locationStamps")}
        subtitle={t("settings.locationDesc")}
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
