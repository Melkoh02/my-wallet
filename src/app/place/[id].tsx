import { useEffect, useState } from "react";
import { View, FlatList, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScreenLayout } from "@/components/templates/ScreenLayout";
import { HeaderBar } from "@/components/templates/HeaderBar";
import { TransactionListItem } from "@/components/organisms/TransactionListItem";
import { EmptyState } from "@/components/molecules/EmptyState";
import { Divider } from "@/components/atoms/Divider";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { useTheme } from "@/providers/ThemeProvider";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import { spacing } from "@/theme/spacing";
import { getPlaceById } from "@/db/queries/places";
import { getTransactionsForPlace, type TransactionWithRelations } from "@/db/queries/transactions";
import type { Place } from "@/db/schema";

export default function PlaceDetailScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { revisions } = useDataRefresh();
  const params = useLocalSearchParams<{ id: string }>();
  const placeId = params.id ? parseInt(params.id, 10) : null;

  const [place, setPlace] = useState<Place | null>(null);
  const [transactions, setTransactions] = useState<TransactionWithRelations[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (placeId === null) return;
    let cancelled = false;
    (async () => {
      const [p, txns] = await Promise.all([
        getPlaceById(placeId),
        getTransactionsForPlace(placeId),
      ]);
      if (cancelled) return;
      setPlace(p ?? null);
      setTransactions(txns);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [placeId, revisions.places, revisions.transactions]);

  if (!loaded || !place) {
    return (
      <ScreenLayout>
        <HeaderBar title={t("places.editTitle")} onBack={() => router.back()} />
      </ScreenLayout>
    );
  }

  const hasCoords = place.latitude !== null && place.longitude !== null;

  return (
    <ScreenLayout>
      <HeaderBar
        title={place.name}
        onBack={() => router.back()}
        rightIcon="pencil"
        onRightPress={() =>
          router.push({
            pathname: "/place/form" as never,
            params: { id: place.id.toString() },
          })
        }
      />

      {/* Place header card — name, address (if any), coords (if any), archived
          banner. Shows even when there are zero transactions so the user can
          still see what they're looking at. */}
      <View
        style={[styles.headerCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        <View style={styles.headerRow}>
          <AppIcon
            name={hasCoords ? "map-marker" : "map-marker-off"}
            size={20}
            color={hasCoords ? colors.primary : colors.iconSecondary}
          />
          <View style={styles.headerText}>
            {place.address ? (
              <AppText variant="caption" color={colors.textSecondary}>
                {place.address}
              </AppText>
            ) : null}
            {hasCoords ? (
              <AppText variant="caption" color={colors.textTertiary}>
                {place.latitude!.toFixed(5)}, {place.longitude!.toFixed(5)}
              </AppText>
            ) : (
              <AppText variant="caption" color={colors.textTertiary}>
                {t("places.noCoords")}
              </AppText>
            )}
          </View>
        </View>
        {!place.isActive && (
          <AppText variant="caption" color={colors.warning}>
            {t("places.archivedBanner")}
          </AppText>
        )}
      </View>

      {/* Transactions list */}
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <TransactionListItem
            transaction={item}
            onPress={() => router.push(`/transaction/${item.id}`)}
          />
        )}
        ItemSeparatorComponent={Divider}
        ListEmptyComponent={
          <EmptyState
            icon="receipt"
            title={t("places.detailEmptyTitle")}
            description={t("places.detailEmptyDesc")}
          />
        }
      />
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  headerCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
});
