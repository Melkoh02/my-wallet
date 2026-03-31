import { useState, useEffect } from "react";
import { View, ScrollView, Pressable, Modal, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { AppInput } from "@/components/atoms/AppInput";
import { AppButton } from "@/components/atoms/AppButton";
import { Chip } from "@/components/atoms/Chip";
import { Divider } from "@/components/atoms/Divider";
import { DatePicker } from "@/components/molecules/DatePicker";
import { useTheme } from "@/providers/ThemeProvider";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import { spacing } from "@/theme/spacing";
import type { TransactionFilters } from "@/db/queries/transactions";

type FilterModalProps = {
  visible: boolean;
  onClose: () => void;
  filters: TransactionFilters;
  onApply: (filters: TransactionFilters) => void;
  contacts: { id: string; name: string }[];
};

export function TransactionFilterModal({
  visible,
  onClose,
  filters,
  onApply,
  contacts,
}: FilterModalProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { accounts } = useAccounts();
  const { categories } = useCategories();

  // Local state copies
  const [types, setTypes] = useState<string[]>(filters.types ?? []);
  const [dateFrom, setDateFrom] = useState(filters.dateFrom ?? "");
  const [dateTo, setDateTo] = useState(filters.dateTo ?? "");
  const [amountMin, setAmountMin] = useState(filters.amountMin?.toString() ?? "");
  const [amountMax, setAmountMax] = useState(filters.amountMax?.toString() ?? "");
  const [contactIds, setContactIds] = useState<string[]>(filters.contactIds ?? []);
  const [fromAccountIds, setFromAccountIds] = useState<number[]>(filters.fromAccountIds ?? []);
  const [toAccountIds, setToAccountIds] = useState<number[]>(filters.toAccountIds ?? []);
  const [subcategoryIds, setSubcategoryIds] = useState<number[]>(filters.subcategoryIds ?? []);
  const [expandedCatId, setExpandedCatId] = useState<number | null>(null);

  // Sync when modal opens
  useEffect(() => {
    if (visible) {
      setTypes(filters.types ?? []);
      setDateFrom(filters.dateFrom ?? "");
      setDateTo(filters.dateTo ?? "");
      setAmountMin(filters.amountMin?.toString() ?? "");
      setAmountMax(filters.amountMax?.toString() ?? "");
      setContactIds(filters.contactIds ?? []);
      setFromAccountIds(filters.fromAccountIds ?? []);
      setToAccountIds(filters.toAccountIds ?? []);
      setSubcategoryIds(filters.subcategoryIds ?? []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const toggleType = (type: string) => {
    setTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  };

  const toggleId = <T,>(list: T[], item: T, setter: (v: T[]) => void) => {
    setter(list.includes(item) ? list.filter((i) => i !== item) : [...list, item]);
  };

  const clearAll = () => {
    setTypes([]);
    setDateFrom("");
    setDateTo("");
    setAmountMin("");
    setAmountMax("");
    setContactIds([]);
    setFromAccountIds([]);
    setToAccountIds([]);
    setSubcategoryIds([]);
  };

  const handleApply = () => {
    onApply({
      ...filters,
      types: types.length > 0 ? types : undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      amountMin: amountMin ? parseFloat(amountMin) : undefined,
      amountMax: amountMax ? parseFloat(amountMax) : undefined,
      contactIds: contactIds.length > 0 ? contactIds : undefined,
      fromAccountIds: fromAccountIds.length > 0 ? fromAccountIds : undefined,
      toAccountIds: toAccountIds.length > 0 ? toAccountIds : undefined,
      subcategoryIds: subcategoryIds.length > 0 ? subcategoryIds : undefined,
    });
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <AppText variant="h3">{t("transactions.filters")}</AppText>
          <Pressable onPress={onClose}>
            <AppIcon name="close" size={24} color={colors.icon} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Transaction Type */}
          <Section title={t("transactions.type")} colors={colors}>
            <View style={styles.chipRow}>
              {["income", "expense", "transfer"].map((type) => (
                <Chip
                  key={type}
                  label={t(`transactionForm.${type}`)}
                  selected={types.includes(type)}
                  onPress={() => toggleType(type)}
                />
              ))}
            </View>
          </Section>

          {/* Date Range */}
          <Section title={t("transactions.dateRange")} colors={colors}>
            <View style={styles.row}>
              <View style={styles.half}>
                {dateFrom ? (
                  <DatePicker
                    label={t("transactions.from")}
                    value={dateFrom}
                    onChange={setDateFrom}
                  />
                ) : (
                  <Pressable
                    onPress={() => setDateFrom(new Date().toISOString().slice(0, 10))}
                    style={[styles.emptyPicker, { borderColor: colors.border }]}
                  >
                    <AppText variant="bodySmall" color={colors.placeholder}>
                      {t("transactions.from")}
                    </AppText>
                  </Pressable>
                )}
              </View>
              <View style={styles.half}>
                {dateTo ? (
                  <DatePicker label={t("transactions.to")} value={dateTo} onChange={setDateTo} />
                ) : (
                  <Pressable
                    onPress={() => setDateTo(new Date().toISOString().slice(0, 10))}
                    style={[styles.emptyPicker, { borderColor: colors.border }]}
                  >
                    <AppText variant="bodySmall" color={colors.placeholder}>
                      {t("transactions.to")}
                    </AppText>
                  </Pressable>
                )}
              </View>
            </View>
            {(dateFrom || dateTo) && (
              <Pressable
                onPress={() => {
                  setDateFrom("");
                  setDateTo("");
                }}
              >
                <AppText variant="caption" color={colors.danger}>
                  {t("transactions.clearAll")}
                </AppText>
              </Pressable>
            )}
          </Section>

          {/* Amount Range */}
          <Section title={t("transactions.amountRange")} colors={colors}>
            <View style={styles.row}>
              <View style={styles.half}>
                <AppInput
                  placeholder={t("transactions.min")}
                  value={amountMin}
                  onChangeText={setAmountMin}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.half}>
                <AppInput
                  placeholder={t("transactions.max")}
                  value={amountMax}
                  onChangeText={setAmountMax}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
          </Section>

          {/* Contacts */}
          {contacts.length > 0 && (
            <Section title={t("transactions.contacts")} colors={colors}>
              <View style={styles.chipRow}>
                {contacts.map((c) => (
                  <Chip
                    key={c.id}
                    label={c.name}
                    selected={contactIds.includes(c.id)}
                    onPress={() => toggleId(contactIds, c.id, setContactIds)}
                  />
                ))}
              </View>
            </Section>
          )}

          {/* From Accounts */}
          <Section title={t("transactions.fromAccounts")} colors={colors}>
            <View style={styles.chipRow}>
              {accounts.map((acc) => (
                <Chip
                  key={acc.id}
                  label={acc.name}
                  selected={fromAccountIds.includes(acc.id)}
                  onPress={() => toggleId(fromAccountIds, acc.id, setFromAccountIds)}
                />
              ))}
            </View>
          </Section>

          {/* To Accounts */}
          <Section title={t("transactions.toAccounts")} colors={colors}>
            <View style={styles.chipRow}>
              {accounts.map((acc) => (
                <Chip
                  key={acc.id}
                  label={acc.name}
                  selected={toAccountIds.includes(acc.id)}
                  onPress={() => toggleId(toAccountIds, acc.id, setToAccountIds)}
                />
              ))}
            </View>
          </Section>

          {/* Categories / Subcategories — collapsible */}
          <Section title={t("transactions.categories")} colors={colors}>
            {categories.map((cat) => {
              const selectedCount = cat.subcategories.filter((s) =>
                subcategoryIds.includes(s.id),
              ).length;
              const isExpanded = expandedCatId === cat.id;
              return (
                <View key={cat.id}>
                  <Pressable
                    onPress={() => setExpandedCatId(isExpanded ? null : cat.id)}
                    style={styles.catRow}
                  >
                    <View style={[styles.catDot, { backgroundColor: cat.color }]} />
                    <AppText variant="label" style={styles.catName}>
                      {cat.name}
                    </AppText>
                    {selectedCount > 0 && (
                      <View style={[styles.catBadge, { backgroundColor: colors.primary }]}>
                        <AppText
                          variant="caption"
                          color={colors.textInverse}
                          style={styles.catBadgeText}
                        >
                          {selectedCount}
                        </AppText>
                      </View>
                    )}
                    <AppIcon
                      name={isExpanded ? "chevron-up" : "chevron-down"}
                      size={18}
                      color={colors.iconSecondary}
                    />
                  </Pressable>
                  {isExpanded && (
                    <View style={styles.catSubs}>
                      {cat.subcategories.map((sub) => (
                        <Chip
                          key={sub.id}
                          label={sub.name}
                          selected={subcategoryIds.includes(sub.id)}
                          onPress={() => toggleId(subcategoryIds, sub.id, setSubcategoryIds)}
                        />
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </Section>
        </ScrollView>

        <View style={styles.footer}>
          <AppButton
            title={t("transactions.clearAll")}
            variant="ghost"
            onPress={clearAll}
            style={styles.footerBtn}
          />
          <AppButton
            title={t("transactions.apply")}
            onPress={handleApply}
            style={styles.footerBtn}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function Section({
  title,
  children,
  colors,
}: {
  title: string;
  children: React.ReactNode;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  return (
    <View style={styles.section}>
      <AppText variant="label" color={colors.textSecondary}>
        {title}
      </AppText>
      {children}
      <Divider />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing["5xl"],
  },
  section: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  row: {
    flexDirection: "row",
    gap: spacing.md,
  },
  half: { flex: 1 },
  emptyPicker: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 48,
    justifyContent: "center",
  },
  catRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  catDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  catName: {
    flex: 1,
  },
  catBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  catBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 14,
  },
  catSubs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingLeft: spacing.xl,
    paddingBottom: spacing.sm,
  },
  footer: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  footerBtn: { flex: 1 },
});
