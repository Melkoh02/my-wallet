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
import { Divider } from "@/components/atoms/Divider";
import { ConfirmModal } from "@/components/atoms/ConfirmModal";
import { useTheme } from "@/providers/ThemeProvider";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import { getTransactionById, deleteTransaction } from "@/db/queries/transactions";
import { formatDate, formatTime } from "@/utils/format";
import { spacing } from "@/theme/spacing";
import type { TransactionWithRelations } from "@/db/queries/transactions";

export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { invalidate } = useDataRefresh();
  const [txn, setTxn] = useState<TransactionWithRelations | null>(null);
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    if (id) {
      getTransactionById(parseInt(id, 10)).then((t) => setTxn(t ?? null));
    }
  }, [id]);

  if (!txn) return null;

  const handleDelete = async () => {
    setShowDelete(false);
    await deleteTransaction(txn.id);
    invalidate("transactions", "accounts");
    router.back();
  };

  return (
    <ScreenLayout edges={["top"]}>
      <HeaderBar title={t("transactions.transaction")} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.amountSection}>
          <AppText variant="caption" color={colors.textSecondary}>
            {txn.type.charAt(0).toUpperCase() + txn.type.slice(1)}
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
            <DetailRow label={t("transactionForm.addLocation")} value={txn.locationName} />
          )}
          {txn.notes && <DetailRow label={t("transactionForm.notes")} value={txn.notes} />}
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
                  name={`${sub.categoryName} › ${sub.name}`}
                  icon={sub.categoryIcon}
                  color={sub.categoryColor}
                />
              ))}
            </View>
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
});

const detailStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
});
