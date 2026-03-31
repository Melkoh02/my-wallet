import { useEffect, useState } from "react";
import { View, ScrollView, StyleSheet, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenLayout } from "@/components/templates/ScreenLayout";
import { HeaderBar } from "@/components/templates/HeaderBar";
import { AmountDisplay } from "@/components/molecules/AmountDisplay";
import { CategoryPill } from "@/components/molecules/CategoryPill";
import { AppText } from "@/components/atoms/AppText";
import { AppButton } from "@/components/atoms/AppButton";
import { Divider } from "@/components/atoms/Divider";
import { useTheme } from "@/providers/ThemeProvider";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import { getTransactionById, deleteTransaction } from "@/db/queries/transactions";
import { formatDate, formatTime } from "@/utils/format";
import { spacing } from "@/theme/spacing";
import type { TransactionWithRelations } from "@/db/queries/transactions";

export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { invalidate } = useDataRefresh();
  const [txn, setTxn] = useState<TransactionWithRelations | null>(null);

  useEffect(() => {
    if (id) {
      getTransactionById(parseInt(id, 10)).then((t) => setTxn(t ?? null));
    }
  }, [id]);

  if (!txn) return null;

  const handleDelete = () => {
    Alert.alert("Delete Transaction", "This action cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteTransaction(txn.id);
          invalidate("transactions", "accounts");
          router.back();
        },
      },
    ]);
  };

  return (
    <ScreenLayout edges={["top"]}>
      <HeaderBar title="Transaction" onBack={() => router.back()} />
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
          {txn.description ? <DetailRow label="Description" value={txn.description} /> : null}
          <DetailRow label="Account" value={txn.accountName} />
          {txn.toAccountName && <DetailRow label="To" value={txn.toAccountName} />}
          <DetailRow label="Date" value={formatDate(txn.date)} />
          <DetailRow label="Time" value={formatTime(txn.time)} />
          {txn.contactName && <DetailRow label="Contact" value={txn.contactName} />}
          {txn.locationName && <DetailRow label="Location" value={txn.locationName} />}
          {txn.notes && <DetailRow label="Notes" value={txn.notes} />}
        </View>

        {txn.subcategoryList.length > 0 && (
          <View style={styles.categoriesSection}>
            <AppText variant="label" color={colors.textSecondary}>
              Categories
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
          title="Delete Transaction"
          onPress={handleDelete}
          variant="danger"
          icon="delete"
        />
      </ScrollView>
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
