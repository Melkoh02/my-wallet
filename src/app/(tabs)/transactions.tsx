import { useState, useMemo } from "react";
import { View, FlatList, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScreenLayout } from "@/components/templates/ScreenLayout";
import { HeaderBar } from "@/components/templates/HeaderBar";
import { TransactionListItem } from "@/components/organisms/TransactionListItem";
import { EmptyState } from "@/components/molecules/EmptyState";
import { AppInput } from "@/components/atoms/AppInput";
import { Chip } from "@/components/atoms/Chip";
import { Divider } from "@/components/atoms/Divider";
import { FAB } from "@/components/atoms/FAB";
import { useTransactions } from "@/hooks/useTransactions";
import { TRANSACTION_FAB_ACTIONS } from "@/constants/fab";
import { spacing } from "@/theme/spacing";

export default function TransactionsScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  const TYPE_FILTERS = [
    { label: t("common.all"), value: undefined },
    { label: t("transactionForm.income"), value: "income" },
    { label: t("transactionForm.expense"), value: "expense" },
    { label: t("transactionForm.transfer"), value: "transfer" },
  ] as const;
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | undefined>();

  const filters = useMemo(
    () => ({
      search: search || undefined,
      type: typeFilter,
    }),
    [search, typeFilter],
  );

  const { transactions, loading, hasMore, loadMore } = useTransactions(filters);

  return (
    <ScreenLayout edges={["top"]}>
      <HeaderBar title={t("transactions.title")} />
      <View style={styles.filters}>
        <AppInput
          placeholder={t("transactions.search")}
          value={search}
          onChangeText={setSearch}
          style={styles.searchInput}
        />
        <View style={styles.chipRow}>
          {TYPE_FILTERS.map((f) => (
            <Chip
              key={f.label}
              label={f.label}
              selected={typeFilter === f.value}
              onPress={() => setTypeFilter(f.value)}
            />
          ))}
        </View>
      </View>
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <TransactionListItem
            transaction={item}
            onPress={() => router.push(`/transaction/${item.id}`)}
          />
        )}
        ItemSeparatorComponent={Divider}
        onEndReached={hasMore ? loadMore : undefined}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          loading ? null : (
            <EmptyState
              icon="swap-horizontal"
              title={t("transactions.noTransactions")}
              description={t("transactions.addFirst")}
            />
          )
        }
      />
      <FAB
        actions={TRANSACTION_FAB_ACTIONS}
        onAction={(key) => router.push(`/transaction/form?type=${key}`)}
      />
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  filters: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  searchInput: {
    marginBottom: 0,
  },
  chipRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
});
