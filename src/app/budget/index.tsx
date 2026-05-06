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
import { AmountDisplay } from "@/components/molecules/AmountDisplay";
import { useTheme } from "@/providers/ThemeProvider";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import { spacing } from "@/theme/spacing";
import { getBudgetsWithSpend, type BudgetWithSpend } from "@/db/queries/budgets";

/**
 * Pick a progress-bar colour from the percentage used. Buckets:
 *   - <= 80%   → success-ish (theme.income)
 *   - 81–100%  → warning (theme.transfer / accent)
 *   - > 100%   → danger
 */
function progressColor(percentUsed: number, colors: ReturnType<typeof useTheme>["colors"]) {
  if (percentUsed > 100) return colors.danger;
  if (percentUsed > 80) return colors.transfer;
  return colors.income;
}

export default function BudgetsListScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { revisions } = useDataRefresh();
  const [budgets, setBudgets] = useState<BudgetWithSpend[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Recompute on any of the dependencies that affect spend: budgets
  // themselves, transactions (for spend), settings (display currency change),
  // categories/subcategories (for display labels).
  useEffect(() => {
    let cancelled = false;
    getBudgetsWithSpend().then((rows) => {
      if (cancelled) return;
      setBudgets(rows);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [revisions.budgets, revisions.transactions, revisions.settings, revisions.categories]);

  return (
    <ScreenLayout>
      <HeaderBar title={t("budgets.title")} onBack={() => router.back()} />
      <FlatList
        data={budgets}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => {
          const barColor = progressColor(item.percentUsed, colors);
          const fillWidth = `${Math.min(100, item.percentUsed)}%` as const;
          return (
            <Pressable
              onPress={() =>
                router.push(
                  // typed-routes hasn't regenerated for /budget/form yet — cast
                  // to never matches the existing /template, /contact patterns.
                  { pathname: "/budget/form" as never, params: { id: item.id.toString() } },
                )
              }
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: pressed ? colors.borderLight : "transparent" },
              ]}
            >
              <View style={styles.headerRow}>
                <View style={[styles.iconWrap, { backgroundColor: item.categoryColor + "22" }]}>
                  <AppIcon name={item.categoryIcon} size={20} color={item.categoryColor} />
                </View>
                <View style={styles.headerText}>
                  <AppText variant="body">{item.name}</AppText>
                  <AppText variant="caption" color={colors.textSecondary}>
                    {item.subcategoryName
                      ? `${item.categoryName} · ${item.subcategoryName}`
                      : item.categoryName}
                  </AppText>
                </View>
                <AppIcon name="chevron-right" size={20} color={colors.iconSecondary} />
              </View>

              <View style={[styles.barTrack, { backgroundColor: colors.borderLight }]}>
                <View style={[styles.barFill, { backgroundColor: barColor, width: fillWidth }]} />
              </View>

              <View style={styles.amountRow}>
                <AmountDisplay
                  amount={item.spend}
                  currency={item.resolvedCurrency}
                  approximate={item.approximate}
                  variant="bodySmall"
                />
                <AppText variant="bodySmall" color={colors.textSecondary}>
                  {" / "}
                </AppText>
                <AmountDisplay
                  amount={item.amount}
                  currency={item.resolvedCurrency}
                  variant="bodySmall"
                />
                <View style={styles.flexSpacer} />
                <AppText
                  variant="bodySmall"
                  color={item.percentUsed > 100 ? colors.danger : colors.textSecondary}
                >
                  {t("budgets.percentUsed", { percent: item.percentUsed })}
                </AppText>
              </View>

              {item.missingRates.length > 0 && (
                <AppText variant="caption" color={colors.textTertiary}>
                  {t("analytics.missingRates", { currencies: item.missingRates.join(", ") })}
                </AppText>
              )}
            </Pressable>
          );
        }}
        ItemSeparatorComponent={Divider}
        ListEmptyComponent={
          loaded ? (
            <EmptyState
              icon="wallet-plus"
              title={t("budgets.emptyTitle")}
              description={t("budgets.emptyDesc")}
            />
          ) : null
        }
      />
      <FAB onPress={() => router.push("/budget/form" as never)} />
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  barTrack: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 4,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  flexSpacer: {
    flex: 1,
  },
});
