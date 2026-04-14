import { useEffect, useState, useCallback } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { ScreenLayout } from "@/components/templates/ScreenLayout";
import { HeaderBar } from "@/components/templates/HeaderBar";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { EmptyState } from "@/components/molecules/EmptyState";
import { useTheme } from "@/providers/ThemeProvider";
import { usePrivacy } from "@/providers/PrivacyProvider";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import { useAccounts } from "@/hooks/useAccounts";
import { getMonthSummary, getDailySpending, getCategorySummary } from "@/db/queries/transactions";
import { formatCurrency } from "@/utils/format";
import { translateCategoryName } from "@/constants/categories";
import { spacing } from "@/theme/spacing";

export default function AnalyticsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { hideAmounts, maskAmount } = usePrivacy();
  const { revisions } = useDataRefresh();
  const { totals } = useAccounts();
  const dc = totals.displayCurrency;

  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);

  const [summary, setSummary] = useState({ income: 0, expense: 0, net: 0 });
  const [categoryData, setCategoryData] = useState<
    { categoryName: string; categoryColor: string; categoryIcon: string; total: number }[]
  >([]);
  const [dailyData, setDailyData] = useState<{ date: string; total: number }[]>([]);

  const loadData = useCallback(async () => {
    const [s, c, d] = await Promise.all([
      getMonthSummary(year, month),
      getCategorySummary(year, month),
      getDailySpending(year, month),
    ]);
    setSummary(s);
    setCategoryData(c);
    setDailyData(d);
  }, [year, month]);

  useEffect(() => {
    loadData();
  }, [loadData, revisions.transactions]);

  const goToPrevMonth = () => {
    if (month === 1) {
      setMonth(12);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
  };

  const goToNextMonth = () => {
    if (month === 12) {
      setMonth(1);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
  };

  const maxCategory = categoryData.length > 0 ? categoryData[0].total : 0;
  const maxDaily = dailyData.length > 0 ? Math.max(...dailyData.map((d) => d.total)) : 0;
  const hasData = summary.income > 0 || summary.expense > 0;

  return (
    <ScreenLayout scrollable edges={["top"]}>
      <HeaderBar title={t("analytics.title")} />

      {/* Month selector */}
      <View style={[styles.monthSelector, { backgroundColor: colors.card }]}>
        <Pressable onPress={goToPrevMonth} hitSlop={12}>
          <AppIcon name="chevron-left" size={28} color={colors.primary} />
        </Pressable>
        <AppText variant="h3">
          {new Date(year, month - 1).toLocaleDateString(undefined, { month: "short" })} {year}
        </AppText>
        <Pressable onPress={goToNextMonth} hitSlop={12}>
          <AppIcon name="chevron-right" size={28} color={colors.primary} />
        </Pressable>
      </View>

      {!hasData ? (
        <EmptyState icon="chart-bar" title={t("analytics.noData")} />
      ) : (
        <>
          {/* Monthly overview */}
          <View style={styles.section}>
            <AppText variant="h3" style={styles.sectionTitle}>
              {t("analytics.monthlyOverview")}
            </AppText>
            <View style={[styles.overviewCard, { backgroundColor: colors.card }]}>
              <View style={styles.overviewRow}>
                <AppText variant="bodySmall" color={colors.textSecondary}>
                  {t("home.income")}
                </AppText>
                <AppText variant="label" color={colors.income}>
                  {hideAmounts ? "••••" : formatCurrency(maskAmount(summary.income), dc)}
                </AppText>
              </View>
              <View style={styles.overviewRow}>
                <AppText variant="bodySmall" color={colors.textSecondary}>
                  {t("home.expenses")}
                </AppText>
                <AppText variant="label" color={colors.expense}>
                  {hideAmounts ? "••••" : formatCurrency(maskAmount(summary.expense), dc)}
                </AppText>
              </View>
              <View style={[styles.overviewRow, styles.netRow, { borderTopColor: colors.border }]}>
                <AppText variant="bodySmall" color={colors.textSecondary}>
                  {t("analytics.net")}
                </AppText>
                <AppText variant="label" color={summary.net >= 0 ? colors.income : colors.expense}>
                  {hideAmounts ? "••••" : formatCurrency(maskAmount(summary.net), dc)}
                </AppText>
              </View>
            </View>
          </View>

          {/* Category breakdown */}
          {categoryData.length > 0 && (
            <View style={styles.section}>
              <AppText variant="h3" style={styles.sectionTitle}>
                {t("analytics.categoryBreakdown")}
              </AppText>
              <View style={[styles.listCard, { backgroundColor: colors.card }]}>
                {categoryData.map((cat, i) => {
                  const pct = maxCategory > 0 ? (cat.total / maxCategory) * 100 : 0;
                  return (
                    <View
                      key={cat.categoryName}
                      style={[
                        styles.categoryRow,
                        i > 0 && { borderTopColor: colors.borderLight, borderTopWidth: 1 },
                      ]}
                    >
                      <View style={styles.categoryHeader}>
                        <View style={styles.categoryLabel}>
                          <View
                            style={[styles.categoryDot, { backgroundColor: cat.categoryColor }]}
                          />
                          <AppIcon name={cat.categoryIcon} size={18} color={cat.categoryColor} />
                          <AppText variant="body" numberOfLines={1} style={styles.categoryName}>
                            {cat.categoryName === "__uncategorized__"
                              ? t("analytics.uncategorized")
                              : translateCategoryName(cat.categoryName, t)}
                          </AppText>
                        </View>
                        <AppText variant="label" color={colors.text}>
                          {hideAmounts ? "••••" : formatCurrency(maskAmount(cat.total), dc)}
                        </AppText>
                      </View>
                      <View style={[styles.barBackground, { backgroundColor: colors.borderLight }]}>
                        <View
                          style={[
                            styles.barFill,
                            {
                              backgroundColor: cat.categoryColor,
                              width: `${pct}%`,
                            },
                          ]}
                        />
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* Daily spending */}
          {dailyData.length > 0 && (
            <View style={styles.section}>
              <AppText variant="h3" style={styles.sectionTitle}>
                {t("analytics.dailySpending")}
              </AppText>
              <View style={[styles.listCard, { backgroundColor: colors.card }]}>
                {dailyData.map((day, i) => {
                  const pct = maxDaily > 0 ? (day.total / maxDaily) * 100 : 0;
                  const dayNum = day.date.split("-")[2];
                  return (
                    <View
                      key={day.date}
                      style={[
                        styles.dailyRow,
                        i > 0 && { borderTopColor: colors.borderLight, borderTopWidth: 1 },
                      ]}
                    >
                      <AppText
                        variant="caption"
                        color={colors.textSecondary}
                        style={styles.dayLabel}
                      >
                        {dayNum}
                      </AppText>
                      <View style={styles.dailyBarContainer}>
                        <View
                          style={[styles.barBackground, { backgroundColor: colors.borderLight }]}
                        >
                          <View
                            style={[
                              styles.barFill,
                              {
                                backgroundColor: colors.expense,
                                width: `${pct}%`,
                              },
                            ]}
                          />
                        </View>
                      </View>
                      <AppText variant="caption" color={colors.text} style={styles.dailyAmount}>
                        {hideAmounts ? "••••" : formatCurrency(maskAmount(day.total), dc)}
                      </AppText>
                    </View>
                  );
                })}
              </View>
            </View>
          )}
        </>
      )}

      {/* Bottom spacing */}
      <View style={styles.bottomPad} />
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  monthSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: 12,
  },
  section: {
    paddingTop: spacing.xl,
  },
  sectionTitle: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  overviewCard: {
    marginHorizontal: spacing.lg,
    borderRadius: 12,
    padding: spacing.lg,
    gap: spacing.md,
  },
  overviewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  netRow: {
    borderTopWidth: 1,
    paddingTop: spacing.md,
  },
  listCard: {
    marginHorizontal: spacing.lg,
    borderRadius: 12,
    padding: spacing.lg,
  },
  categoryRow: {
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  categoryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  categoryLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
    marginRight: spacing.md,
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  categoryName: {
    flex: 1,
  },
  barBackground: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  barFill: {
    height: 6,
    borderRadius: 3,
  },
  dailyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  dayLabel: {
    width: 24,
    textAlign: "right",
  },
  dailyBarContainer: {
    flex: 1,
  },
  dailyAmount: {
    width: 72,
    textAlign: "right",
  },
  bottomPad: {
    height: spacing["3xl"],
  },
});
