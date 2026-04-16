import { useEffect, useState } from "react";
import { View, FlatList, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScreenLayout } from "@/components/templates/ScreenLayout";
import { HeaderBar } from "@/components/templates/HeaderBar";
import { AmountDisplay } from "@/components/molecules/AmountDisplay";
import { EmptyState } from "@/components/molecules/EmptyState";
import { TransactionListItem } from "@/components/organisms/TransactionListItem";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { AppButton } from "@/components/atoms/AppButton";
import { Divider } from "@/components/atoms/Divider";
import { ConfirmModal } from "@/components/atoms/ConfirmModal";
import { useTheme } from "@/providers/ThemeProvider";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import { useAccounts } from "@/hooks/useAccounts";
import { getRecurringById, triggerRecurringNow } from "@/db/queries/recurring";
import { getTransactions, type TransactionWithRelations } from "@/db/queries/transactions";
import { formatDate } from "@/utils/format";
import { spacing } from "@/theme/spacing";
import type { RecurringTransaction } from "@/db/schema";

const FREQ_KEYS: Record<string, string> = {
  daily: "recurring.daily",
  weekly: "recurring.weekly",
  biweekly: "recurring.biweekly",
  monthly: "recurring.monthly",
  yearly: "recurring.yearly",
};

const DAY_KEYS = [
  "recurring.sunday",
  "recurring.monday",
  "recurring.tuesday",
  "recurring.wednesday",
  "recurring.thursday",
  "recurring.friday",
  "recurring.saturday",
];

export default function RecurringDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { revisions, invalidate } = useDataRefresh();
  const { accounts } = useAccounts();
  const [item, setItem] = useState<RecurringTransaction | null>(null);
  const [txns, setTxns] = useState<TransactionWithRelations[]>([]);
  const [showTriggerConfirm, setShowTriggerConfirm] = useState(false);
  const [triggering, setTriggering] = useState(false);

  useEffect(() => {
    if (id) {
      const rid = parseInt(id, 10);
      getRecurringById(rid).then((r) => setItem(r ?? null));
      getTransactions({ recurringId: rid, limit: 50 }).then(setTxns);
    }
  }, [id, revisions.recurring, revisions.transactions]);

  if (!item) return null;

  const account = accounts.find((a) => a.id === item.accountId);
  const typeColor = item.type === "income" ? colors.income : colors.expense;

  const handleTrigger = async () => {
    setTriggering(true);
    setShowTriggerConfirm(false);
    try {
      await triggerRecurringNow(parseInt(id!, 10));
      invalidate("transactions", "accounts", "recurring");
    } catch (e) {
      console.error("Trigger failed:", e);
    }
    setTriggering(false);
  };

  return (
    <ScreenLayout edges={["top"]}>
      <HeaderBar
        title={item.description}
        onBack={() => router.back()}
        rightIcon="pencil"
        onRightPress={() => router.push(`/recurring/form?id=${item.id}` as never)}
      />
      <FlatList
        data={txns}
        keyExtractor={(txn) => txn.id.toString()}
        ListHeaderComponent={
          <View style={styles.header}>
            {/* Amount + type */}
            <View style={styles.amountSection}>
              <View style={[styles.typeIcon, { backgroundColor: typeColor + "18" }]}>
                <AppIcon
                  name={item.type === "income" ? "arrow-down" : "arrow-up"}
                  size={24}
                  color={typeColor}
                />
              </View>
              <AmountDisplay
                amount={item.amount}
                type={item.type as "income" | "expense"}
                variant="amountLarge"
              />
              <AppText variant="bodySmall" color={colors.textSecondary}>
                {t(FREQ_KEYS[item.frequency])}
                {item.dayOfMonth ? ` · ${t("recurring.dayOfMonth")}: ${item.dayOfMonth}` : ""}
                {item.dayOfWeek != null ? ` · ${t(DAY_KEYS[item.dayOfWeek])}` : ""}
                {item.timeOfDay ? ` · ${item.timeOfDay}` : ""}
              </AppText>
            </View>

            {/* Details card */}
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              {account && (
                <View style={styles.detailRow}>
                  <AppText variant="bodySmall" color={colors.textSecondary}>
                    {t("transactionForm.account")}
                  </AppText>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <AppIcon name={account.icon} size={16} color={account.color} />
                    <AppText variant="label">{account.name}</AppText>
                  </View>
                </View>
              )}
              <View style={styles.detailRow}>
                <AppText variant="bodySmall" color={colors.textSecondary}>
                  {t("recurring.next")}
                </AppText>
                <AppText variant="label">{formatDate(item.nextDate)}</AppText>
              </View>
              {item.endDate && (
                <View style={styles.detailRow}>
                  <AppText variant="bodySmall" color={colors.textSecondary}>
                    {t("recurring.endDate")}
                  </AppText>
                  <AppText variant="label">{formatDate(item.endDate)}</AppText>
                </View>
              )}
              <View style={styles.detailRow}>
                <AppText variant="bodySmall" color={colors.textSecondary}>
                  {t("recurring.status")}
                </AppText>
                <AppText
                  variant="label"
                  color={item.isActive ? colors.income : colors.textTertiary}
                >
                  {item.isActive ? t("recurring.active") : t("recurring.paused")}
                </AppText>
              </View>
            </View>

            {/* Trigger now button */}
            {item.isActive && (
              <View style={styles.triggerSection}>
                <AppButton
                  title={t("recurring.triggerNow")}
                  icon="play"
                  variant="secondary"
                  onPress={() => setShowTriggerConfirm(true)}
                  disabled={triggering}
                />
              </View>
            )}

            <Divider />
            <AppText variant="h3" style={styles.sectionTitle}>
              {t("recurring.generatedTransactions")}
            </AppText>
          </View>
        }
        renderItem={({ item: txn }) => (
          <TransactionListItem
            transaction={txn}
            onPress={() => router.push(`/transaction/${txn.id}`)}
          />
        )}
        ItemSeparatorComponent={Divider}
        ListEmptyComponent={
          <EmptyState icon="swap-horizontal" title={t("recurring.noGeneratedTransactions")} />
        }
      />

      <ConfirmModal
        visible={showTriggerConfirm}
        title={t("recurring.triggerNow")}
        message={t("recurring.triggerConfirm")}
        confirmLabel={t("common.confirm")}
        cancelLabel={t("common.cancel")}
        variant="primary"
        onConfirm={handleTrigger}
        onCancel={() => setShowTriggerConfirm(false)}
      />
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  header: { paddingBottom: spacing.sm },
  amountSection: {
    alignItems: "center",
    paddingVertical: spacing["2xl"],
    gap: spacing.sm,
  },
  typeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    marginHorizontal: spacing.lg,
    borderRadius: 12,
    padding: spacing.lg,
    gap: spacing.md,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  triggerSection: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  sectionTitle: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
});
