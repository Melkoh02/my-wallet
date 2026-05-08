import { useEffect, useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScreenLayout } from "@/components/templates/ScreenLayout";
import { HeaderBar } from "@/components/templates/HeaderBar";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { EmptyState } from "@/components/molecules/EmptyState";
import { PlacesHeatmap } from "@/components/organisms/PlacesHeatmap";
import { useTheme } from "@/providers/ThemeProvider";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import { spacing } from "@/theme/spacing";
import {
  getPlacesAsGeoJSON,
  type HeatmapMetric,
  type PlacesHeatmapData,
} from "@/db/queries/places";
import { loadCurrencyConverter } from "@/services/exchangeRate.service";

export default function SpendingMapScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { revisions } = useDataRefresh();
  const [metric, setMetric] = useState<HeatmapMetric>("amount");
  const [data, setData] = useState<PlacesHeatmapData | null>(null);
  const [displayCurrency, setDisplayCurrency] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const conv = await loadCurrencyConverter();
      const result = await getPlacesAsGeoJSON(metric, conv);
      if (!cancelled) {
        setData(result);
        setDisplayCurrency(conv.displayCurrency);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [metric, revisions.transactions, revisions.places, revisions.settings]);

  const isEmpty = data !== null && data.geojson.features.length === 0;

  return (
    <ScreenLayout>
      <HeaderBar title={t("analytics.spendingMap")} onBack={() => router.back()} />

      {/* Metric toggle */}
      <View style={styles.toggleRow}>
        <MetricButton
          active={metric === "amount"}
          label={t("analytics.metricAmount")}
          onPress={() => setMetric("amount")}
        />
        <MetricButton
          active={metric === "count"}
          label={t("analytics.metricCount")}
          onPress={() => setMetric("count")}
        />
      </View>

      {/* Banners */}
      {data?.approximate && metric === "amount" && (
        <View style={[styles.banner, { backgroundColor: colors.warning + "15" }]}>
          <AppIcon name="alert-circle-outline" size={16} color={colors.warning} />
          <AppText variant="caption" color={colors.warning} style={styles.bannerText}>
            {t("analytics.convertedAtTodaysRate", { currency: displayCurrency })}
          </AppText>
        </View>
      )}
      {data && data.missingRates.length > 0 && (
        <View style={[styles.banner, { backgroundColor: colors.danger + "15" }]}>
          <AppIcon name="alert" size={16} color={colors.danger} />
          <AppText variant="caption" color={colors.danger} style={styles.bannerText}>
            {t("analytics.missingRates", { currencies: data.missingRates.join(", ") })}
          </AppText>
        </View>
      )}
      {data && data.excludedTransactionCount > 0 && (
        <View style={[styles.banner, { backgroundColor: colors.borderLight }]}>
          <AppIcon name="map-marker-off-outline" size={16} color={colors.textTertiary} />
          <AppText variant="caption" color={colors.textTertiary} style={styles.bannerText}>
            {t("analytics.spendingMapExcluded", {
              count: data.excludedTransactionCount,
            })}
          </AppText>
        </View>
      )}

      {/* Map (or empty state) */}
      <View style={styles.mapContainer}>
        {isEmpty ? (
          <EmptyState
            icon="map-marker-off"
            title={t("analytics.spendingMapEmpty")}
            description={t("analytics.spendingMapEmptyDesc")}
          />
        ) : data ? (
          <PlacesHeatmap data={data.geojson} />
        ) : null}
      </View>
    </ScreenLayout>
  );
}

function MetricButton({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.metricButton,
        {
          backgroundColor: active ? colors.primary : colors.card,
          borderColor: active ? colors.primary : colors.border,
        },
      ]}
    >
      <AppText variant="caption" color={active ? colors.surface : colors.textSecondary}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toggleRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  metricButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  bannerText: {
    flex: 1,
  },
  mapContainer: {
    flex: 1,
  },
});
