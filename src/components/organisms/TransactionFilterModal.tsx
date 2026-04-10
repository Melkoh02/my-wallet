import { useState, useEffect } from "react";
import { View, ScrollView, Pressable, Modal, FlatList, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { AppInput } from "@/components/atoms/AppInput";
import { AppButton } from "@/components/atoms/AppButton";
import { Chip } from "@/components/atoms/Chip";
import { Divider } from "@/components/atoms/Divider";
import { DatePicker } from "@/components/molecules/DatePicker";
import { SelectInput } from "@/components/molecules/SelectInput";
import { CategoryPicker } from "@/components/organisms/CategoryPicker";
import { useTheme } from "@/providers/ThemeProvider";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import { spacing } from "@/theme/spacing";
import type { TransactionFilters } from "@/db/queries/transactions";
import type { Account } from "@/db/schema";

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

  // Account picker modals
  const [showFromAccountPicker, setShowFromAccountPicker] = useState(false);
  const [showToAccountPicker, setShowToAccountPicker] = useState(false);
  const [showContactPicker, setShowContactPicker] = useState(false);

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

  const toggleAccountId = (id: number, list: number[], setter: (v: number[]) => void) => {
    setter(list.includes(id) ? list.filter((i) => i !== id) : [...list, id]);
  };

  const toggleContactId = (id: string) => {
    setContactIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
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

  const fromAccountLabel =
    fromAccountIds.length > 0 ? t("common.selected", { count: fromAccountIds.length }) : undefined;
  const toAccountLabel =
    toAccountIds.length > 0 ? t("common.selected", { count: toAccountIds.length }) : undefined;
  const contactLabel =
    contactIds.length > 0 ? t("common.selected", { count: contactIds.length }) : undefined;

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
                  <View style={styles.emptyPickerWrapper}>
                    <AppText variant="label" color={colors.textSecondary}>
                      {t("transactions.from")}
                    </AppText>
                    <Pressable
                      onPress={() => setDateFrom(new Date().toISOString().slice(0, 10))}
                      style={[
                        styles.emptyPicker,
                        { borderColor: colors.border, backgroundColor: colors.surface },
                      ]}
                    >
                      <AppIcon name="calendar" size={20} color={colors.iconSecondary} />
                      <AppText variant="body" color={colors.placeholder}>
                        {t("transactions.notSet")}
                      </AppText>
                    </Pressable>
                  </View>
                )}
              </View>
              <View style={styles.half}>
                {dateTo ? (
                  <DatePicker label={t("transactions.to")} value={dateTo} onChange={setDateTo} />
                ) : (
                  <View style={styles.emptyPickerWrapper}>
                    <AppText variant="label" color={colors.textSecondary}>
                      {t("transactions.to")}
                    </AppText>
                    <Pressable
                      onPress={() => setDateTo(new Date().toISOString().slice(0, 10))}
                      style={[
                        styles.emptyPicker,
                        { borderColor: colors.border, backgroundColor: colors.surface },
                      ]}
                    >
                      <AppIcon name="calendar" size={20} color={colors.iconSecondary} />
                      <AppText variant="body" color={colors.placeholder}>
                        {t("transactions.notSet")}
                      </AppText>
                    </Pressable>
                  </View>
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

          {/* From Accounts — modal picker */}
          <Section title="" colors={colors}>
            <SelectInput
              label={t("transactions.fromAccounts")}
              value={
                fromAccountLabel ? <AppText variant="body">{fromAccountLabel}</AppText> : undefined
              }
              placeholder={t("common.select")}
              onPress={() => setShowFromAccountPicker(true)}
            />
          </Section>

          {/* To Accounts — modal picker */}
          <Section title="" colors={colors}>
            <SelectInput
              label={t("transactions.toAccounts")}
              value={
                toAccountLabel ? <AppText variant="body">{toAccountLabel}</AppText> : undefined
              }
              placeholder={t("common.select")}
              onPress={() => setShowToAccountPicker(true)}
            />
          </Section>

          {/* Contacts — modal picker */}
          {contacts.length > 0 && (
            <Section title="" colors={colors}>
              <SelectInput
                label={t("transactions.contacts")}
                value={contactLabel ? <AppText variant="body">{contactLabel}</AppText> : undefined}
                placeholder={t("common.select")}
                onPress={() => setShowContactPicker(true)}
              />
            </Section>
          )}

          {/* Categories / Subcategories — reuse CategoryPicker */}
          <CategoryPicker
            categories={categories}
            selected={subcategoryIds}
            onSelectionChange={setSubcategoryIds}
            label={t("transactions.categories")}
          />
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

      {/* From Accounts multi-select modal */}
      <MultiSelectAccountModal
        visible={showFromAccountPicker}
        title={t("transactions.fromAccounts")}
        accounts={accounts}
        selectedIds={fromAccountIds}
        onToggle={(id) => toggleAccountId(id, fromAccountIds, setFromAccountIds)}
        onClose={() => setShowFromAccountPicker(false)}
      />

      {/* To Accounts multi-select modal */}
      <MultiSelectAccountModal
        visible={showToAccountPicker}
        title={t("transactions.toAccounts")}
        accounts={accounts}
        selectedIds={toAccountIds}
        onToggle={(id) => toggleAccountId(id, toAccountIds, setToAccountIds)}
        onClose={() => setShowToAccountPicker(false)}
      />

      {/* Contacts multi-select modal */}
      <MultiSelectContactModal
        visible={showContactPicker}
        title={t("transactions.contacts")}
        contacts={contacts}
        selectedIds={contactIds}
        onToggle={toggleContactId}
        onClose={() => setShowContactPicker(false)}
      />
    </Modal>
  );
}

/* ---------- Multi-select Account Modal ---------- */
function MultiSelectAccountModal({
  visible,
  title,
  accounts,
  selectedIds,
  onToggle,
  onClose,
}: {
  visible: boolean;
  title: string;
  accounts: Account[];
  selectedIds: number[];
  onToggle: (id: number) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <AppText variant="h3">{title}</AppText>
          <Pressable onPress={onClose}>
            <AppIcon name="close" size={24} color={colors.icon} />
          </Pressable>
        </View>
        <FlatList
          data={accounts}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => {
            const isSelected = selectedIds.includes(item.id);
            return (
              <Pressable
                onPress={() => onToggle(item.id)}
                style={[
                  styles.pickerRow,
                  {
                    backgroundColor: isSelected ? colors.surface : "transparent",
                  },
                ]}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: item.color + "20",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <AppIcon name={item.icon} size={20} color={item.color} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="body">{item.name}</AppText>
                  {item.institution ? (
                    <AppText variant="caption" color={colors.textSecondary}>
                      {item.institution}
                    </AppText>
                  ) : null}
                </View>
                <AppIcon
                  name={isSelected ? "checkbox-marked" : "checkbox-blank-outline"}
                  size={22}
                  color={isSelected ? colors.primary : colors.iconSecondary}
                />
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <AppText variant="bodySmall" color={colors.textTertiary} style={styles.emptyText}>
              {t("common.noResults")}
            </AppText>
          }
        />
        <View style={styles.modalFooter}>
          <AppButton title={t("common.done")} onPress={onClose} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

/* ---------- Multi-select Contact Modal ---------- */
function MultiSelectContactModal({
  visible,
  title,
  contacts,
  selectedIds,
  onToggle,
  onClose,
}: {
  visible: boolean;
  title: string;
  contacts: { id: string; name: string }[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <AppText variant="h3">{title}</AppText>
          <Pressable onPress={onClose}>
            <AppIcon name="close" size={24} color={colors.icon} />
          </Pressable>
        </View>
        <FlatList
          data={contacts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const isSelected = selectedIds.includes(item.id);
            return (
              <Pressable
                onPress={() => onToggle(item.id)}
                style={[
                  styles.pickerRow,
                  {
                    backgroundColor: isSelected ? colors.surface : "transparent",
                  },
                ]}
              >
                <AppIcon name="account-circle" size={32} color={colors.iconSecondary} />
                <AppText variant="body" style={{ flex: 1 }}>
                  {item.name}
                </AppText>
                <AppIcon
                  name={isSelected ? "checkbox-marked" : "checkbox-blank-outline"}
                  size={22}
                  color={isSelected ? colors.primary : colors.iconSecondary}
                />
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <AppText variant="bodySmall" color={colors.textTertiary} style={styles.emptyText}>
              {t("common.noResults")}
            </AppText>
          }
        />
        <View style={styles.modalFooter}>
          <AppButton title={t("common.done")} onPress={onClose} />
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
      {title ? (
        <AppText variant="label" color={colors.textSecondary}>
          {title}
        </AppText>
      ) : null}
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
  emptyPickerWrapper: {
    gap: spacing.xs,
  },
  emptyPicker: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 48,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  footer: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  footerBtn: { flex: 1 },
  modalFooter: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  emptyText: {
    textAlign: "center",
    padding: spacing.xl,
  },
});
