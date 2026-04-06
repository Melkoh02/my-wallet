import { useState, useMemo } from "react";
import { View, StyleSheet, ScrollView, Pressable, Modal, FlatList, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { AppInput } from "@/components/atoms/AppInput";
import { AppButton } from "@/components/atoms/AppButton";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { useTheme } from "@/providers/ThemeProvider";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";
import type { Account, NewAccount } from "@/db/schema";
import type { AccountType } from "@/types";

const ACCOUNT_TYPE_DEFS: { value: AccountType; key: string; icon: string }[] = [
  { value: "debit", key: "accounts.debit", icon: "bank" },
  { value: "credit", key: "accounts.credit", icon: "credit-card" },
  { value: "cash", key: "accounts.cash", icon: "cash" },
  { value: "wallet", key: "accounts.wallet", icon: "wallet" },
  { value: "savings", key: "accounts.savings", icon: "piggy-bank" },
];

const CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CAD",
  "AUD",
  "CHF",
  "CNY",
  "BRL",
  "ARS",
  "PYG",
  "MXN",
  "COP",
  "CLP",
  "PEN",
  "INR",
  "KRW",
  "TWD",
  "THB",
  "SGD",
  "HKD",
  "NZD",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "CZK",
  "HUF",
  "TRY",
  "ZAR",
  "ILS",
  "AED",
  "SAR",
];

const COLORS = [
  "#EF4444",
  "#F59E0B",
  "#10B981",
  "#3B82F6",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
  "#6366F1",
  "#F97316",
  "#06B6D4",
  "#78716C",
  "#607D8B",
];

type AccountFormProps = {
  initial?: Account;
  onSubmit: (data: NewAccount) => void;
  onDelete?: () => void;
};

export function AccountForm({ initial, onSubmit, onDelete }: AccountFormProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? "");
  const [institution, setInstitution] = useState(initial?.institution ?? "");
  const [type, setType] = useState<AccountType>((initial?.type as AccountType) ?? "debit");
  const [balance, setBalance] = useState(initial?.balance?.toString() ?? "0");
  const [creditLimit, setCreditLimit] = useState(initial?.creditLimit?.toString() ?? "");
  const [color, setColor] = useState(initial?.color ?? COLORS[3]);
  const [currency, setCurrency] = useState(initial?.currency ?? "USD");

  const [showTypeModal, setShowTypeModal] = useState(false);
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);
  const [currencySearch, setCurrencySearch] = useState("");

  const filteredCurrencies = useMemo(() => {
    if (!currencySearch.trim()) return CURRENCIES;
    const q = currencySearch.trim().toUpperCase();
    return CURRENCIES.filter((c) => c.includes(q));
  }, [currencySearch]);

  const selectedTypeDef = ACCOUNT_TYPE_DEFS.find((td) => td.value === type);

  const handleSubmit = () => {
    const parsed = parseFloat(balance) || 0;
    onSubmit({
      name: name.trim(),
      institution: institution.trim(),
      type,
      balance: parsed,
      creditLimit: type === "credit" ? parseFloat(creditLimit) || null : null,
      currency,
      color,
      icon: selectedTypeDef?.icon ?? "wallet",
    });
  };

  const isValid = name.trim().length > 0;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <AppInput
        label={t("accounts.accountName")}
        value={name}
        onChangeText={setName}
        placeholder={t("accounts.accountNamePlaceholder")}
      />
      <AppInput
        label={t("accounts.institution")}
        value={institution}
        onChangeText={setInstitution}
        placeholder={t("accounts.institutionPlaceholder")}
      />

      {/* Type selector */}
      <View style={styles.section}>
        <AppText variant="label" color={colors.textSecondary}>
          {t("accounts.type")}
        </AppText>
        <Pressable
          onPress={() => setShowTypeModal(true)}
          style={[
            styles.selectTrigger,
            { borderColor: colors.border, backgroundColor: colors.surface },
          ]}
        >
          <View style={styles.selectTriggerContent}>
            {selectedTypeDef && (
              <AppIcon name={selectedTypeDef.icon} size={20} color={colors.icon} />
            )}
            <AppText variant="body">{selectedTypeDef ? t(selectedTypeDef.key) : ""}</AppText>
          </View>
          <AppIcon name="chevron-down" size={20} color={colors.iconSecondary} />
        </Pressable>
      </View>

      {/* Type picker modal */}
      <Modal
        visible={showTypeModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowTypeModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={styles.modalHeader}>
            <AppText variant="h3">{t("accounts.type")}</AppText>
            <Pressable onPress={() => setShowTypeModal(false)}>
              <AppIcon name="close" size={24} color={colors.icon} />
            </Pressable>
          </View>
          {ACCOUNT_TYPE_DEFS.map((td) => {
            const isSelected = type === td.value;
            return (
              <Pressable
                key={td.value}
                onPress={() => {
                  setType(td.value);
                  setShowTypeModal(false);
                }}
                style={[
                  styles.optionRow,
                  {
                    backgroundColor: isSelected ? colors.primary + "14" : "transparent",
                    borderColor: isSelected ? colors.primary : "transparent",
                  },
                ]}
              >
                <AppIcon
                  name={td.icon}
                  size={22}
                  color={isSelected ? colors.primary : colors.icon}
                />
                <AppText
                  variant="body"
                  color={isSelected ? colors.primary : colors.text}
                  style={styles.optionLabel}
                >
                  {t(td.key)}
                </AppText>
                {isSelected && <AppIcon name="check" size={20} color={colors.primary} />}
              </Pressable>
            );
          })}
        </SafeAreaView>
      </Modal>

      <AppInput
        label={t("accounts.initialBalance")}
        value={balance}
        onChangeText={setBalance}
        keyboardType="decimal-pad"
        placeholder="0.00"
      />

      {type === "credit" && (
        <AppInput
          label={t("accounts.creditLimit")}
          value={creditLimit}
          onChangeText={setCreditLimit}
          keyboardType="decimal-pad"
          placeholder="0.00"
        />
      )}

      {/* Currency selector */}
      <View style={styles.section}>
        <AppText variant="label" color={colors.textSecondary}>
          {t("accounts.currency")}
        </AppText>
        <Pressable
          onPress={() => setShowCurrencyModal(true)}
          style={[
            styles.selectTrigger,
            { borderColor: colors.border, backgroundColor: colors.surface },
          ]}
        >
          <AppText variant="body">{currency}</AppText>
          <AppIcon name="chevron-down" size={20} color={colors.iconSecondary} />
        </Pressable>
      </View>

      {/* Currency picker modal */}
      <Modal
        visible={showCurrencyModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCurrencyModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={styles.modalHeader}>
            <AppText variant="h3">{t("accounts.currency")}</AppText>
            <Pressable onPress={() => setShowCurrencyModal(false)}>
              <AppIcon name="close" size={24} color={colors.icon} />
            </Pressable>
          </View>
          <View style={styles.searchContainer}>
            <TextInput
              value={currencySearch}
              onChangeText={setCurrencySearch}
              placeholder={t("common.search")}
              placeholderTextColor={colors.placeholder}
              style={[
                styles.searchInput,
                typography.body,
                {
                  color: colors.text,
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
              autoCapitalize="characters"
              autoCorrect={false}
            />
          </View>
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
        </SafeAreaView>
      </Modal>

      <View style={styles.section}>
        <AppText variant="label" color={colors.textSecondary}>
          {t("accounts.color")}
        </AppText>
        <View style={styles.colorRow}>
          {COLORS.map((c) => (
            <View
              key={c}
              style={[
                styles.colorDot,
                { backgroundColor: c, borderColor: color === c ? colors.text : "transparent" },
              ]}
              onTouchEnd={() => setColor(c)}
            />
          ))}
        </View>
      </View>

      <View style={styles.actions}>
        <AppButton
          title={initial ? t("accounts.saveChanges") : t("accounts.createAccount")}
          onPress={handleSubmit}
          disabled={!isValid}
        />
        {initial && onDelete && (
          <AppButton
            title={t("accounts.archiveAccount")}
            onPress={onDelete}
            variant="danger"
            icon="archive"
          />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  container: {
    gap: spacing.lg,
    paddingBottom: spacing["5xl"],
  },
  section: {
    gap: spacing.xs,
  },
  selectTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 48,
  },
  selectTriggerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  colorRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  colorDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2.5,
  },
  actions: {
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
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
