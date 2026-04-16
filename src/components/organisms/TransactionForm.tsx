import { useState, useEffect, useRef } from "react";
import { View, ScrollView, Switch, Pressable, StyleSheet, TextInput, FlatList } from "react-native";
import { useTranslation } from "react-i18next";
import { AppInput } from "@/components/atoms/AppInput";
import { AppButton } from "@/components/atoms/AppButton";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { DatePicker } from "@/components/molecules/DatePicker";
import { TimePicker } from "@/components/molecules/TimePicker";
import { SelectInput } from "@/components/molecules/SelectInput";
import { PickerModal } from "@/components/molecules/PickerModal";
import { CategoryChipPicker } from "@/components/organisms/CategoryChipPicker";
import { ContactPicker } from "@/components/organisms/ContactPicker";
import { useTheme } from "@/providers/ThemeProvider";
import { spacing } from "@/theme/spacing";
import {
  todayDateString,
  nowTimeString,
  formatCurrency,
  formatAmountInput,
  unformatAmount,
} from "@/utils/format";
import { getCurrentLocation } from "@/services/location.service";
import { getLastAccountByType, getFrequentCategoriesByType } from "@/db/queries/transactions";
import type { Account, NewTransaction } from "@/db/schema";
import type { CategoryWithSubs } from "@/db/queries/categories";
import type { TemplateWithSubs } from "@/db/queries/templates";
import type { TransactionType } from "@/types";

export type SplitPerson = {
  contactId: string | null;
  name: string;
  amount: number;
  paid: boolean;
};

export type TransactionFormData = NewTransaction & {
  cashbackEnabled: boolean;
  cashbackMode: "percent" | "flat";
  cashbackValue: number;
  instantCashback: boolean;
  splitEnabled: boolean;
  splitPeople: SplitPerson[];
};

type TransactionFormProps = {
  accounts: Account[];
  categories: CategoryWithSubs[];
  templates?: TemplateWithSubs[];
  onSubmit: (data: TransactionFormData, subcategoryIds: number[]) => void;
  initialType?: TransactionType;
  initialAccountId?: number;
  initialToAccountId?: number;
  initialData?: TransactionFormData & { subcategoryIds: number[] };
  locationEnabled?: boolean;
};

/* ---------- Main Form ---------- */
export function TransactionForm({
  accounts,
  categories,
  templates = [],
  onSubmit,
  initialType = "expense",
  initialAccountId,
  initialToAccountId,
  initialData,
  locationEnabled = false,
}: TransactionFormProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const amountRef = useRef<TextInput>(null);
  const isEditing = !!initialData;

  // Core fields
  const [type, setType] = useState<TransactionType>(
    (initialData?.type as TransactionType) ?? initialType,
  );
  const [amount, setAmount] = useState(
    initialData?.amount ? formatAmountInput(initialData.amount.toString()) : "",
  );
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [accountId, setAccountId] = useState<number | null>(
    initialData?.accountId ?? initialAccountId ?? null,
  );
  const [toAccountId, setToAccountId] = useState<number | null>(
    initialData?.toAccountId ?? initialToAccountId ?? null,
  );
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

  // Split bill
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splitPeople, setSplitPeople] = useState<
    { contactId: string | null; name: string; amount: string; paid: boolean }[]
  >([{ contactId: null, name: "", amount: "", paid: false }]);

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

  // Item 2: Default account from last transaction of same type (new transactions only)
  useEffect(() => {
    if (isEditing || accountId !== null) return;
    getLastAccountByType(type).then((lastAccId) => {
      if (lastAccId && accounts.some((a) => a.id === lastAccId)) {
        setAccountId(lastAccId);
      } else if (accounts.length > 0) {
        setAccountId(accounts[0].id);
      }
    });
  }, [type, accounts, isEditing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Item 5: Suggest categories from last transaction of same type (new transactions only)
  const [suggestedCategoryIds, setSuggestedCategoryIds] = useState<number[]>([]);
  useEffect(() => {
    if (isEditing) return;
    getFrequentCategoriesByType(type, 3).then((ids) => {
      setSuggestedCategoryIds(ids);
    });
  }, [type, isEditing]);

  // Item 3: Autofocus amount field (new transactions only)
  useEffect(() => {
    if (!isEditing) {
      setTimeout(() => amountRef.current?.focus(), 350);
    }
  }, [isEditing]);

  const applyTemplate = (tpl: TemplateWithSubs) => {
    setType(tpl.type as TransactionType);
    if (tpl.amount > 0) setAmount(formatAmountInput(tpl.amount.toString()));
    if (tpl.description) setDescription(tpl.description);
    if (tpl.accountId) setAccountId(tpl.accountId);
    if (tpl.toAccountId) setToAccountId(tpl.toAccountId);
    if (tpl.subcategoryIds.length > 0) setSubcategoryIds(tpl.subcategoryIds);
    if (tpl.contactId) setContact({ id: tpl.contactId, name: tpl.contactName ?? "" });
  };

  // Auto-split equally when total amount or people count changes
  useEffect(() => {
    if (!splitEnabled) return;
    const total = parseFloat(unformatAmount(amount)) || 0;
    const count = splitPeople.length + 1; // +1 for yourself
    if (total > 0 && count > 1) {
      const share = Math.round((total / count) * 100) / 100;
      setSplitPeople((prev) =>
        prev.map((p) =>
          p.amount === "" || parseFloat(p.amount) === 0 ? { ...p, amount: share.toString() } : p,
        ),
      );
    }
  }, [splitEnabled, amount, splitPeople.length]);

  const handleAmountChange = (text: string) => {
    setAmount(formatAmountInput(text));
  };

  const computedCashback = (() => {
    const amt = parseFloat(unformatAmount(amount)) || 0;
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
    const parsed = parseFloat(unformatAmount(amount));
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
        splitEnabled,
        splitPeople:
          splitEnabled && type === "expense"
            ? splitPeople
                .filter((p) => p.name.trim() && parseFloat(p.amount) > 0)
                .map((p) => ({
                  contactId: p.contactId,
                  name: p.name.trim(),
                  amount: parseFloat(p.amount),
                  paid: p.paid,
                }))
            : [],
      },
      subcategoryIds,
    );
  };

  const parsedAmount = parseFloat(unformatAmount(amount));
  const isValid =
    parsedAmount > 0 &&
    accountId !== null &&
    (type !== "transfer" || (toAccountId !== null && toAccountId !== accountId));

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      {/* Template chips */}
      {!isEditing && templates.length > 0 && (
        <FlatList
          horizontal
          data={templates}
          keyExtractor={(item) => item.id.toString()}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.templateChips}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => applyTemplate(item)}
              style={[
                styles.templateChip,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <AppIcon name={item.icon || "file-document"} size={16} color={colors.primary} />
              <AppText variant="caption" numberOfLines={1}>
                {item.name}
              </AppText>
            </Pressable>
          )}
        />
      )}

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

      {/* Item 8: Date & Time right below type (autocompleted fields) */}
      <View style={styles.row}>
        <View style={styles.halfInput}>
          <DatePicker label={t("transactionForm.date")} value={date} onChange={setDate} />
        </View>
        <View style={styles.halfInput}>
          <TimePicker label={t("transactionForm.time")} value={time} onChange={setTime} />
        </View>
      </View>

      <AppInput
        ref={amountRef}
        label={t("transactionForm.amount")}
        value={amount}
        onChangeText={handleAmountChange}
        keyboardType="decimal-pad"
        placeholder="0.00"
      />
      <AppInput
        label={t("transactionForm.description")}
        value={description}
        onChangeText={setDescription}
        placeholder={t("transactionForm.descriptionPlaceholder")}
      />

      {/* Item 9: Account and Contact on same row */}
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
          <View style={type !== "transfer" ? styles.row : undefined}>
            <View style={type !== "transfer" ? styles.halfInput : undefined}>
              <SelectInput
                label={
                  type === "transfer"
                    ? t("transactionForm.fromAccount")
                    : t("transactionForm.account")
                }
                value={
                  selectedAccount ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <AppIcon
                        name={selectedAccount.icon}
                        size={18}
                        color={selectedAccount.color}
                      />
                      <AppText variant="body">{selectedAccount.name}</AppText>
                    </View>
                  ) : undefined
                }
                placeholder={t("common.select")}
                onPress={() => setShowAccountPicker(true)}
              />
            </View>

            {type !== "transfer" && (
              <View style={styles.halfInput}>
                <ContactPicker selected={contact} onSelect={setContact} />
              </View>
            )}
          </View>

          {type === "transfer" && (
            <SelectInput
              label={t("transactionForm.toAccount")}
              value={
                selectedToAccount ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <AppIcon
                      name={selectedToAccount.icon}
                      size={18}
                      color={selectedToAccount.color}
                    />
                    <AppText variant="body">{selectedToAccount.name}</AppText>
                  </View>
                ) : undefined
              }
              placeholder={t("common.select")}
              onPress={() => setShowToAccountPicker(true)}
            />
          )}
        </>
      )}

      {type !== "transfer" && (
        <CategoryChipPicker
          categories={categories}
          selected={subcategoryIds}
          onSelectionChange={setSubcategoryIds}
          suggestedIds={!isEditing ? suggestedCategoryIds : undefined}
        />
      )}

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
                  {t("settings.cashback")}:{" "}
                  {formatCurrency(computedCashback, selectedAccount?.currency)}
                </AppText>
              )}

              {/* Cashback account — modal picker */}
              <SelectInput
                label={t("settings.cashbackAccount")}
                value={
                  selectedCashbackAccount ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <AppIcon
                        name={selectedCashbackAccount.icon}
                        size={16}
                        color={selectedCashbackAccount.color}
                      />
                      <AppText variant="bodySmall">{selectedCashbackAccount.name}</AppText>
                    </View>
                  ) : undefined
                }
                placeholder={t("common.select")}
                onPress={() => setShowCashbackAccountPicker(true)}
                style={{ backgroundColor: colors.background }}
              />

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

      {/* Split bill — expense only, new transactions only */}
      {type === "expense" && !isEditing && accounts.length > 0 && (
        <View
          style={[
            styles.cashbackCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.cashbackHeader}>
            <AppIcon name="account-group" size={20} color={colors.primary} />
            <AppText variant="label" style={styles.flex}>
              {t("splitBill.title")}
            </AppText>
            <Switch value={splitEnabled} onValueChange={setSplitEnabled} />
          </View>

          {splitEnabled && (
            <View style={styles.cashbackBody}>
              <AppText variant="bodySmall" color={colors.textSecondary}>
                {t("splitBill.description")}
              </AppText>

              {splitPeople.map((person, idx) => (
                <View
                  key={idx}
                  style={[styles.splitPersonCard, { borderBottomColor: colors.borderLight }]}
                >
                  <View style={styles.splitPersonTop}>
                    <View style={{ flex: 1 }}>
                      <ContactPicker
                        selected={
                          person.contactId ? { id: person.contactId, name: person.name } : null
                        }
                        onSelect={(c) =>
                          setSplitPeople((prev) =>
                            prev.map((p, i) =>
                              i === idx
                                ? {
                                    ...p,
                                    contactId: c?.id ?? null,
                                    name: c?.name ?? p.name,
                                  }
                                : p,
                            ),
                          )
                        }
                      />
                    </View>
                    {splitPeople.length > 1 && (
                      <Pressable
                        onPress={() => setSplitPeople((prev) => prev.filter((_, i) => i !== idx))}
                        style={{ marginTop: spacing.sm }}
                      >
                        <AppIcon name="close-circle" size={22} color={colors.iconSecondary} />
                      </Pressable>
                    )}
                  </View>
                  {!person.contactId && (
                    <AppInput
                      placeholder={t("splitBill.personName")}
                      value={person.name}
                      onChangeText={(text) =>
                        setSplitPeople((prev) =>
                          prev.map((p, i) => (i === idx ? { ...p, name: text } : p)),
                        )
                      }
                    />
                  )}
                  <AppInput
                    label={t("transactionForm.amount")}
                    placeholder="0"
                    value={person.amount}
                    onChangeText={(text) =>
                      setSplitPeople((prev) =>
                        prev.map((p, i) => (i === idx ? { ...p, amount: text } : p)),
                      )
                    }
                    keyboardType="decimal-pad"
                  />
                  <View style={styles.splitPaidRow}>
                    <AppText variant="caption" color={colors.textSecondary} style={styles.flex}>
                      {t("splitBill.alreadyPaid")}
                    </AppText>
                    <Switch
                      value={person.paid}
                      onValueChange={(val) =>
                        setSplitPeople((prev) =>
                          prev.map((p, i) => (i === idx ? { ...p, paid: val } : p)),
                        )
                      }
                    />
                  </View>
                </View>
              ))}

              <View style={styles.splitActions}>
                <Pressable
                  onPress={() =>
                    setSplitPeople((prev) => [
                      ...prev,
                      { contactId: null, name: "", amount: "", paid: false },
                    ])
                  }
                  style={styles.splitAddBtn}
                >
                  <AppIcon name="plus" size={18} color={colors.primary} />
                  <AppText variant="bodySmall" color={colors.primary}>
                    {t("splitBill.addPerson")}
                  </AppText>
                </Pressable>
                <Pressable
                  onPress={() => {
                    const total = parseFloat(unformatAmount(amount)) || 0;
                    const count = splitPeople.length + 1;
                    if (total > 0 && count > 1) {
                      const share = Math.round((total / count) * 100) / 100;
                      const remainder = Math.round((total - share * count) * 100) / 100;
                      setSplitPeople((prev) =>
                        prev.map((p, i) => ({
                          ...p,
                          amount: (i === 0 ? share + remainder : share).toString(),
                        })),
                      );
                    }
                  }}
                  style={styles.splitAddBtn}
                >
                  <AppIcon name="equal" size={18} color={colors.primary} />
                  <AppText variant="bodySmall" color={colors.primary}>
                    {t("splitBill.splitEvenly")}
                  </AppText>
                </Pressable>
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
      <PickerModal
        visible={showAccountPicker}
        title={
          type === "transfer" ? t("transactionForm.fromAccount") : t("transactionForm.account")
        }
        items={accounts}
        keyExtractor={(item) => item.id.toString()}
        selectedKey={accountId?.toString()}
        onSelect={(item) => setAccountId(item.id)}
        onClose={() => setShowAccountPicker(false)}
        renderItem={(item, isSelected) => (
          <>
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
            {isSelected && <AppIcon name="check" size={20} color={colors.primary} />}
          </>
        )}
      />
      <PickerModal
        visible={showToAccountPicker}
        title={t("transactionForm.toAccount")}
        items={accounts.filter((a) => a.id !== accountId)}
        keyExtractor={(item) => item.id.toString()}
        selectedKey={toAccountId?.toString()}
        onSelect={(item) => setToAccountId(item.id)}
        onClose={() => setShowToAccountPicker(false)}
        renderItem={(item, isSelected) => (
          <>
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
            {isSelected && <AppIcon name="check" size={20} color={colors.primary} />}
          </>
        )}
      />
      <PickerModal
        visible={showCashbackAccountPicker}
        title={t("settings.cashbackAccount")}
        items={accounts}
        keyExtractor={(item) => item.id.toString()}
        selectedKey={cashbackAccountId?.toString()}
        onSelect={(item) => setCashbackAccountId(item.id)}
        onClose={() => setShowCashbackAccountPicker(false)}
        renderItem={(item, isSelected) => (
          <>
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
            {isSelected && <AppIcon name="check" size={20} color={colors.primary} />}
          </>
        )}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  container: { gap: spacing.lg, paddingBottom: spacing["2xl"] },
  typeRow: { flexDirection: "row", gap: spacing.sm },
  typeBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1.5,
  },
  section: { gap: spacing.sm },
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
  templateChips: { gap: spacing.sm, paddingHorizontal: spacing.xs },
  templateChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    borderWidth: 1,
  },
  splitPersonCard: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    // borderBottomColor applied inline from theme
    marginBottom: spacing.xs,
  },
  splitPersonTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  splitPaidRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  splitActions: {
    flexDirection: "row",
    gap: spacing.lg,
  },
  splitAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
});
