import { useEffect, useState } from "react";
import { View, Pressable, FlatList, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScreenLayout } from "@/components/templates/ScreenLayout";
import { HeaderBar } from "@/components/templates/HeaderBar";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { Divider } from "@/components/atoms/Divider";
import { FAB } from "@/components/atoms/FAB";
import { EmptyState } from "@/components/molecules/EmptyState";
import { useTheme } from "@/providers/ThemeProvider";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import { spacing } from "@/theme/spacing";
import { getPlacesWithStats, type PlaceWithStats } from "@/db/queries/places";

export default function PlacesListScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { revisions } = useDataRefresh();
  const [items, setItems] = useState<PlaceWithStats[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPlacesWithStats().then((rows) => {
      if (cancelled) return;
      setItems(rows);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [revisions.places, revisions.transactions]);

  return (
    <ScreenLayout>
      <HeaderBar title={t("places.title")} onBack={() => router.back()} />
      <FlatList
        data={items}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/place/form" as never,
                params: { id: item.id.toString() },
              })
            }
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: pressed ? colors.borderLight : "transparent" },
            ]}
          >
            <View
              style={[
                styles.iconWrap,
                {
                  backgroundColor:
                    item.latitude !== null ? colors.primary + "22" : colors.borderLight,
                },
              ]}
            >
              <AppIcon
                name={item.latitude !== null ? "map-marker" : "map-marker-off"}
                size={20}
                color={item.latitude !== null ? colors.primary : colors.iconSecondary}
              />
            </View>
            <View style={styles.text}>
              <AppText variant="body">{item.name}</AppText>
              {item.address ? (
                <AppText variant="caption" color={colors.textSecondary} numberOfLines={1}>
                  {item.address}
                </AppText>
              ) : null}
              <AppText variant="caption" color={colors.textTertiary}>
                {t("places.transactionsCount", { count: item.transactionCount })}
              </AppText>
            </View>
            <AppIcon name="chevron-right" size={20} color={colors.iconSecondary} />
          </Pressable>
        )}
        ItemSeparatorComponent={Divider}
        ListEmptyComponent={
          loaded ? (
            <EmptyState
              icon="map-marker-plus"
              title={t("places.emptyTitle")}
              description={t("places.emptyDesc")}
            />
          ) : null
        }
      />
      <FAB onPress={() => router.push("/place/form" as never)} />
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    flex: 1,
    gap: 2,
  },
});
