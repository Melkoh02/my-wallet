import { useState, useMemo } from "react";
import { View, FlatList, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { ScreenLayout } from "@/components/templates/ScreenLayout";
import { HeaderBar } from "@/components/templates/HeaderBar";
import { TransactionListItem } from "@/components/organisms/TransactionListItem";
import { EmptyState } from "@/components/molecules/EmptyState";
import { AppInput } from "@/components/atoms/AppInput";
import { Chip } from "@/components/atoms/Chip";
import { Divider } from "@/components/atoms/Divider";
import { useTransactions } from "@/hooks/useTransactions";
import { spacing } from "@/theme/spacing";

const TYPE_FILTERS = [
  { label: "All", value: undefined },
  { label: "Income", value: "income" },
  { label: "Expense", value: "expense" },
  { label: "Transfer", value: "transfer" },
] as const;

export default function TransactionsScreen() {
  const router = useRouter();
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
      <HeaderBar
        title="Transactions"
        rightIcon="plus"
        onRightPress={() => router.push("/transaction/form")}
      />
      <View style={styles.filters}>
        <AppInput
          placeholder="Search transactions..."
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
              title="No transactions"
              description="Add your first transaction to start tracking"
            />
          )
        }
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
