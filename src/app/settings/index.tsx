import { useEffect, useState, useMemo } from "react";
import { View, Pressable, Switch, StyleSheet, Modal, FlatList, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScreenLayout } from "@/components/templates/ScreenLayout";
import { HeaderBar } from "@/components/templates/HeaderBar";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { Divider } from "@/components/atoms/Divider";
import { useTheme } from "@/providers/ThemeProvider";
import { usePrivacy } from "@/providers/PrivacyProvider";
import { getSetting, setSetting } from "@/db/queries/settings";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import { refreshExchangeRates, getAccountCurrencies } from "@/services/exchangeRate.service";
import { SUPPORTED_LANGUAGES } from "@/i18n";
import { useLanguage } from "@/hooks/useLanguage";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";

const ALL_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CAD",
  "AUD",
  "CHF",
  "CNY",
  "BRL",
  "ARS",
  "PYG",
  "MXN",
  "COP",
  "CLP",
  "PEN",
  "INR",
  "KRW",
  "TWD",
  "THB",
  "SGD",
  "HKD",
  "NZD",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "CZK",
  "HUF",
  "TRY",
  "ZAR",
  "ILS",
  "AED",
  "SAR",
];

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

function formatLastUpdated(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (isToday) {
    const h = d.getHours() % 12 || 12;
    const m = String(d.getMinutes()).padStart(2, "0");
    const ampm = d.getHours() >= 12 ? "PM" : "AM";
    return `Today at ${h}:${m} ${ampm}`;
  }
  return d.toLocaleDateString();
}

/* ---------- Currency Picker Modal ---------- */
function CurrencyPickerModal({
  visible,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selected: string;
  onSelect: (c: string) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return ALL_CURRENCIES;
    const q = search.toUpperCase();
    return ALL_CURRENCIES.filter((c) => c.includes(q));
  }, [search]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.modalContainer, { backgroundColor: colors.background }]}>
        <View style={styles.modalHeader}>
          <AppText variant="h3">{t("settings.displayCurrency")}</AppText>
          <Pressable onPress={onClose}>
            <AppIcon name="close" size={24} color={colors.icon} />
          </Pressable>
        </View>
        <View style={styles.searchWrap}>
          <TextInput
            placeholder={t("common.search")}
            placeholderTextColor={colors.placeholder}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            style={[
              styles.searchInput,
              typography.body,
              {
                color: colors.text,
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          />
        </View>
        <FlatList
          data={filtered}
          keyExtractor={(item) => item}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                onSelect(item);
                onClose();
                setSearch("");
              }}
              style={({ pressed }) => [
                styles.listItem,
                {
                  backgroundColor: pressed
                    ? colors.borderLight
                    : item === selected
                      ? colors.surface
                      : "transparent",
                },
              ]}
            >
              <AppText variant="body">{item}</AppText>
              {item === selected && <AppIcon name="check" size={20} color={colors.primary} />}
            </Pressable>
          )}
          ListEmptyComponent={
            <AppText variant="bodySmall" color={colors.textTertiary} style={styles.emptyText}>
              {t("common.noResults")}
            </AppText>
          }
        />
      </SafeAreaView>
    </Modal>
  );
}

/* ---------- Language Picker Modal ---------- */
function LanguagePickerModal({
  visible,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selected: string;
  onSelect: (code: string) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.modalContainer, { backgroundColor: colors.background }]}>
        <View style={styles.modalHeader}>
          <AppText variant="h3">{t("settings.language")}</AppText>
          <Pressable onPress={onClose}>
            <AppIcon name="close" size={24} color={colors.icon} />
          </Pressable>
        </View>
        <View style={styles.listContent}>
          {SUPPORTED_LANGUAGES.map((lang) => (
            <Pressable
              key={lang.code}
              onPress={() => {
                onSelect(lang.code);
                onClose();
              }}
              style={({ pressed }) => [
                styles.listItem,
                {
                  backgroundColor: pressed
                    ? colors.borderLight
                    : lang.code === selected
                      ? colors.surface
                      : "transparent",
                },
              ]}
            >
              <AppText variant="body">{lang.label}</AppText>
              {lang.code === selected && <AppIcon name="check" size={20} color={colors.primary} />}
            </Pressable>
          ))}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

/* ---------- Main Settings Screen ---------- */
export default function SettingsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { invalidate } = useDataRefresh();
  const { language, changeLanguage } = useLanguage();
  const { randomNumbers, toggleRandomNumbers } = usePrivacy();
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [hideDefault, setHideDefault] = useState(false);
  const [randomDefault, setRandomDefault] = useState(false);
  const [displayCurrency, setDisplayCurrency] = useState("USD");
  const [refreshing, setRefreshing] = useState(false);
  const [ratesUpdatedAt, setRatesUpdatedAt] = useState<string | null>(null);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [multiCurrency, setMultiCurrency] = useState(false);

  useEffect(() => {
    getSetting("location_enabled").then((v) => setLocationEnabled(v === "true"));
    getSetting("privacy_hide_default").then((v) => setHideDefault(v === "true"));
    getSetting("privacy_random_default").then((v) => setRandomDefault(v === "true"));
    getSetting("display_currency").then((v) => setDisplayCurrency(v ?? "USD"));
    getSetting("exchange_rates_cache").then((v) => {
      if (v) {
        try {
          const cache = JSON.parse(v);
          setRatesUpdatedAt(cache.updatedAt ?? null);
        } catch {}
      }
    });
    getAccountCurrencies().then((currencies) => {
      setMultiCurrency(currencies.length > 1);
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
    }
  };

  const currentLanguageLabel =
    SUPPORTED_LANGUAGES.find((l) => l.code === language)?.label ?? language;

  return (
    <ScreenLayout scrollable edges={["top"]}>
      <HeaderBar title={t("settings.title")} onBack={() => router.back()} />

      {/* Display Currency — only if multi-currency */}
      {multiCurrency && (
        <>
          <View style={styles.section}>
            <Pressable
              onPress={() => setShowCurrencyPicker(true)}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: pressed ? colors.borderLight : "transparent" },
              ]}
            >
              <AppIcon name="currency-usd" size={22} color={colors.primary} />
              <View style={styles.rowText}>
                <AppText variant="body">{t("settings.displayCurrency")}</AppText>
                <AppText variant="caption" color={colors.textSecondary}>
                  {displayCurrency}
                </AppText>
              </View>
              <AppIcon name="chevron-right" size={20} color={colors.iconSecondary} />
            </Pressable>
            <View style={styles.ratesRow}>
              <Pressable
                onPress={handleRefreshRates}
                disabled={refreshing}
                style={styles.refreshRow}
              >
                <AppIcon name="refresh" size={18} color={colors.primary} />
                <AppText variant="bodySmall" color={colors.primary}>
                  {refreshing ? t("settings.updatingRates") : t("settings.updateRates")}
                </AppText>
              </Pressable>
              {ratesUpdatedAt && (
                <AppText variant="caption" color={colors.textTertiary}>
                  {t("settings.lastUpdated", { date: formatLastUpdated(ratesUpdatedAt) })}
                </AppText>
              )}
            </View>
          </View>
          <Divider />
        </>
      )}

      {/* Language */}
      <Pressable
        onPress={() => setShowLanguagePicker(true)}
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: pressed ? colors.borderLight : "transparent" },
        ]}
      >
        <AppIcon name="translate" size={22} color={colors.primary} />
        <View style={styles.rowText}>
          <AppText variant="body">{t("settings.language")}</AppText>
          <AppText variant="caption" color={colors.textSecondary}>
            {currentLanguageLabel}
          </AppText>
        </View>
        <AppIcon name="chevron-right" size={20} color={colors.iconSecondary} />
      </Pressable>
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

      {/* Privacy */}
      <View style={styles.row}>
        <AppIcon name="shield-lock" size={22} color={colors.primary} />
        <View style={styles.rowText}>
          <AppText variant="body">{t("settings.privacy")}</AppText>
        </View>
      </View>
      <SettingsToggle
        icon="eye-off"
        title={t("settings.hideByDefault")}
        subtitle={t("settings.hideByDefaultDesc")}
        value={hideDefault}
        onToggle={async (v) => {
          setHideDefault(v);
          await setSetting("privacy_hide_default", v.toString());
        }}
      />
      <SettingsToggle
        icon="shuffle-variant"
        title={t("settings.randomNumbers")}
        subtitle={t("settings.randomNumbersDesc")}
        value={randomNumbers}
        onToggle={toggleRandomNumbers}
      />
      <SettingsToggle
        icon="shuffle-variant"
        title={t("settings.randomByDefault")}
        subtitle={t("settings.randomByDefaultDesc")}
        value={randomDefault}
        onToggle={async (v) => {
          setRandomDefault(v);
          await setSetting("privacy_random_default", v.toString());
        }}
      />
      <Divider />

      {/* App version */}
      <View style={styles.versionContainer}>
        <AppText variant="caption" color={colors.textTertiary}>
          {t("settings.version", { version: "1.0.0" })}
        </AppText>
      </View>

      {/* Modals */}
      <CurrencyPickerModal
        visible={showCurrencyPicker}
        selected={displayCurrency}
        onSelect={handleCurrencyChange}
        onClose={() => setShowCurrencyPicker(false)}
      />
      <LanguagePickerModal
        visible={showLanguagePicker}
        selected={language}
        onSelect={changeLanguage}
        onClose={() => setShowLanguagePicker(false)}
      />
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
  versionContainer: {
    alignItems: "center",
    paddingVertical: spacing.xl,
  },
  /* Modal styles */
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  searchWrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  listContent: {
    paddingHorizontal: spacing.sm,
  },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderRadius: 10,
  },
  emptyText: {
    textAlign: "center",
    padding: spacing.xl,
  },
});
