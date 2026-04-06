import { useEffect, useState } from "react";
import { View, ScrollView, StyleSheet } from "react-native";
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
import { transactions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { formatDate, formatTime } from "@/utils/format";
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

  useEffect(() => {
    if (id) {
      getTransactionById(parseInt(id, 10)).then((result) => setTxn(result ?? null));
    }
  }, [id, revisions.transactions]);

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
    <ScreenLayout edges={["top"]}>
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
                  name={`${sub.categoryName} \u203A ${sub.name}`}
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
});

const detailStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
});
