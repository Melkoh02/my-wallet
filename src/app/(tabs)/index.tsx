import { useEffect, useState } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScreenLayout } from "@/components/templates/ScreenLayout";
import { HeaderBar } from "@/components/templates/HeaderBar";
import { TransactionListItem } from "@/components/organisms/TransactionListItem";
import { AmountDisplay } from "@/components/molecules/AmountDisplay";
import { EmptyState } from "@/components/molecules/EmptyState";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { Divider } from "@/components/atoms/Divider";
import { FAB } from "@/components/atoms/FAB";
import { useTheme } from "@/providers/ThemeProvider";
import { usePrivacy } from "@/providers/PrivacyProvider";
import { useAccounts } from "@/hooks/useAccounts";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import { getMonthSummary, getRecentTransactions } from "@/db/queries/transactions";
import { getRecurringTransactions } from "@/db/queries/recurring";
import { formatCurrency, formatDate } from "@/utils/format";
import { TRANSACTION_FAB_ACTIONS } from "@/constants/fab";
import { spacing } from "@/theme/spacing";
import type { TransactionWithRelations } from "@/db/queries/transactions";
import type { RecurringTransaction } from "@/db/schema";

export default function HomeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { hideAmounts, toggleHideAmounts, maskAmount } = usePrivacy();
  const { revisions } = useDataRefresh();
  const { totals } = useAccounts();
  const [monthSummary, setMonthSummary] = useState({ income: 0, expense: 0, net: 0 });
  const [recent, setRecent] = useState<TransactionWithRelations[]>([]);
  const [upcoming, setUpcoming] = useState<RecurringTransaction[]>([]);

  useEffect(() => {
    const now = new Date();
    Promise.all([
      getMonthSummary(now.getFullYear(), now.getMonth() + 1),
      getRecentTransactions(5),
      getRecurringTransactions(true),
    ]).then(([summary, txns, recurring]) => {
      setMonthSummary(summary);
      setRecent(txns);
      // Show up to 3 upcoming recurring, sorted by next date
      setUpcoming(recurring.slice(0, 3));
    });
  }, [revisions.transactions, revisions.accounts, revisions.recurring]);

  return (
    <ScreenLayout scrollable edges={["top"]}>
      <HeaderBar
        title={t("home.title")}
        rightIcon="cog"
        onRightPress={() => router.push("/settings")}
      />

      {/* Balance card with eye toggle */}
      <View style={[styles.balanceCard, { backgroundColor: colors.primary + "10" }]}>
        <View style={styles.balanceHeader}>
          <AppText variant="caption" color={colors.textSecondary}>
            {t("home.netWorth")} ({totals.displayCurrency})
          </AppText>
          <Pressable onPress={toggleHideAmounts} hitSlop={8}>
            <AppIcon
              name={hideAmounts ? "eye-off" : "eye"}
              size={20}
              color={colors.iconSecondary}
            />
          </Pressable>
        </View>
        <AmountDisplay
          amount={totals.netWorth}
          currency={totals.displayCurrency}
          variant="amountLarge"
        />
      </View>

      {/* Month summary */}
      <View style={styles.summaryRow}>
        <View style={[styles.summaryItem, { backgroundColor: colors.card }]}>
          <AppText variant="caption" color={colors.textSecondary}>
            {t("home.income")}
          </AppText>
          <AppText variant="label" color={colors.income}>
            {hideAmounts ? "••••" : formatCurrency(maskAmount(monthSummary.income))}
          </AppText>
        </View>
        <View style={[styles.summaryItem, { backgroundColor: colors.card }]}>
          <AppText variant="caption" color={colors.textSecondary}>
            {t("home.expenses")}
          </AppText>
          <AppText variant="label" color={colors.expense}>
            {hideAmounts ? "••••" : formatCurrency(maskAmount(monthSummary.expense))}
          </AppText>
        </View>
      </View>

      {/* Upcoming recurring */}
      {upcoming.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <AppText variant="h3">{t("home.upcoming")}</AppText>
            <AppText
              variant="bodySmall"
              color={colors.primary}
              onPress={() => router.push("/recurring")}
            >
              {t("home.seeAll")}
            </AppText>
          </View>
          {upcoming.map((item, i) => {
            const typeColor = item.type === "income" ? colors.income : colors.expense;
            return (
              <View key={item.id}>
                {i > 0 && <Divider />}
                <View style={styles.upcomingRow}>
                  <View style={[styles.upcomingIcon, { backgroundColor: typeColor + "18" }]}>
                    <AppIcon
                      name={item.type === "income" ? "arrow-down" : "arrow-up"}
                      size={18}
                      color={typeColor}
                    />
                  </View>
                  <View style={styles.upcomingInfo}>
                    <AppText variant="label" numberOfLines={1}>
                      {item.description}
                    </AppText>
                    <AppText variant="caption" color={colors.textTertiary}>
                      {t("recurring." + item.frequency)} · {formatDate(item.nextDate)}
                    </AppText>
                  </View>
                  <AmountDisplay
                    amount={item.amount}
                    type={item.type as "income" | "expense"}
                    variant="label"
                  />
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Recent transactions */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <AppText variant="h3">{t("home.recent")}</AppText>
          <AppText
            variant="bodySmall"
            color={colors.primary}
            onPress={() => router.push("/(tabs)/transactions")}
          >
            {t("home.seeAll")}
          </AppText>
        </View>
        {recent.length > 0 ? (
          recent.map((txn, i) => (
            <View key={txn.id}>
              {i > 0 && <Divider />}
              <TransactionListItem
                transaction={txn}
                onPress={() => router.push(`/transaction/${txn.id}`)}
              />
            </View>
          ))
        ) : (
          <EmptyState
            icon="swap-horizontal"
            title={t("home.noTransactionsYet")}
            description={t("home.startByAdding")}
          />
        )}
      </View>
      <FAB
        actions={TRANSACTION_FAB_ACTIONS}
        onAction={(key) => router.push(`/transaction/form?type=${key}`)}
      />
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  balanceCard: {
    alignItems: "center",
    marginHorizontal: spacing.lg,
    paddingVertical: spacing["2xl"],
    paddingHorizontal: spacing.lg,
    borderRadius: 16,
    gap: spacing.xs,
  },
  balanceHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  summaryRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  summaryItem: {
    flex: 1,
    padding: spacing.lg,
    borderRadius: 12,
    gap: spacing.xs,
  },
  section: {
    paddingTop: spacing.xl,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  upcomingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  upcomingIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  upcomingInfo: {
    flex: 1,
    gap: 2,
  },
});
