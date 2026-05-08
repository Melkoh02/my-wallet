import { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Pressable, Modal, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScreenLayout } from "@/components/templates/ScreenLayout";
import { HeaderBar } from "@/components/templates/HeaderBar";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { Divider } from "@/components/atoms/Divider";
import { EmptyState } from "@/components/molecules/EmptyState";
import { TransactionListItem } from "@/components/organisms/TransactionListItem";
import { PlacesHeatmap } from "@/components/organisms/PlacesHeatmap";
import { useTheme } from "@/providers/ThemeProvider";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import { spacing } from "@/theme/spacing";
import {
  getPlacesAsGeoJSON,
  type HeatmapMetric,
  type PlacesHeatmapData,
} from "@/db/queries/places";
import { getTransactionsInBounds, type TransactionWithRelations } from "@/db/queries/transactions";
import { loadCurrencyConverter } from "@/services/exchangeRate.service";
import type { MapRegion } from "@/components/molecules/MapView";

export default function SpendingMapScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { revisions } = useDataRefresh();
  const [metric, setMetric] = useState<HeatmapMetric>("amount");
  const [data, setData] = useState<PlacesHeatmapData | null>(null);
  const [displayCurrency, setDisplayCurrency] = useState<string>("");

  // Latest viewport region from the heatmap. Tracked in a ref because the
  // "show all in view" button only reads it on tap — no need to re-render
  // the screen on every camera move.
  const regionRef = useRef<MapRegion | null>(null);
  const [viewportSheet, setViewportSheet] = useState<{
    visible: boolean;
    transactions: TransactionWithRelations[];
  }>({ visible: false, transactions: [] });

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

  const handlePlacePress = (placeId: number) => {
    router.push(`/place/${placeId}` as never);
  };

  const handleShowInView = async () => {
    // why: regionRef is null until the first onRegionChange fires (which
    // doesn't happen until the user pans/zooms). Falling back to a world
    // bbox lets the first tap on a freshly-opened spending map still
    // populate the sheet — at world zoom every place-tagged expense is
    // "in view" anyway.
    const bbox = regionRef.current?.bounds ?? [-180, -90, 180, 90];
    const [west, south, east, north] = bbox;
    const txns = await getTransactionsInBounds({ west, south, east, north });
    setViewportSheet({ visible: true, transactions: txns });
  };

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
          <>
            <PlacesHeatmap
              data={data.geojson}
              onPlacePress={handlePlacePress}
              onRegionChange={(region) => {
                regionRef.current = region;
              }}
            />
            {/* "Show all in view" floating button — anchored bottom-centre.
                Querying viewport bounds happens lazily on tap so a fast
                pan doesn't fire a transaction lookup per frame. */}
            <Pressable
              onPress={handleShowInView}
              style={({ pressed }) => [
                styles.showInViewButton,
                {
                  backgroundColor: pressed ? colors.primary + "CC" : colors.primary,
                },
              ]}
            >
              <AppIcon name="format-list-bulleted" size={18} color={colors.surface} />
              <AppText variant="caption" color={colors.surface}>
                {t("analytics.showAllInView")}
              </AppText>
            </Pressable>
          </>
        ) : null}
      </View>

      {/* Viewport sheet — modal listing every transaction whose place's
          coords sit inside the current map bounds. */}
      <Modal
        visible={viewportSheet.visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setViewportSheet({ visible: false, transactions: [] })}
      >
        <SafeAreaView style={[styles.sheetContainer, { backgroundColor: colors.background }]}>
          <View style={styles.sheetHeader}>
            <AppText variant="h3">{t("analytics.inViewTitle")}</AppText>
            <Pressable
              onPress={() => setViewportSheet({ visible: false, transactions: [] })}
              hitSlop={8}
            >
              <AppIcon name="close" size={24} color={colors.icon} />
            </Pressable>
          </View>
          <FlatList
            data={viewportSheet.transactions}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <TransactionListItem
                transaction={item}
                onPress={() => {
                  setViewportSheet({ visible: false, transactions: [] });
                  router.push(`/transaction/${item.id}`);
                }}
              />
            )}
            ItemSeparatorComponent={Divider}
            ListEmptyComponent={
              <EmptyState
                icon="receipt"
                title={t("analytics.inViewEmpty")}
                description={t("analytics.inViewEmptyDesc")}
              />
            }
          />
        </SafeAreaView>
      </Modal>
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
    position: "relative",
  },
  showInViewButton: {
    position: "absolute",
    bottom: spacing.lg,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  sheetContainer: {
    flex: 1,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
});
