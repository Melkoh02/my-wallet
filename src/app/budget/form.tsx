import { useEffect, useMemo, useState } from "react";
import {
  View,
  Pressable,
  Switch,
  StyleSheet,
  Modal,
  FlatList,
  TextInput,
  type TextStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { ModalLayout } from "@/components/templates/ModalLayout";
import { AppInput } from "@/components/atoms/AppInput";
import { AppButton } from "@/components/atoms/AppButton";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { ConfirmModal } from "@/components/atoms/ConfirmModal";
import { SelectInput } from "@/components/molecules/SelectInput";
import { useTheme } from "@/providers/ThemeProvider";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import { useCategories } from "@/hooks/useCategories";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";
import { formatAmountInput, unformatAmount } from "@/utils/format";
import { SUPPORTED_CURRENCIES } from "@/constants/currencies";
import { getSetting } from "@/db/queries/settings";
import { createBudget, getBudgetById, updateBudget, deleteBudget } from "@/db/queries/budgets";
import { getCategoryById, type CategoryWithSubs } from "@/db/queries/categories";
import type { NewBudget } from "@/db/schema";

export default function BudgetFormScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { invalidate } = useDataRefresh();
  const { categories } = useCategories();
  const params = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!params.id;

  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [subcategoryId, setSubcategoryId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  // pinCurrency=true → use a specific `currency`; pinCurrency=false → store
  // null (follow display currency).
  const [pinCurrency, setPinCurrency] = useState(true);
  const [currency, setCurrency] = useState("USD");

  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showSubcategoryModal, setShowSubcategoryModal] = useState(false);
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);
  const [currencySearch, setCurrencySearch] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // When editing a budget whose linked category has been soft-deleted, the
  // active-only picker list won't include it. We fetch the category by id
  // (regardless of active state) and stash it here so (a) the SelectInput
  // can show its name and (b) we can render an info banner.
  const [orphanedCategory, setOrphanedCategory] = useState<CategoryWithSubs | null>(null);

  const [loaded, setLoaded] = useState(!isEditing);

  // Default the currency picker to the user's display currency when creating
  // — matches "what's the most-likely value" expectation.
  useEffect(() => {
    if (!isEditing) {
      getSetting("display_currency").then((v) => {
        if (v) setCurrency(v);
      });
    }
  }, [isEditing]);

  // Load existing budget when editing
  useEffect(() => {
    if (params.id) {
      (async () => {
        const b = await getBudgetById(parseInt(params.id!, 10));
        if (b) {
          setName(b.name);
          setCategoryId(b.categoryId);
          setSubcategoryId(b.subcategoryId);
          setAmount(formatAmountInput(b.amount.toString()));
          if (b.currency) {
            setPinCurrency(true);
            setCurrency(b.currency);
          } else {
            setPinCurrency(false);
          }
          // Fetch the linked category directly (bypasses the active-only
          // picker list) so we can detect soft-deleted parents and still
          // show the user what category this budget targets.
          const linkedCat = await getCategoryById(b.categoryId);
          if (linkedCat && !linkedCat.isActive) {
            setOrphanedCategory(linkedCat);
          }
        }
        setLoaded(true);
      })();
    }
  }, [params.id]);

  // Active categories from the hook, plus the orphaned (soft-deleted) one if
  // it applies to this budget. The orphan is kept selectable for display but
  // stays out of the picker list so the user can't pick it for a new budget.
  const selectedCategory = useMemo(() => {
    const fromActive = categories.find((c) => c.id === categoryId);
    if (fromActive) return fromActive;
    if (orphanedCategory && orphanedCategory.id === categoryId) return orphanedCategory;
    return undefined;
  }, [categories, categoryId, orphanedCategory]);
  const selectedSubcategory = useMemo(
    () => selectedCategory?.subcategories.find((s) => s.id === subcategoryId) ?? null,
    [selectedCategory, subcategoryId],
  );

  // Default the budget name to the selected category's name (or category +
  // subcategory) until the user types something custom. We only auto-populate
  // when name is blank or matches the previously-defaulted value, so manual
  // edits stick.
  useEffect(() => {
    if (!selectedCategory) return;
    const suggested = selectedSubcategory
      ? `${selectedCategory.name} · ${selectedSubcategory.name}`
      : selectedCategory.name;
    if (!name) setName(suggested);
  }, [selectedCategory, selectedSubcategory, name]);

  const filteredCurrencies = useMemo(() => {
    if (!currencySearch.trim()) return SUPPORTED_CURRENCIES;
    const q = currencySearch.trim().toUpperCase();
    return SUPPORTED_CURRENCIES.filter((c) => c.includes(q));
  }, [currencySearch]);

  const parsedAmount = parseFloat(unformatAmount(amount)) || 0;
  const isValid = !!name.trim() && categoryId !== null && parsedAmount > 0;

  const handleSubmit = async () => {
    const data: NewBudget = {
      name: name.trim(),
      categoryId: categoryId!,
      subcategoryId: subcategoryId,
      amount: parsedAmount,
      currency: pinCurrency ? currency : null,
      period: "monthly",
      isActive: true,
    };
    if (isEditing && params.id) {
      await updateBudget(parseInt(params.id, 10), data);
    } else {
      await createBudget(data);
    }
    invalidate("budgets");
    router.back();
  };

  const handleDelete = async () => {
    if (!params.id) return;
    await deleteBudget(parseInt(params.id, 10));
    invalidate("budgets");
    setShowDeleteConfirm(false);
    router.back();
  };

  if (!loaded) return null;

  return (
    <ModalLayout
      title={isEditing ? t("budgets.editTitle") : t("budgets.newTitle")}
      onClose={() => router.back()}
    >
      <View style={styles.container}>
        <AppInput
          label={t("budgets.nameLabel")}
          value={name}
          onChangeText={setName}
          placeholder={t("budgets.namePlaceholder")}
        />

        {/* Category picker */}
        <View style={styles.section}>
          <SelectInput
            label={t("budgets.categoryLabel")}
            value={selectedCategory?.name}
            placeholder={t("common.select")}
            onPress={() => setShowCategoryModal(true)}
          />
          {orphanedCategory && categoryId === orphanedCategory.id && (
            <AppText variant="caption" color={colors.danger}>
              {t("budgets.orphanedCategoryHint", { name: orphanedCategory.name })}
            </AppText>
          )}
        </View>

        {/* Subcategory picker (optional) */}
        {selectedCategory && (
          <View style={styles.section}>
            <SelectInput
              label={`${t("budgets.subcategoryLabel")} (${t("common.optional")})`}
              value={selectedSubcategory?.name}
              placeholder={t("budgets.allSubcategories")}
              onPress={() => setShowSubcategoryModal(true)}
            />
            {selectedSubcategory && (
              <Pressable onPress={() => setSubcategoryId(null)}>
                <AppText variant="caption" color={colors.danger}>
                  {t("common.remove")}
                </AppText>
              </Pressable>
            )}
          </View>
        )}

        <AppInput
          label={t("budgets.amountLabel")}
          value={amount}
          onChangeText={(v) => setAmount(formatAmountInput(v))}
          keyboardType="decimal-pad"
          placeholder="0"
        />

        {/* Currency mode */}
        <View style={[styles.toggleRow, { backgroundColor: colors.card }]}>
          <AppIcon name="currency-usd" size={22} color={colors.primary} />
          <View style={styles.toggleText}>
            <AppText variant="body">{t("budgets.pinCurrency")}</AppText>
            <AppText variant="caption" color={colors.textSecondary}>
              {pinCurrency ? t("budgets.pinCurrencyOn") : t("budgets.pinCurrencyOff")}
            </AppText>
          </View>
          <Switch value={pinCurrency} onValueChange={setPinCurrency} />
        </View>
        {pinCurrency && (
          <SelectInput
            label={t("accounts.currency")}
            value={currency}
            onPress={() => setShowCurrencyModal(true)}
          />
        )}

        <View style={styles.actions}>
          <AppButton
            title={isEditing ? t("budgets.saveChanges") : t("budgets.create")}
            onPress={handleSubmit}
            disabled={!isValid}
          />
          {isEditing && (
            <AppButton
              title={t("budgets.delete")}
              onPress={() => setShowDeleteConfirm(true)}
              variant="danger"
              icon="delete"
            />
          )}
        </View>
      </View>

      {/* Category picker modal */}
      <PickerSheet
        visible={showCategoryModal}
        title={t("budgets.categoryLabel")}
        onClose={() => setShowCategoryModal(false)}
      >
        {categories.map((c) => {
          const isSelected = c.id === categoryId;
          return (
            <Pressable
              key={c.id}
              onPress={() => {
                if (c.id !== categoryId) {
                  setCategoryId(c.id);
                  setSubcategoryId(null); // reset subcategory if category changes
                }
                setShowCategoryModal(false);
              }}
              style={[
                styles.optionRow,
                {
                  backgroundColor: isSelected ? colors.primary + "14" : "transparent",
                  borderColor: isSelected ? colors.primary : "transparent",
                },
              ]}
            >
              <AppIcon name={c.icon} size={22} color={isSelected ? colors.primary : colors.icon} />
              <AppText
                variant="body"
                color={isSelected ? colors.primary : colors.text}
                style={styles.optionLabel}
              >
                {c.name}
              </AppText>
              {isSelected && <AppIcon name="check" size={20} color={colors.primary} />}
            </Pressable>
          );
        })}
      </PickerSheet>

      {/* Subcategory picker modal */}
      {selectedCategory && (
        <PickerSheet
          visible={showSubcategoryModal}
          title={t("budgets.subcategoryLabel")}
          onClose={() => setShowSubcategoryModal(false)}
        >
          {selectedCategory.subcategories.map((s) => {
            const isSelected = s.id === subcategoryId;
            return (
              <Pressable
                key={s.id}
                onPress={() => {
                  setSubcategoryId(s.id);
                  setShowSubcategoryModal(false);
                }}
                style={[
                  styles.optionRow,
                  {
                    backgroundColor: isSelected ? colors.primary + "14" : "transparent",
                    borderColor: isSelected ? colors.primary : "transparent",
                  },
                ]}
              >
                <AppText
                  variant="body"
                  color={isSelected ? colors.primary : colors.text}
                  style={styles.optionLabel}
                >
                  {s.name}
                </AppText>
                {isSelected && <AppIcon name="check" size={20} color={colors.primary} />}
              </Pressable>
            );
          })}
        </PickerSheet>
      )}

      {/* Currency picker modal */}
      <PickerSheet
        visible={showCurrencyModal}
        title={t("accounts.currency")}
        onClose={() => {
          setShowCurrencyModal(false);
          setCurrencySearch("");
        }}
        searchValue={currencySearch}
        onSearchChange={setCurrencySearch}
      >
        <FlatList
          data={filteredCurrencies}
          keyExtractor={(item) => item}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const isSelected = currency === item;
            return (
              <Pressable
                onPress={() => {
                  setCurrency(item);
                  setCurrencySearch("");
                  setShowCurrencyModal(false);
                }}
                style={[
                  styles.optionRow,
                  {
                    backgroundColor: isSelected ? colors.primary + "14" : "transparent",
                    borderColor: isSelected ? colors.primary : "transparent",
                  },
                ]}
              >
                <AppText
                  variant="body"
                  color={isSelected ? colors.primary : colors.text}
                  style={styles.optionLabel}
                >
                  {item}
                </AppText>
                {isSelected && <AppIcon name="check" size={20} color={colors.primary} />}
              </Pressable>
            );
          }}
        />
      </PickerSheet>

      <ConfirmModal
        visible={showDeleteConfirm}
        title={t("budgets.deleteTitle")}
        message={t("budgets.deleteMessage", { name })}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </ModalLayout>
  );
}

// Inline modal sheet — slightly different from PickerModal because it accepts
// arbitrary children (lets us reuse for the in-form pickers without forcing
// a specific renderItem signature).
function PickerSheet({
  visible,
  title,
  onClose,
  searchValue,
  onSearchChange,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  searchValue?: string;
  onSearchChange?: (v: string) => void;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[modalStyles.container, { backgroundColor: colors.background }]}>
        <View style={modalStyles.header}>
          <AppText variant="h3">{title}</AppText>
          <Pressable onPress={onClose}>
            <AppIcon name="close" size={24} color={colors.icon} />
          </Pressable>
        </View>
        {onSearchChange !== undefined && (
          <View style={modalStyles.searchContainer}>
            <TextInput
              value={searchValue}
              onChangeText={onSearchChange}
              placeholderTextColor={colors.placeholder}
              autoCapitalize="characters"
              autoCorrect={false}
              style={
                [
                  modalStyles.searchInput,
                  typography.body,
                  {
                    color: colors.text,
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ] as unknown as TextStyle
              }
            />
          </View>
        )}
        {children}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.lg,
    paddingBottom: spacing["2xl"],
  },
  section: {
    gap: spacing.xs,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 12,
  },
  toggleText: {
    flex: 1,
    gap: 2,
  },
  actions: {
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xs,
    borderRadius: 10,
  },
  optionLabel: {
    flex: 1,
  },
});

const modalStyles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  searchContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
});
