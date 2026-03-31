import { useState, useMemo } from "react";
import { View, SectionList, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScreenLayout } from "@/components/templates/ScreenLayout";
import { HeaderBar } from "@/components/templates/HeaderBar";
import { TransactionListItem } from "@/components/organisms/TransactionListItem";
import { EmptyState } from "@/components/molecules/EmptyState";
import { AppText } from "@/components/atoms/AppText";
import { AppInput } from "@/components/atoms/AppInput";
import { AppIcon } from "@/components/atoms/AppIcon";
import { Chip } from "@/components/atoms/Chip";
import { Divider } from "@/components/atoms/Divider";
import { FAB } from "@/components/atoms/FAB";
import { useTheme } from "@/providers/ThemeProvider";
import { useTransactions } from "@/hooks/useTransactions";
import { formatDate } from "@/utils/format";
import { TRANSACTION_FAB_ACTIONS } from "@/constants/fab";
import { spacing } from "@/theme/spacing";
import type { TransactionWithRelations } from "@/db/queries/transactions";

type Section = {
  title: string;
  data: TransactionWithRelations[];
};

function groupByDate(transactions: TransactionWithRelations[]): Section[] {
  const groups: Record<string, TransactionWithRelations[]> = {};
  for (const txn of transactions) {
    const key = txn.date;
    if (!groups[key]) groups[key] = [];
    groups[key].push(txn);
  }
  return Object.entries(groups).map(([date, data]) => ({
    title: formatDate(date),
    data,
  }));
}

export default function TransactionsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();

  const TYPE_FILTERS = [
    { label: t("common.all"), value: undefined },
    { label: t("transactionForm.income"), value: "income" },
    { label: t("transactionForm.expense"), value: "expense" },
    { label: t("transactionForm.transfer"), value: "transfer" },
  ] as const;

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | undefined>();
  const [contactFilter, setContactFilter] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const filters = useMemo(
    () => ({
      search: search || undefined,
      type: typeFilter,
    }),
    [search, typeFilter],
  );

  const { transactions, loading, hasMore, loadMore } = useTransactions(filters);

  // Apply contact filter client-side (simple approach)
  const filtered = useMemo(() => {
    if (!contactFilter) return transactions;
    return transactions.filter((t) => t.contactId === contactFilter.id);
  }, [transactions, contactFilter]);

  const sections = useMemo(() => groupByDate(filtered), [filtered]);

  // Collect unique contacts from current transactions for filter
  const contactOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const txn of transactions) {
      if (txn.contactId && txn.contactName) {
        map.set(txn.contactId, txn.contactName);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [transactions]);

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
        {/* Contact filter chips */}
        {contactOptions.length > 0 && (
          <View style={styles.chipRow}>
            {contactFilter && (
              <Pressable
                onPress={() => setContactFilter(null)}
                style={[styles.contactChip, { backgroundColor: colors.primary }]}
              >
                <AppIcon name="account" size={14} color={colors.textInverse} />
                <AppText variant="caption" color={colors.textInverse}>
                  {contactFilter.name}
                </AppText>
                <AppIcon name="close" size={14} color={colors.textInverse} />
              </Pressable>
            )}
            {!contactFilter &&
              contactOptions.slice(0, 5).map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => setContactFilter(c)}
                  style={[
                    styles.contactChip,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                >
                  <AppIcon name="account" size={14} color={colors.iconSecondary} />
                  <AppText variant="caption" color={colors.textSecondary}>
                    {c.name}
                  </AppText>
                </Pressable>
              ))}
          </View>
        )}
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id.toString()}
        renderSectionHeader={({ section }) => (
          <View style={[styles.dateHeader, { backgroundColor: colors.background }]}>
            <AppText variant="label" color={colors.textSecondary}>
              {section.title}
            </AppText>
          </View>
        )}
        renderItem={({ item }) => (
          <TransactionListItem
            transaction={item}
            onPress={() => router.push(`/transaction/${item.id}`)}
          />
        )}
        ItemSeparatorComponent={Divider}
        stickySectionHeadersEnabled
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
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  contactChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 16,
    borderWidth: 1,
  },
  dateHeader: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
});
