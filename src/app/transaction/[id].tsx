import { useEffect, useState } from "react";
import { View, ScrollView, Pressable, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScreenLayout } from "@/components/templates/ScreenLayout";
import { HeaderBar } from "@/components/templates/HeaderBar";
import { AmountDisplay } from "@/components/molecules/AmountDisplay";
import { CategoryPill } from "@/components/molecules/CategoryPill";
import { AppText } from "@/components/atoms/AppText";
import { AppButton } from "@/components/atoms/AppButton";
import { AppIcon } from "@/components/atoms/AppIcon";
import { Divider } from "@/components/atoms/Divider";
import { ConfirmModal } from "@/components/atoms/ConfirmModal";
import { useTheme } from "@/providers/ThemeProvider";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import {
  getTransactionById,
  deleteTransaction,
  createTransaction,
} from "@/db/queries/transactions";
import { db } from "@/db/client";
import { transactions, accounts, type Account } from "@/db/schema";
import { eq } from "drizzle-orm";
import { formatDate, formatTime } from "@/utils/format";
import { translateCategoryName } from "@/constants/categories";
import { spacing } from "@/theme/spacing";
import type { TransactionWithRelations } from "@/db/queries/transactions";

export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { invalidate, revisions } = useDataRefresh();
  const [txn, setTxn] = useState<TransactionWithRelations | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [splitDebts, setSplitDebts] = useState<Account[]>([]);

  useEffect(() => {
    if (id) {
      const txnId = parseInt(id, 10);
      getTransactionById(txnId).then((result) => setTxn(result ?? null));
      // Load loan accounts linked to this transaction (split bill)
      db.select().from(accounts).where(eq(accounts.originTransactionId, txnId)).then(setSplitDebts);
    }
  }, [id, revisions.transactions, revisions.accounts]);

  if (!txn) return null;

  const hasCashback = (txn.cashbackAmount ?? 0) > 0;
  const cashbackFulfilled = hasCashback && txn.linkedTransactionId != null;

  const handleDelete = async () => {
    setShowDelete(false);
    if (txn.linkedTransactionId) {
      await deleteTransaction(txn.linkedTransactionId);
    }
    await deleteTransaction(txn.id);
    invalidate("transactions", "accounts");
    router.back();
  };

  const handleConfirmCashback = async () => {
    if (!txn.cashbackAmount || !txn.cashbackAccountId) return;
    setConfirming(true);
    try {
      const cashbackTxn = await createTransaction(
        {
          type: "income",
          amount: txn.cashbackAmount,
          description: `${t("settings.cashback")}: ${txn.description}`.trim(),
          accountId: txn.cashbackAccountId,
          date: new Date().toISOString().slice(0, 10),
          time: new Date().toTimeString().slice(0, 5),
          linkedTransactionId: txn.id,
        },
        [],
      );

      await db
        .update(transactions)
        .set({ linkedTransactionId: cashbackTxn.id })
        .where(eq(transactions.id, txn.id));

      invalidate("transactions", "accounts");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <ScreenLayout>
      <HeaderBar
        title={t("transactions.transaction")}
        onBack={() => router.back()}
        rightIcon="pencil"
        onRightPress={() => router.push(`/transaction/form?id=${txn.id}`)}
      />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.amountSection}>
          <AppText variant="caption" color={colors.textSecondary}>
            {t(`transactionForm.${txn.type}`)}
          </AppText>
          <AmountDisplay
            amount={txn.amount}
            type={txn.type as "income" | "expense" | "transfer"}
            variant="amountLarge"
          />
        </View>

        <Divider />

        <View style={styles.details}>
          {txn.description ? (
            <DetailRow label={t("transactionForm.description")} value={txn.description} />
          ) : null}
          <DetailRow label={t("transactionForm.account")} value={txn.accountName} />
          {txn.toAccountName && (
            <DetailRow label={t("transactionForm.toAccount")} value={txn.toAccountName} />
          )}
          <DetailRow label={t("transactionForm.date")} value={formatDate(txn.date)} />
          <DetailRow label={t("transactionForm.time")} value={formatTime(txn.time)} />
          {txn.contactName && (
            <DetailRow label={t("transactionForm.contact")} value={txn.contactName} />
          )}
          {txn.locationName && (
            <DetailRow label={t("transactionForm.location")} value={txn.locationName} />
          )}
        </View>

        {txn.subcategoryList.length > 0 && (
          <View style={styles.categoriesSection}>
            <AppText variant="label" color={colors.textSecondary}>
              {t("categories.title")}
            </AppText>
            <View style={styles.pills}>
              {txn.subcategoryList.map((sub) => (
                <CategoryPill
                  key={sub.id}
                  name={`${translateCategoryName(sub.categoryName, t)} \u203A ${translateCategoryName(sub.name, t)}`}
                  icon={sub.categoryIcon}
                  color={sub.categoryColor}
                />
              ))}
            </View>
          </View>
        )}

        {hasCashback && (
          <View
            style={[
              styles.cashbackSection,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.cashbackRow}>
              <AppIcon name="cash-refund" size={20} color={colors.income} />
              <AppText variant="label" style={styles.flex}>
                {t("settings.cashback")}
              </AppText>
              <AmountDisplay amount={txn.cashbackAmount!} type="income" variant="label" />
            </View>
            {cashbackFulfilled ? (
              <View style={styles.cashbackRow}>
                <AppIcon name="check-circle" size={18} color={colors.success} />
                <AppText variant="bodySmall" color={colors.success}>
                  {t("transactionForm.cashbackConfirmed")}
                </AppText>
              </View>
            ) : (
              <AppButton
                title={t("transactionForm.confirmCashback")}
                variant="secondary"
                icon="check"
                onPress={handleConfirmCashback}
                disabled={confirming}
              />
            )}
          </View>
        )}

        {/* Split debts */}
        {splitDebts.length > 0 && (
          <View style={styles.section}>
            <AppText variant="label" color={colors.textSecondary}>
              {t("splitBill.title")}
            </AppText>
            {splitDebts.map((debt) => {
              const remaining = debt.balance;
              const settled = remaining <= 0;
              return (
                <Pressable
                  key={debt.id}
                  onPress={() => router.push(`/account/${debt.id}`)}
                  style={[styles.splitDebtRow, { backgroundColor: colors.card }]}
                >
                  <AppIcon
                    name={settled ? "check-circle" : "account-clock"}
                    size={22}
                    color={settled ? colors.income : colors.expense}
                  />
                  <View style={{ flex: 1 }}>
                    <AppText variant="body">{debt.counterparty ?? debt.name}</AppText>
                    <AppText variant="caption" color={colors.textSecondary}>
                      {settled ? t("accounts.settled") : t("accounts.remaining")}
                    </AppText>
                  </View>
                  <AmountDisplay
                    amount={Math.abs(remaining)}
                    currency={debt.currency}
                    type={settled ? "income" : "expense"}
                    variant="label"
                  />
                </Pressable>
              );
            })}
          </View>
        )}

        <AppButton
          title={t("transactions.deleteTitle")}
          onPress={() => setShowDelete(true)}
          variant="danger"
          icon="delete"
        />
      </ScrollView>
      <ConfirmModal
        visible={showDelete}
        title={t("transactions.deleteTitle")}
        message={t("transactions.deleteMessage")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={handleDelete}
        onCancel={() => setShowDelete(false)}
      />
    </ScreenLayout>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={detailStyles.row}>
      <AppText variant="bodySmall" color={colors.textSecondary}>
        {label}
      </AppText>
      <AppText variant="body">{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  amountSection: {
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.lg,
  },
  details: {
    gap: spacing.md,
  },
  categoriesSection: {
    gap: spacing.sm,
  },
  pills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  flex: { flex: 1 },
  cashbackSection: {
    borderWidth: 1,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.md,
  },
  cashbackRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  section: {
    gap: spacing.sm,
  },
  splitDebtRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 10,
  },
});

const detailStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
});
