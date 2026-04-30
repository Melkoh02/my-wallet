import { useEffect, useState } from "react";
import { View, Pressable, Modal, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScreenLayout } from "@/components/templates/ScreenLayout";
import { HelpModal } from "@/components/molecules/HelpModal";
import { HeaderBar } from "@/components/templates/HeaderBar";
import { TransactionListItem } from "@/components/organisms/TransactionListItem";
import { AmountDisplay } from "@/components/molecules/AmountDisplay";
import { EmptyState } from "@/components/molecules/EmptyState";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { AppButton } from "@/components/atoms/AppButton";
import { Divider } from "@/components/atoms/Divider";
import { FAB } from "@/components/atoms/FAB";
import { useTheme } from "@/providers/ThemeProvider";
import { usePrivacy } from "@/providers/PrivacyProvider";
import { useAccounts } from "@/hooks/useAccounts";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import { getMonthSummary, getRecentTransactions } from "@/db/queries/transactions";
import { getSmartUpcoming } from "@/db/queries/recurring";
import { getAccounts } from "@/db/queries/accounts";
import { loadCurrencyConverter } from "@/services/exchangeRate.service";
import { formatDate } from "@/utils/format";
import { TRANSACTION_FAB_ACTIONS } from "@/constants/fab";
import { spacing } from "@/theme/spacing";
import type { TransactionWithRelations } from "@/db/queries/transactions";
import type { RecurringWithAccount } from "@/db/queries/recurring";

export default function HomeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { hideAmounts, toggleHideAmounts } = usePrivacy();
  const { revisions } = useDataRefresh();
  const { totals } = useAccounts();
  const [monthSummary, setMonthSummary] = useState({
    income: 0,
    expense: 0,
    net: 0,
    usedTodaysRate: false,
  });
  const [recent, setRecent] = useState<TransactionWithRelations[]>([]);
  const [upcoming, setUpcoming] = useState<RecurringWithAccount[]>([]);
  const [showNoAccountModal, setShowNoAccountModal] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const now = new Date();
    (async () => {
      const conv = await loadCurrencyConverter();
      const [summary, txns, upcomingItems] = await Promise.all([
        getMonthSummary(now.getFullYear(), now.getMonth() + 1, conv),
        getRecentTransactions(5),
        getSmartUpcoming(3),
      ]);
      setMonthSummary({
        income: summary.income,
        expense: summary.expense,
        net: summary.net,
        usedTodaysRate: summary.usedTodaysRate,
      });
      setRecent(txns);
      setUpcoming(upcomingItems);
    })();
  }, [revisions.transactions, revisions.accounts, revisions.recurring]);

  const handleFabAction = async (key: string) => {
    const accs = await getAccounts(true);
    if (accs.length === 0) {
      setShowNoAccountModal(true);
      return;
    }
    router.push(`/transaction/form?type=${key}`);
  };

  return (
    <ScreenLayout scrollable edges={["top"]}>
      <HeaderBar
        title={t("home.title")}
        leftIcon="cog"
        onLeftPress={() => router.push("/settings")}
        rightIcon="help-circle-outline"
        onRightPress={() => setShowHelp(true)}
      />

      {/* Balance card with eye toggle */}
      <View style={[styles.balanceCard, { backgroundColor: colors.primary + "10" }]}>
        <AppText variant="caption" color={colors.textSecondary}>
          {t("home.netWorth")} ({totals.displayCurrency})
        </AppText>
        <Pressable onPress={toggleHideAmounts} hitSlop={8} style={styles.eyeButton}>
          <AppIcon name={hideAmounts ? "eye-off" : "eye"} size={20} color={colors.iconSecondary} />
        </Pressable>
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
          <AmountDisplay
            amount={monthSummary.income}
            currency={totals.displayCurrency}
            approximate={monthSummary.usedTodaysRate}
            type="income"
            variant="label"
          />
        </View>
        <View style={[styles.summaryItem, { backgroundColor: colors.card }]}>
          <AppText variant="caption" color={colors.textSecondary}>
            {t("home.expenses")}
          </AppText>
          <AmountDisplay
            amount={monthSummary.expense}
            currency={totals.displayCurrency}
            approximate={monthSummary.usedTodaysRate}
            type="expense"
            variant="label"
          />
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
                <Pressable
                  onPress={() => router.push(`/recurring/${item.id}` as never)}
                  style={styles.upcomingRow}
                >
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
                    currency={item.accountCurrency}
                    type={item.type as "income" | "expense"}
                    variant="label"
                  />
                </Pressable>
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
      <FAB actions={TRANSACTION_FAB_ACTIONS} onAction={handleFabAction} />

      {/* No account modal */}
      <Modal
        visible={showNoAccountModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowNoAccountModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowNoAccountModal(false)}>
          <View
            style={[styles.modalContent, { backgroundColor: colors.surface }]}
            onStartShouldSetResponder={() => true}
          >
            <AppIcon name="wallet-plus" size={48} color={colors.primary} />
            <AppText variant="h3" style={styles.modalTitle}>
              {t("noAccountModal.title")}
            </AppText>
            <AppText variant="body" color={colors.textSecondary} style={styles.modalMessage}>
              {t("noAccountModal.message")}
            </AppText>
            <AppButton
              title={t("noAccountModal.addAccount")}
              onPress={() => {
                setShowNoAccountModal(false);
                router.push("/account/form");
              }}
              icon="plus"
            />
            <AppButton
              title={t("common.cancel")}
              variant="ghost"
              onPress={() => setShowNoAccountModal(false)}
            />
          </View>
        </Pressable>
      </Modal>
      <HelpModal
        visible={showHelp}
        title={t("home.title")}
        helpKey="home"
        onClose={() => setShowHelp(false)}
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
  eyeButton: {
    position: "absolute",
    top: spacing.lg,
    right: spacing.lg,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  modalContent: {
    width: "100%",
    borderRadius: 16,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.md,
  },
  modalTitle: {
    textAlign: "center",
  },
  modalMessage: {
    textAlign: "center",
    marginBottom: spacing.sm,
  },
});
