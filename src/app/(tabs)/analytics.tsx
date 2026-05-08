import { useEffect, useState, useCallback } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScreenLayout } from "@/components/templates/ScreenLayout";
import { HeaderBar } from "@/components/templates/HeaderBar";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { AmountDisplay } from "@/components/molecules/AmountDisplay";
import { EmptyState } from "@/components/molecules/EmptyState";
import { HelpModal } from "@/components/molecules/HelpModal";
import { useTheme } from "@/providers/ThemeProvider";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import { useAccounts } from "@/hooks/useAccounts";
import {
  getMonthSummary,
  getDailySpending,
  getCategorySummary,
  getTrendData,
  getTopContactsByMonth,
  type TrendPoint,
} from "@/db/queries/transactions";
import { loadCurrencyConverter } from "@/services/exchangeRate.service";
import { translateCategoryName } from "@/constants/categories";
import { spacing } from "@/theme/spacing";

export default function AnalyticsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { revisions } = useDataRefresh();
  const { totals } = useAccounts();
  const dc = totals.displayCurrency;

  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);

  const [summary, setSummary] = useState({ income: 0, expense: 0, net: 0 });
  const [prevSummary, setPrevSummary] = useState({ income: 0, expense: 0, net: 0 });
  const [categoryData, setCategoryData] = useState<
    { categoryName: string; categoryColor: string; categoryIcon: string; total: number }[]
  >([]);
  const [dailyData, setDailyData] = useState<{ date: string; total: number }[]>([]);
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [topContacts, setTopContacts] = useState<
    { contactId: string; contactName: string; total: number; count: number }[]
  >([]);
  const [missingRates, setMissingRates] = useState<string[]>([]);
  const [usedTodaysRate, setUsedTodaysRate] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const loadData = useCallback(async () => {
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const conv = await loadCurrencyConverter();
    const [s, c, d, trend, contacts, pv] = await Promise.all([
      getMonthSummary(year, month, conv),
      getCategorySummary(year, month, conv),
      getDailySpending(year, month, conv),
      getTrendData(6, conv),
      getTopContactsByMonth(year, month, conv, 3),
      getMonthSummary(prevYear, prevMonth, conv),
    ]);
    setSummary({ income: s.income, expense: s.expense, net: s.net });
    setCategoryData(c.rows);
    setDailyData(d.rows);
    setTrendData(trend.rows);
    setTopContacts(contacts.rows);
    setPrevSummary({ income: pv.income, expense: pv.expense, net: pv.net });
    const allMissing = new Set<string>([
      ...s.missingRates,
      ...c.missingRates,
      ...d.missingRates,
      ...trend.missingRates,
      ...contacts.missingRates,
      ...pv.missingRates,
    ]);
    setMissingRates([...allMissing]);
    setUsedTodaysRate(
      s.usedTodaysRate ||
        c.usedTodaysRate ||
        d.usedTodaysRate ||
        trend.usedTodaysRate ||
        contacts.usedTodaysRate ||
        pv.usedTodaysRate,
    );
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

  const savingsRate =
    summary.income > 0 ? ((summary.income - summary.expense) / summary.income) * 100 : null;
  const expenseChange =
    prevSummary.expense > 0
      ? ((summary.expense - prevSummary.expense) / prevSummary.expense) * 100
      : null;

  const now = new Date();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
  const projection = (() => {
    if (!isCurrentMonth || dailyData.length === 0 || summary.expense === 0) return null;
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(year, month, 0).getDate();
    if (dayOfMonth >= daysInMonth) return null;
    return (summary.expense / dayOfMonth) * daysInMonth;
  })();

  const hasInsights = savingsRate != null || expenseChange != null || projection != null;
  const trendMax = trendData.length
    ? Math.max(...trendData.flatMap((t) => [t.income, t.expense]), 1)
    : 1;

  return (
    <ScreenLayout scrollable edges={["top"]}>
      <HeaderBar
        title={t("analytics.title")}
        rightIcon="help-circle-outline"
        onRightPress={() => setShowHelp(true)}
      />

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

      {/* Currency banner — surfaces the conversion situation */}
      {(missingRates.length > 0 || usedTodaysRate) && (
        <View
          style={[
            styles.currencyBanner,
            {
              backgroundColor:
                missingRates.length > 0 ? colors.danger + "15" : colors.primary + "12",
            },
          ]}
        >
          <AppIcon
            name={missingRates.length > 0 ? "alert-circle-outline" : "information-outline"}
            size={18}
            color={missingRates.length > 0 ? colors.danger : colors.primary}
          />
          <AppText
            variant="caption"
            color={missingRates.length > 0 ? colors.danger : colors.textSecondary}
            style={styles.currencyBannerText}
          >
            {missingRates.length > 0
              ? t("analytics.missingRates", { currencies: missingRates.join(", ") })
              : t("analytics.convertedAtTodaysRate", { currency: dc })}
          </AppText>
        </View>
      )}

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
                <AmountDisplay
                  amount={summary.income}
                  currency={dc}
                  approximate={usedTodaysRate}
                  type="income"
                  variant="label"
                />
              </View>
              <View style={styles.overviewRow}>
                <AppText variant="bodySmall" color={colors.textSecondary}>
                  {t("home.expenses")}
                </AppText>
                <AmountDisplay
                  amount={summary.expense}
                  currency={dc}
                  approximate={usedTodaysRate}
                  type="expense"
                  variant="label"
                />
              </View>
              <View style={[styles.overviewRow, styles.netRow, { borderTopColor: colors.border }]}>
                <AppText variant="bodySmall" color={colors.textSecondary}>
                  {t("analytics.net")}
                </AppText>
                <AmountDisplay
                  amount={summary.net}
                  currency={dc}
                  approximate={usedTodaysRate}
                  type={summary.net >= 0 ? "income" : "expense"}
                  variant="label"
                />
              </View>
            </View>
          </View>

          {/* Spending map entry — fullscreen heatmap of place-tagged expenses.
              Sits high in the screen so the user finds it without scrolling. */}
          <View style={styles.section}>
            <Pressable
              onPress={() => router.push("/analytics/places-map" as never)}
              style={({ pressed }) => [
                styles.spendingMapCard,
                {
                  backgroundColor: pressed ? colors.borderLight : colors.card,
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={[styles.spendingMapIcon, { backgroundColor: colors.primary + "22" }]}>
                <AppIcon name="map-search" size={22} color={colors.primary} />
              </View>
              <View style={styles.spendingMapText}>
                <AppText variant="label">{t("analytics.spendingMap")}</AppText>
                <AppText variant="caption" color={colors.textSecondary}>
                  {t("analytics.spendingMapDesc")}
                </AppText>
              </View>
              <AppIcon name="chevron-right" size={20} color={colors.iconSecondary} />
            </Pressable>
          </View>

          {/* Insights: savings rate, MoM change, projection */}
          {hasInsights && (
            <View style={styles.section}>
              <AppText variant="h3" style={styles.sectionTitle}>
                {t("analytics.insights")}
              </AppText>
              <View style={[styles.overviewCard, { backgroundColor: colors.card }]}>
                {savingsRate != null && (
                  <View style={styles.overviewRow}>
                    <View style={styles.insightLabel}>
                      <AppIcon name="piggy-bank" size={18} color={colors.income} />
                      <AppText variant="bodySmall" color={colors.textSecondary}>
                        {t("analytics.savingsRate")}
                      </AppText>
                    </View>
                    <AppText
                      variant="label"
                      color={savingsRate >= 0 ? colors.income : colors.expense}
                    >
                      {savingsRate.toFixed(0)}%
                    </AppText>
                  </View>
                )}
                {expenseChange != null && (
                  <View style={styles.overviewRow}>
                    <View style={styles.insightLabel}>
                      <AppIcon
                        name={expenseChange > 0 ? "trending-up" : "trending-down"}
                        size={18}
                        color={expenseChange > 0 ? colors.expense : colors.income}
                      />
                      <AppText variant="bodySmall" color={colors.textSecondary}>
                        {t("analytics.vsLastMonth")}
                      </AppText>
                    </View>
                    <AppText
                      variant="label"
                      color={expenseChange > 0 ? colors.expense : colors.income}
                    >
                      {expenseChange > 0 ? "+" : ""}
                      {expenseChange.toFixed(0)}%
                    </AppText>
                  </View>
                )}
                {projection != null && (
                  <View style={styles.overviewRow}>
                    <View style={styles.insightLabel}>
                      <AppIcon name="chart-timeline-variant" size={18} color={colors.primary} />
                      <AppText variant="bodySmall" color={colors.textSecondary}>
                        {t("analytics.projected")}
                      </AppText>
                    </View>
                    <AmountDisplay
                      amount={projection}
                      currency={dc}
                      approximate={usedTodaysRate}
                      variant="label"
                    />
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Last 6 months trend */}
          {trendData.length > 0 && (
            <View style={styles.section}>
              <AppText variant="h3" style={styles.sectionTitle}>
                {t("analytics.lastSixMonths")}
              </AppText>
              <View style={[styles.listCard, { backgroundColor: colors.card }]}>
                {trendData.map((tp, i) => {
                  const monthLabel = new Date(tp.year, tp.month - 1).toLocaleDateString(undefined, {
                    month: "short",
                  });
                  const incomePct = (tp.income / trendMax) * 100;
                  const expensePct = (tp.expense / trendMax) * 100;
                  const net = tp.income - tp.expense;
                  return (
                    <View
                      key={`${tp.year}-${tp.month}`}
                      style={[
                        styles.trendRow,
                        i > 0 && { borderTopColor: colors.borderLight, borderTopWidth: 1 },
                      ]}
                    >
                      <View style={styles.trendHeader}>
                        <AppText variant="label">{monthLabel}</AppText>
                        <AmountDisplay
                          amount={net}
                          currency={dc}
                          approximate={usedTodaysRate}
                          type={net >= 0 ? "income" : "expense"}
                          variant="caption"
                        />
                      </View>
                      <View style={styles.trendBars}>
                        <View style={[styles.trendBarBg, { backgroundColor: colors.borderLight }]}>
                          <View
                            style={[
                              styles.trendBarFill,
                              { backgroundColor: colors.income, width: `${incomePct}%` },
                            ]}
                          />
                        </View>
                        <View style={[styles.trendBarBg, { backgroundColor: colors.borderLight }]}>
                          <View
                            style={[
                              styles.trendBarFill,
                              { backgroundColor: colors.expense, width: `${expensePct}%` },
                            ]}
                          />
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

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
                        <AmountDisplay
                          amount={cat.total}
                          currency={dc}
                          approximate={usedTodaysRate}
                          variant="label"
                        />
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
                      <View style={styles.dailyAmount}>
                        <AmountDisplay
                          amount={day.total}
                          currency={dc}
                          approximate={usedTodaysRate}
                          variant="caption"
                        />
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}
        </>
      )}

      {hasData && topContacts.length > 0 && (
        <View style={styles.section}>
          <AppText variant="h3" style={styles.sectionTitle}>
            {t("analytics.topContacts")}
          </AppText>
          <View style={[styles.listCard, { backgroundColor: colors.card }]}>
            {topContacts.map((tc, i) => (
              <View
                key={tc.contactId}
                style={[
                  styles.contactRow,
                  i > 0 && { borderTopColor: colors.borderLight, borderTopWidth: 1 },
                ]}
              >
                <View style={styles.contactLabel}>
                  <AppIcon name="account-circle" size={22} color={colors.primary} />
                  <AppText variant="body" numberOfLines={1} style={styles.contactName}>
                    {tc.contactName}
                  </AppText>
                </View>
                <View style={styles.contactMeta}>
                  <AmountDisplay
                    amount={tc.total}
                    currency={dc}
                    approximate={usedTodaysRate}
                    variant="label"
                  />
                  <AppText variant="caption" color={colors.textSecondary}>
                    {tc.count === 1
                      ? t("analytics.oneTransaction")
                      : t("analytics.nTransactions", { count: tc.count })}
                  </AppText>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Bottom spacing */}
      <View style={styles.bottomPad} />
      <HelpModal
        visible={showHelp}
        title={t("analytics.title")}
        helpKey="analytics"
        onClose={() => setShowHelp(false)}
      />
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
  currencyBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: 10,
  },
  currencyBannerText: {
    flex: 1,
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
  spendingMapCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
  },
  spendingMapIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  spendingMapText: {
    flex: 1,
    gap: 2,
  },
  insightLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  trendRow: {
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  trendHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  trendBars: {
    gap: 3,
  },
  trendBarBg: {
    height: 5,
    borderRadius: 2.5,
    overflow: "hidden",
  },
  trendBarFill: {
    height: 5,
    borderRadius: 2.5,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  contactLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  contactName: {
    flex: 1,
  },
  contactMeta: {
    alignItems: "flex-end",
    gap: 2,
  },
});
