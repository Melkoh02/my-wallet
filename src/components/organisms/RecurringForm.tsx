import { useState } from "react";
import { View, ScrollView, Pressable, StyleSheet } from "react-native";
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
import { useTheme } from "@/providers/ThemeProvider";
import { spacing } from "@/theme/spacing";
import { todayDateString } from "@/utils/format";
import type { Account, NewRecurringTransaction } from "@/db/schema";
import type { CategoryWithSubs } from "@/db/queries/categories";
import type { Frequency } from "@/types";

const FREQUENCIES: { value: Frequency }[] = [
  { value: "daily" },
  { value: "weekly" },
  { value: "biweekly" },
  { value: "monthly" },
  { value: "yearly" },
];

const DAYS_OF_WEEK = [
  { value: 1, key: "recurring.monday" },
  { value: 2, key: "recurring.tuesday" },
  { value: 3, key: "recurring.wednesday" },
  { value: 4, key: "recurring.thursday" },
  { value: 5, key: "recurring.friday" },
  { value: 6, key: "recurring.saturday" },
  { value: 0, key: "recurring.sunday" },
];

type RecurringFormProps = {
  accounts: Account[];
  categories: CategoryWithSubs[];
  onSubmit: (data: NewRecurringTransaction, subcategoryIds: number[]) => void;
  initial?: NewRecurringTransaction & { subcategoryIds?: number[] };
};

export function RecurringForm({ accounts, categories, onSubmit, initial }: RecurringFormProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const [type, setType] = useState<"income" | "expense">(
    (initial?.type as "income" | "expense") ?? "expense",
  );
  const [amount, setAmount] = useState(initial?.amount?.toString() ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [accountId, setAccountId] = useState<number | null>(
    initial?.accountId ?? accounts[0]?.id ?? null,
  );
  const [frequency, setFrequency] = useState<Frequency>(
    (initial?.frequency as Frequency) ?? "monthly",
  );
  const [nextDate, setNextDate] = useState(initial?.nextDate ?? todayDateString());
  const [endDate, setEndDate] = useState(initial?.endDate ?? "");
  const [subcategoryIds, setSubcategoryIds] = useState<number[]>(initial?.subcategoryIds ?? []);
  const [dayOfMonth, setDayOfMonth] = useState<number | null>(initial?.dayOfMonth ?? null);
  const [dayOfWeek, setDayOfWeek] = useState<number | null>(initial?.dayOfWeek ?? null);
  const [timeOfDay, setTimeOfDay] = useState(initial?.timeOfDay ?? "");

  const [showFreqPicker, setShowFreqPicker] = useState(false);
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [showDayOfMonthPicker, setShowDayOfMonthPicker] = useState(false);
  const [showDayOfWeekPicker, setShowDayOfWeekPicker] = useState(false);

  const selectedAccount = accounts.find((a) => a.id === accountId);

  const handleSubmit = () => {
    const parsed = parseFloat(amount);
    if (!parsed || !accountId) return;
    onSubmit(
      {
        type,
        amount: parsed,
        description: description.trim(),
        accountId,
        frequency,
        nextDate,
        endDate: endDate || null,
        dayOfMonth: frequency === "monthly" || frequency === "yearly" ? dayOfMonth : null,
        dayOfWeek: frequency === "weekly" || frequency === "biweekly" ? dayOfWeek : null,
        timeOfDay: frequency === "daily" && timeOfDay ? timeOfDay : null,
      },
      subcategoryIds,
    );
  };

  const isValid = parseFloat(amount) > 0 && accountId !== null && description.trim().length > 0;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      {/* Type selector */}
      <View style={styles.typeRow}>
        {(["expense", "income"] as const).map((tp) => {
          const isActive = type === tp;
          const tColor = tp === "income" ? colors.income : colors.expense;
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
        label={t("transactionForm.description")}
        value={description}
        onChangeText={setDescription}
        placeholder={t("recurring.descriptionPlaceholder")}
      />
      <AppInput
        label={t("transactionForm.amount")}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        placeholder="0.00"
      />

      {/* Frequency — SelectInput + PickerModal */}
      <SelectInput
        label={t("recurring.frequency")}
        value={t(`recurring.${frequency}`)}
        onPress={() => setShowFreqPicker(true)}
      />

      {/* Day of month — monthly/yearly */}
      {(frequency === "monthly" || frequency === "yearly") && (
        <SelectInput
          label={t("recurring.dayOfMonth")}
          value={dayOfMonth ? dayOfMonth.toString() : undefined}
          placeholder={t("transactions.notSet")}
          onPress={() => setShowDayOfMonthPicker(true)}
        />
      )}

      {/* Day of week — weekly/biweekly */}
      {(frequency === "weekly" || frequency === "biweekly") && (
        <SelectInput
          label={t("recurring.dayOfWeek")}
          value={
            dayOfWeek != null
              ? t(DAYS_OF_WEEK.find((d) => d.value === dayOfWeek)?.key ?? "")
              : undefined
          }
          placeholder={t("transactions.notSet")}
          onPress={() => setShowDayOfWeekPicker(true)}
        />
      )}

      {/* Time of day — daily */}
      {frequency === "daily" && (
        <View style={styles.halfInput}>
          {timeOfDay ? (
            <TimePicker
              label={t("recurring.timeOfDay")}
              value={timeOfDay}
              onChange={setTimeOfDay}
            />
          ) : (
            <View style={{ gap: spacing.xs }}>
              <AppText variant="label" color={colors.textSecondary}>
                {t("recurring.timeOfDay")} ({t("common.optional")})
              </AppText>
              <Pressable
                onPress={() => setTimeOfDay("09:00")}
                style={[
                  styles.emptyPicker,
                  { borderColor: colors.border, backgroundColor: colors.surface },
                ]}
              >
                <AppText variant="body" color={colors.placeholder}>
                  {t("transactions.notSet")}
                </AppText>
              </Pressable>
            </View>
          )}
        </View>
      )}

      {/* Account — SelectInput + PickerModal */}
      <SelectInput
        label={t("transactionForm.account")}
        value={
          selectedAccount ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <AppIcon name={selectedAccount.icon} size={18} color={selectedAccount.color} />
              <AppText variant="body">{selectedAccount.name}</AppText>
            </View>
          ) : undefined
        }
        placeholder={t("common.select")}
        onPress={() => setShowAccountPicker(true)}
      />

      <CategoryChipPicker
        categories={categories}
        selected={subcategoryIds}
        onSelectionChange={setSubcategoryIds}
      />

      {/* Dates */}
      <View style={styles.row}>
        <View style={styles.halfInput}>
          <DatePicker label={t("recurring.startDate")} value={nextDate} onChange={setNextDate} />
        </View>
        <View style={styles.halfInput}>
          {endDate ? (
            <View style={{ gap: spacing.xs }}>
              <DatePicker label={t("recurring.endDate")} value={endDate} onChange={setEndDate} />
              <Pressable onPress={() => setEndDate("")}>
                <AppText variant="caption" color={colors.danger}>
                  {t("common.remove")}
                </AppText>
              </Pressable>
            </View>
          ) : (
            <View style={{ gap: spacing.xs }}>
              <AppText variant="label" color={colors.textSecondary}>
                {t("recurring.endDate")} ({t("common.optional")})
              </AppText>
              <Pressable
                onPress={() => setEndDate(nextDate)}
                style={[
                  styles.emptyPicker,
                  { borderColor: colors.border, backgroundColor: colors.surface },
                ]}
              >
                <AppText variant="body" color={colors.placeholder}>
                  {t("recurring.endDateOptional")}
                </AppText>
              </Pressable>
            </View>
          )}
        </View>
      </View>

      <AppButton
        title={initial ? t("accounts.saveChanges") : t("recurring.createRecurring")}
        onPress={handleSubmit}
        disabled={!isValid}
      />

      {/* Picker modals */}
      <PickerModal
        visible={showFreqPicker}
        title={t("recurring.frequency")}
        items={FREQUENCIES}
        keyExtractor={(item) => item.value}
        selectedKey={frequency}
        onSelect={(item) => setFrequency(item.value)}
        onClose={() => setShowFreqPicker(false)}
        renderItem={(item, isSelected) => (
          <>
            <AppText
              variant="body"
              color={isSelected ? colors.primary : colors.text}
              style={{ flex: 1 }}
            >
              {t(`recurring.${item.value}`)}
            </AppText>
            {isSelected && <AppIcon name="check" size={20} color={colors.primary} />}
          </>
        )}
      />
      <PickerModal
        visible={showAccountPicker}
        title={t("transactionForm.account")}
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
        visible={showDayOfMonthPicker}
        title={t("recurring.dayOfMonth")}
        items={Array.from({ length: 31 }, (_, i) => ({ value: i + 1 }))}
        keyExtractor={(item) => item.value.toString()}
        selectedKey={dayOfMonth?.toString()}
        onSelect={(item) => setDayOfMonth(item.value)}
        onClose={() => setShowDayOfMonthPicker(false)}
        renderItem={(item, isSelected) => (
          <>
            <AppText
              variant="body"
              color={isSelected ? colors.primary : colors.text}
              style={{ flex: 1 }}
            >
              {item.value}
            </AppText>
            {isSelected && <AppIcon name="check" size={20} color={colors.primary} />}
          </>
        )}
      />
      <PickerModal
        visible={showDayOfWeekPicker}
        title={t("recurring.dayOfWeek")}
        items={DAYS_OF_WEEK}
        keyExtractor={(item) => item.value.toString()}
        selectedKey={dayOfWeek?.toString()}
        onSelect={(item) => setDayOfWeek(item.value)}
        onClose={() => setShowDayOfWeekPicker(false)}
        renderItem={(item, isSelected) => (
          <>
            <AppText
              variant="body"
              color={isSelected ? colors.primary : colors.text}
              style={{ flex: 1 }}
            >
              {t(item.key)}
            </AppText>
            {isSelected && <AppIcon name="check" size={20} color={colors.primary} />}
          </>
        )}
      />
    </ScrollView>
  );
}

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
  row: { flexDirection: "row", gap: spacing.md },
  halfInput: { flex: 1 },
  emptyPicker: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 48,
    justifyContent: "center",
  },
});
