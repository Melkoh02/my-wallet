import { useState, useMemo } from "react";
import { View, Pressable, SectionList, Modal, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScreenLayout } from "@/components/templates/ScreenLayout";
import { HeaderBar } from "@/components/templates/HeaderBar";
import { TransactionListItem } from "@/components/organisms/TransactionListItem";
import { TransactionFilterModal } from "@/components/organisms/TransactionFilterModal";
import { EmptyState } from "@/components/molecules/EmptyState";
import { AppText } from "@/components/atoms/AppText";
import { AppInput } from "@/components/atoms/AppInput";
import { AppIcon } from "@/components/atoms/AppIcon";
import { AppButton } from "@/components/atoms/AppButton";
import { Divider } from "@/components/atoms/Divider";
import { FAB } from "@/components/atoms/FAB";
import { useTheme } from "@/providers/ThemeProvider";
import { useTransactions } from "@/hooks/useTransactions";
import { getAccounts } from "@/db/queries/accounts";
import { formatDate } from "@/utils/format";
import { TRANSACTION_FAB_ACTIONS } from "@/constants/fab";
import { spacing } from "@/theme/spacing";
import type { TransactionFilters, TransactionWithRelations } from "@/db/queries/transactions";

type Section = {
  title: string;
  data: TransactionWithRelations[];
};

function groupByDate(transactions: TransactionWithRelations[]): Section[] {
  const groups: Record<string, TransactionWithRelations[]> = {};
  for (const txn of transactions) {
    if (!groups[txn.date]) groups[txn.date] = [];
    groups[txn.date].push(txn);
  }
  return Object.entries(groups).map(([date, data]) => ({
    title: formatDate(date),
    data,
  }));
}

function countActiveFilters(filters: TransactionFilters): number {
  let count = 0;
  if (filters.types?.length) count++;
  if (filters.dateFrom || filters.dateTo) count++;
  if (filters.amountMin !== undefined || filters.amountMax !== undefined) count++;
  if (filters.contactIds?.length) count++;
  if (filters.fromAccountIds?.length) count++;
  if (filters.toAccountIds?.length) count++;
  if (filters.subcategoryIds?.length) count++;
  return count;
}

export default function TransactionsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<TransactionFilters>({});
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [showNoAccountModal, setShowNoAccountModal] = useState(false);

  const fullFilters = useMemo(
    () => ({
      ...filters,
      search: search || undefined,
    }),
    [search, filters],
  );

  const { transactions, loading, hasMore, loadMore } = useTransactions(fullFilters);
  const sections = useMemo(() => groupByDate(transactions), [transactions]);
  const activeFilterCount = countActiveFilters(filters);

  // Collect unique contacts for the filter modal
  const contactOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const txn of transactions) {
      if (txn.contactId && txn.contactName) {
        map.set(txn.contactId, txn.contactName);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [transactions]);

  const handleApplyFilters = (newFilters: TransactionFilters) => {
    // Keep search separate
    const { search: _, ...rest } = newFilters;
    setFilters(rest);
  };

  const handleFabAction = async (key: string) => {
    const accs = await getAccounts(true);
    if (accs.length === 0) {
      setShowNoAccountModal(true);
      return;
    }
    router.push(`/transaction/form?type=${key}`);
  };

  return (
    <ScreenLayout edges={["top"]}>
      <HeaderBar title={t("transactions.title")} />
      <View style={styles.searchRow}>
        <View style={styles.searchInput}>
          <AppInput
            placeholder={t("transactions.search")}
            value={search}
            onChangeText={setSearch}
            style={search ? { paddingRight: 36 } : undefined}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")} style={styles.clearBtn} hitSlop={8}>
              <AppIcon name="close-circle" size={20} color={colors.iconSecondary} />
            </Pressable>
          )}
        </View>
        <Pressable
          onPress={() => setFilterModalVisible(true)}
          style={[
            styles.filterBtn,
            {
              backgroundColor: activeFilterCount > 0 ? colors.primary : colors.surface,
              borderColor: activeFilterCount > 0 ? colors.primary : colors.border,
            },
          ]}
        >
          <AppIcon
            name="filter-variant"
            size={22}
            color={activeFilterCount > 0 ? colors.textInverse : colors.icon}
          />
          {activeFilterCount > 0 && (
            <View style={[styles.badge, { backgroundColor: colors.textInverse }]}>
              <AppText variant="caption" color={colors.primary} style={styles.badgeText}>
                {activeFilterCount}
              </AppText>
            </View>
          )}
        </Pressable>
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

      <TransactionFilterModal
        visible={filterModalVisible}
        onClose={() => setFilterModalVisible(false)}
        filters={fullFilters}
        onApply={handleApplyFilters}
        contacts={contactOptions}
      />

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
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  searchRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    position: "relative" as const,
  },
  clearBtn: {
    position: "absolute" as const,
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: "center" as const,
  },
  filterBtn: {
    width: 48,
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 14,
  },
  dateHeader: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
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
