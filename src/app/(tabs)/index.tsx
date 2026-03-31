import { useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { ScreenLayout } from "@/components/templates/ScreenLayout";
import { HeaderBar } from "@/components/templates/HeaderBar";
import { TransactionListItem } from "@/components/organisms/TransactionListItem";
import { AmountDisplay } from "@/components/molecules/AmountDisplay";
import { EmptyState } from "@/components/molecules/EmptyState";
import { AppText } from "@/components/atoms/AppText";
import { Divider } from "@/components/atoms/Divider";
import { FAB } from "@/components/atoms/FAB";
import { useTheme } from "@/providers/ThemeProvider";
import { usePrivacy } from "@/providers/PrivacyProvider";
import { useAccounts } from "@/hooks/useAccounts";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import { getMonthSummary, getRecentTransactions } from "@/db/queries/transactions";
import { formatCurrency } from "@/utils/format";
import { TRANSACTION_FAB_ACTIONS } from "@/constants/fab";
import { spacing } from "@/theme/spacing";
import type { TransactionWithRelations } from "@/db/queries/transactions";

export default function HomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { hideAmounts, toggleHideAmounts } = usePrivacy();
  const { revisions } = useDataRefresh();
  const { totals } = useAccounts();
  const [monthSummary, setMonthSummary] = useState({ income: 0, expense: 0, net: 0 });
  const [recent, setRecent] = useState<TransactionWithRelations[]>([]);

  useEffect(() => {
    const now = new Date();
    Promise.all([
      getMonthSummary(now.getFullYear(), now.getMonth() + 1),
      getRecentTransactions(5),
    ]).then(([summary, txns]) => {
      setMonthSummary(summary);
      setRecent(txns);
    });
  }, [revisions.transactions, revisions.accounts]);

  return (
    <ScreenLayout scrollable edges={["top"]}>
      <HeaderBar
        title="My Wallet"
        rightActions={[
          { icon: hideAmounts ? "eye-off" : "eye", onPress: toggleHideAmounts },
          { icon: "cog", onPress: () => router.push("/settings") },
        ]}
      />

      {/* Balance card */}
      <View style={[styles.balanceCard, { backgroundColor: colors.primary + "10" }]}>
        <AppText variant="caption" color={colors.textSecondary}>
          Net Worth ({totals.displayCurrency})
        </AppText>
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
            Income
          </AppText>
          <AppText variant="label" color={colors.income}>
            {hideAmounts ? "••••" : formatCurrency(monthSummary.income)}
          </AppText>
        </View>
        <View style={[styles.summaryItem, { backgroundColor: colors.card }]}>
          <AppText variant="caption" color={colors.textSecondary}>
            Expenses
          </AppText>
          <AppText variant="label" color={colors.expense}>
            {hideAmounts ? "••••" : formatCurrency(monthSummary.expense)}
          </AppText>
        </View>
      </View>

      {/* Recent transactions */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <AppText variant="h3">Recent</AppText>
          <AppText
            variant="bodySmall"
            color={colors.primary}
            onPress={() => router.push("/(tabs)/transactions")}
          >
            See all
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
            title="No transactions yet"
            description="Start by adding a transaction"
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
    borderRadius: 16,
    gap: spacing.xs,
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
});
