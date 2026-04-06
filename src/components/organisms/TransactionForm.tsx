import { useState } from "react";
import { View, ScrollView, Switch, Modal, FlatList, Pressable, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { AppInput } from "@/components/atoms/AppInput";
import { AppButton } from "@/components/atoms/AppButton";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { DatePicker } from "@/components/molecules/DatePicker";
import { TimePicker } from "@/components/molecules/TimePicker";
import { CategoryPicker } from "@/components/organisms/CategoryPicker";
import { ContactPicker } from "@/components/organisms/ContactPicker";
import { useTheme } from "@/providers/ThemeProvider";
import { spacing } from "@/theme/spacing";
import { todayDateString, nowTimeString, formatCurrency } from "@/utils/format";
import { getCurrentLocation } from "@/services/location.service";
import type { Account, NewTransaction } from "@/db/schema";
import type { CategoryWithSubs } from "@/db/queries/categories";
import type { TransactionType } from "@/types";

export type TransactionFormData = NewTransaction & {
  /** Cashback info — null if no cashback */
  cashbackEnabled: boolean;
  cashbackMode: "percent" | "flat";
  cashbackValue: number;
  instantCashback: boolean;
};

type TransactionFormProps = {
  accounts: Account[];
  categories: CategoryWithSubs[];
  onSubmit: (data: TransactionFormData, subcategoryIds: number[]) => void;
  initialType?: TransactionType;
  initialData?: TransactionFormData & { subcategoryIds: number[] };
  locationEnabled?: boolean;
};

/* ---------- Account Picker Modal ---------- */
function AccountPickerModal({
  visible,
  accounts,
  selected,
  onSelect,
  onClose,
  title,
}: {
  visible: boolean;
  accounts: Account[];
  selected: number | null;
  onSelect: (id: number) => void;
  onClose: () => void;
  title: string;
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
        <FlatList
          data={accounts}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                onSelect(item.id);
                onClose();
              }}
              style={({ pressed }) => [
                modalStyles.row,
                {
                  backgroundColor: pressed
                    ? colors.borderLight
                    : item.id === selected
                      ? colors.surface
                      : "transparent",
                },
              ]}
            >
              <View style={[modalStyles.iconWrap, { backgroundColor: item.color + "20" }]}>
                <AppIcon name={item.icon} size={20} color={item.color} />
              </View>
              <View style={modalStyles.rowInfo}>
                <AppText variant="body">{item.name}</AppText>
                {item.institution ? (
                  <AppText variant="caption" color={colors.textSecondary}>
                    {item.institution}
                  </AppText>
                ) : null}
              </View>
              {item.id === selected && <AppIcon name="check" size={20} color={colors.primary} />}
            </Pressable>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}

/* ---------- Main Form ---------- */
export function TransactionForm({
  accounts,
  categories,
  onSubmit,
  initialType = "expense",
  initialData,
  locationEnabled = false,
}: TransactionFormProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  // Core fields
  const [type, setType] = useState<TransactionType>(
    (initialData?.type as TransactionType) ?? initialType,
  );
  const [amount, setAmount] = useState(initialData?.amount?.toString() ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [accountId, setAccountId] = useState<number | null>(
    initialData?.accountId ?? accounts[0]?.id ?? null,
  );
  const [toAccountId, setToAccountId] = useState<number | null>(initialData?.toAccountId ?? null);
  const [date, setDate] = useState(initialData?.date ?? todayDateString());
  const [time, setTime] = useState(initialData?.time ?? nowTimeString());
  const [subcategoryIds, setSubcategoryIds] = useState<number[]>(initialData?.subcategoryIds ?? []);
  const [contact, setContact] = useState<{ id: string; name: string } | null>(
    initialData?.contactId
      ? { id: initialData.contactId, name: initialData.contactName ?? "" }
      : null,
  );

  // Cashback
  const [cashbackEnabled, setCashbackEnabled] = useState(initialData?.cashbackEnabled ?? false);
  const [cashbackMode, setCashbackMode] = useState<"percent" | "flat">(
    initialData?.cashbackMode ?? "percent",
  );
  const [cashbackValue, setCashbackValue] = useState(initialData?.cashbackValue?.toString() ?? "");
  const [cashbackAccountId, setCashbackAccountId] = useState<number | null>(
    initialData?.cashbackAccountId ?? null,
  );
  const [instantCashback, setInstantCashback] = useState(initialData?.instantCashback ?? false);

  // Location
  const [locationLoading, setLocationLoading] = useState(false);
  const [location, setLocation] = useState<{
    latitude: number;
    longitude: number;
    name?: string;
  } | null>(
    initialData?.latitude != null
      ? {
          latitude: initialData.latitude,
          longitude: initialData.longitude!,
          name: initialData.locationName ?? undefined,
        }
      : null,
  );
  const [locationError, setLocationError] = useState("");

  // Account picker modals
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [showToAccountPicker, setShowToAccountPicker] = useState(false);
  const [showCashbackAccountPicker, setShowCashbackAccountPicker] = useState(false);

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const selectedToAccount = accounts.find((a) => a.id === toAccountId);
  const selectedCashbackAccount = accounts.find((a) => a.id === cashbackAccountId);

  const computedCashback = (() => {
    const amt = parseFloat(amount) || 0;
    const val = parseFloat(cashbackValue) || 0;
    if (!cashbackEnabled || val <= 0 || amt <= 0) return 0;
    return cashbackMode === "percent" ? Math.round((val / 100) * amt * 100) / 100 : val;
  })();

  const handleAddLocation = async () => {
    setLocationLoading(true);
    setLocationError("");
    const loc = await getCurrentLocation();
    if (loc) setLocation(loc);
    else setLocationError(t("transactionForm.locationFailed"));
    setLocationLoading(false);
  };

  const handleSubmit = () => {
    const parsed = parseFloat(amount);
    if (!parsed || !accountId) return;

    onSubmit(
      {
        type,
        amount: parsed,
        description: description.trim(),
        accountId,
        toAccountId: type === "transfer" ? toAccountId : null,
        date,
        time,
        notes: null,
        contactId: contact?.id ?? null,
        contactName: contact?.name ?? null,
        latitude: location?.latitude ?? null,
        longitude: location?.longitude ?? null,
        locationName: location?.name ?? null,
        cashbackAmount: cashbackEnabled && computedCashback > 0 ? computedCashback : null,
        cashbackAccountId: cashbackEnabled ? cashbackAccountId : null,
        cashbackEnabled,
        cashbackMode,
        cashbackValue: parseFloat(cashbackValue) || 0,
        instantCashback,
      },
      subcategoryIds,
    );
  };

  const isValid =
    parseFloat(amount) > 0 &&
    accountId !== null &&
    (type !== "transfer" || (toAccountId !== null && toAccountId !== accountId));

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      {/* Type selector */}
      <View style={styles.typeRow}>
        {(["expense", "income", "transfer"] as const).map((tp) => {
          const isActive = type === tp;
          const tColor =
            tp === "income" ? colors.income : tp === "expense" ? colors.expense : colors.transfer;
          return (
            <Pressable
              key={tp}
              onPress={() => setType(tp)}
              style={[
                styles.typeBtn,
                {
                  backgroundColor: isActive ? tColor + "18" : colors.surface,
                  borderColor: isActive ? tColor : colors.border,
                },
              ]}
            >
              <AppText variant="label" color={isActive ? tColor : colors.textSecondary}>
                {t(`transactionForm.${tp}`)}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <AppInput
        label={t("transactionForm.amount")}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        placeholder="0.00"
      />
      <AppInput
        label={t("transactionForm.description")}
        value={description}
        onChangeText={setDescription}
        placeholder={t("transactionForm.descriptionPlaceholder")}
      />

      {/* Account selector — modal based */}
      {accounts.length === 0 ? (
        <View
          style={[
            styles.noAccountsCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <AppIcon name="wallet-plus" size={28} color={colors.iconSecondary} />
          <AppText variant="body" color={colors.textSecondary}>
            {t("transactionForm.noAccounts")}
          </AppText>
        </View>
      ) : (
        <>
          <Pressable
            onPress={() => setShowAccountPicker(true)}
            style={[
              styles.selectInput,
              { borderColor: colors.border, backgroundColor: colors.surface },
            ]}
          >
            <AppText variant="label" color={colors.textSecondary} style={styles.selectLabel}>
              {type === "transfer"
                ? t("transactionForm.fromAccount")
                : t("transactionForm.account")}
            </AppText>
            <View style={styles.selectValue}>
              {selectedAccount ? (
                <>
                  <AppIcon name={selectedAccount.icon} size={18} color={selectedAccount.color} />
                  <AppText variant="body">{selectedAccount.name}</AppText>
                </>
              ) : (
                <AppText variant="body" color={colors.placeholder}>
                  {t("common.select")}
                </AppText>
              )}
              <AppIcon name="chevron-down" size={18} color={colors.iconSecondary} />
            </View>
          </Pressable>

          {type === "transfer" && (
            <Pressable
              onPress={() => setShowToAccountPicker(true)}
              style={[
                styles.selectInput,
                { borderColor: colors.border, backgroundColor: colors.surface },
              ]}
            >
              <AppText variant="label" color={colors.textSecondary} style={styles.selectLabel}>
                {t("transactionForm.toAccount")}
              </AppText>
              <View style={styles.selectValue}>
                {selectedToAccount ? (
                  <>
                    <AppIcon
                      name={selectedToAccount.icon}
                      size={18}
                      color={selectedToAccount.color}
                    />
                    <AppText variant="body">{selectedToAccount.name}</AppText>
                  </>
                ) : (
                  <AppText variant="body" color={colors.placeholder}>
                    {t("common.select")}
                  </AppText>
                )}
                <AppIcon name="chevron-down" size={18} color={colors.iconSecondary} />
              </View>
            </Pressable>
          )}
        </>
      )}

      {type !== "transfer" && (
        <CategoryPicker
          categories={categories}
          selected={subcategoryIds}
          onSelectionChange={setSubcategoryIds}
        />
      )}
      {type !== "transfer" && <ContactPicker selected={contact} onSelect={setContact} />}

      <View style={styles.row}>
        <View style={styles.halfInput}>
          <DatePicker label={t("transactionForm.date")} value={date} onChange={setDate} />
        </View>
        <View style={styles.halfInput}>
          <TimePicker label={t("transactionForm.time")} value={time} onChange={setTime} />
        </View>
      </View>

      {locationEnabled && (
        <View style={styles.section}>
          {location ? (
            <View style={styles.locationRow}>
              <AppText variant="bodySmall" color={colors.textSecondary} style={styles.locationText}>
                {"📍 "}
                {location.name ||
                  `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`}
              </AppText>
              <Pressable onPress={() => setLocation(null)}>
                <AppText variant="caption" color={colors.danger}>
                  {t("common.remove")}
                </AppText>
              </Pressable>
            </View>
          ) : (
            <>
              <AppButton
                title={
                  locationLoading
                    ? t("transactionForm.gettingLocation")
                    : t("transactionForm.addLocation")
                }
                variant="ghost"
                icon="map-marker-plus"
                onPress={handleAddLocation}
                disabled={locationLoading}
              />
              {locationError ? (
                <AppText variant="caption" color={colors.warning}>
                  {locationError}
                </AppText>
              ) : null}
            </>
          )}
        </View>
      )}

      {/* Cashback — expense only */}
      {type === "expense" && accounts.length > 0 && (
        <View
          style={[
            styles.cashbackCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.cashbackHeader}>
            <AppIcon name="cash-refund" size={20} color={colors.income} />
            <AppText variant="label" style={styles.flex}>
              {t("settings.cashback")}
            </AppText>
            <Switch value={cashbackEnabled} onValueChange={setCashbackEnabled} />
          </View>

          {cashbackEnabled && (
            <View style={styles.cashbackBody}>
              {/* Mode toggle: % or flat */}
              <View style={styles.modeRow}>
                <Pressable
                  onPress={() => setCashbackMode("percent")}
                  style={[
                    styles.modeBtn,
                    {
                      backgroundColor:
                        cashbackMode === "percent" ? colors.primary + "18" : colors.background,
                      borderColor: cashbackMode === "percent" ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <AppText
                    variant="label"
                    color={cashbackMode === "percent" ? colors.primary : colors.textSecondary}
                  >
                    %
                  </AppText>
                </Pressable>
                <Pressable
                  onPress={() => setCashbackMode("flat")}
                  style={[
                    styles.modeBtn,
                    {
                      backgroundColor:
                        cashbackMode === "flat" ? colors.primary + "18" : colors.background,
                      borderColor: cashbackMode === "flat" ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <AppText
                    variant="label"
                    color={cashbackMode === "flat" ? colors.primary : colors.textSecondary}
                  >
                    {t("transactionForm.flat")}
                  </AppText>
                </Pressable>
                <View style={styles.flex}>
                  <AppInput
                    value={cashbackValue}
                    onChangeText={setCashbackValue}
                    keyboardType="decimal-pad"
                    placeholder={
                      cashbackMode === "percent"
                        ? t("transactionForm.cashbackPercentPlaceholder")
                        : t("transactionForm.cashbackFlatPlaceholder")
                    }
                  />
                </View>
              </View>

              {/* Computed amount preview */}
              {computedCashback > 0 && (
                <AppText variant="bodySmall" color={colors.income}>
                  {t("settings.cashback")}: {formatCurrency(computedCashback)}
                </AppText>
              )}

              {/* Cashback account — modal picker */}
              <Pressable
                onPress={() => setShowCashbackAccountPicker(true)}
                style={[
                  styles.selectInput,
                  { borderColor: colors.border, backgroundColor: colors.background },
                ]}
              >
                <AppText variant="caption" color={colors.textSecondary} style={styles.selectLabel}>
                  {t("settings.cashbackAccount")}
                </AppText>
                <View style={styles.selectValue}>
                  {selectedCashbackAccount ? (
                    <>
                      <AppIcon
                        name={selectedCashbackAccount.icon}
                        size={16}
                        color={selectedCashbackAccount.color}
                      />
                      <AppText variant="bodySmall">{selectedCashbackAccount.name}</AppText>
                    </>
                  ) : (
                    <AppText variant="bodySmall" color={colors.placeholder}>
                      {t("common.select")}
                    </AppText>
                  )}
                  <AppIcon name="chevron-down" size={16} color={colors.iconSecondary} />
                </View>
              </Pressable>

              {/* Instant cashback toggle */}
              <View style={styles.instantRow}>
                <AppText variant="bodySmall" color={colors.textSecondary} style={styles.flex}>
                  {t("transactionForm.instantCashback")}
                </AppText>
                <Switch value={instantCashback} onValueChange={setInstantCashback} />
              </View>
            </View>
          )}
        </View>
      )}

      <AppButton
        title={initialData ? t("accounts.saveChanges") : t("transactionForm.saveTransaction")}
        onPress={handleSubmit}
        disabled={!isValid}
      />

      {/* Account picker modals */}
      <AccountPickerModal
        visible={showAccountPicker}
        accounts={accounts}
        selected={accountId}
        onSelect={setAccountId}
        onClose={() => setShowAccountPicker(false)}
        title={
          type === "transfer" ? t("transactionForm.fromAccount") : t("transactionForm.account")
        }
      />
      <AccountPickerModal
        visible={showToAccountPicker}
        accounts={accounts.filter((a) => a.id !== accountId)}
        selected={toAccountId}
        onSelect={setToAccountId}
        onClose={() => setShowToAccountPicker(false)}
        title={t("transactionForm.toAccount")}
      />
      <AccountPickerModal
        visible={showCashbackAccountPicker}
        accounts={accounts}
        selected={cashbackAccountId}
        onSelect={setCashbackAccountId}
        onClose={() => setShowCashbackAccountPicker(false)}
        title={t("settings.cashbackAccount")}
      />
    </ScrollView>
  );
}

const modalStyles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  rowInfo: { flex: 1, gap: 2 },
});

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  container: { gap: spacing.lg, paddingBottom: spacing["5xl"] },
  typeRow: { flexDirection: "row", gap: spacing.sm },
  typeBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1.5,
  },
  section: { gap: spacing.sm },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  row: { flexDirection: "row", gap: spacing.md },
  halfInput: { flex: 1 },
  flex: { flex: 1 },
  noAccountsCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: 12,
    borderWidth: 1,
  },
  selectInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  selectLabel: { marginBottom: 2 },
  selectValue: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 32 },
  locationRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  locationText: { flex: 1 },
  cashbackCard: { borderWidth: 1, borderRadius: 12, padding: spacing.md, gap: spacing.md },
  cashbackHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  cashbackBody: { gap: spacing.md },
  modeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  modeBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  instantRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
});
