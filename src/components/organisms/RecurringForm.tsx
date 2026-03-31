import { useState } from "react";
import { View, ScrollView, StyleSheet } from "react-native";
import { AppInput } from "@/components/atoms/AppInput";
import { AppButton } from "@/components/atoms/AppButton";
import { AppText } from "@/components/atoms/AppText";
import { Chip } from "@/components/atoms/Chip";
import { DatePicker } from "@/components/molecules/DatePicker";
import { CategoryPicker } from "@/components/organisms/CategoryPicker";
import { useTheme } from "@/providers/ThemeProvider";
import { spacing } from "@/theme/spacing";
import { todayDateString } from "@/utils/format";
import type { Account, NewRecurringTransaction } from "@/db/schema";
import type { CategoryWithSubs } from "@/db/queries/categories";
import type { Frequency } from "@/types";

const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

type RecurringFormProps = {
  accounts: Account[];
  categories: CategoryWithSubs[];
  onSubmit: (data: NewRecurringTransaction, subcategoryIds: number[]) => void;
};

export function RecurringForm({ accounts, categories, onSubmit }: RecurringFormProps) {
  const { colors } = useTheme();
  const [type, setType] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [accountId, setAccountId] = useState<number | null>(accounts[0]?.id ?? null);
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [nextDate, setNextDate] = useState(todayDateString());
  const [endDate, setEndDate] = useState("");
  const [subcategoryIds, setSubcategoryIds] = useState<number[]>([]);

  const filteredCategories = categories;

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
      },
      subcategoryIds,
    );
  };

  const isValid = parseFloat(amount) > 0 && accountId !== null && description.trim().length > 0;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <View style={styles.typeRow}>
        {(["expense", "income"] as const).map((t) => {
          const isActive = type === t;
          const tColor = t === "income" ? colors.income : colors.expense;
          return (
            <View
              key={t}
              style={[
                styles.typeBtn,
                {
                  backgroundColor: isActive ? tColor + "18" : colors.surface,
                  borderColor: isActive ? tColor : colors.border,
                },
              ]}
              onTouchEnd={() => setType(t)}
            >
              <AppText variant="label" color={isActive ? tColor : colors.textSecondary}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </AppText>
            </View>
          );
        })}
      </View>

      <AppInput
        label="Description"
        value={description}
        onChangeText={setDescription}
        placeholder="e.g. Netflix, Salary"
      />
      <AppInput
        label="Amount"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        placeholder="0.00"
      />

      <View style={styles.section}>
        <AppText variant="label" color={colors.textSecondary}>
          Frequency
        </AppText>
        <View style={styles.chipRow}>
          {FREQUENCIES.map((f) => (
            <Chip
              key={f.value}
              label={f.label}
              selected={frequency === f.value}
              onPress={() => setFrequency(f.value)}
            />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <AppText variant="label" color={colors.textSecondary}>
          Account
        </AppText>
        <View style={styles.chipRow}>
          {accounts.map((acc) => (
            <Chip
              key={acc.id}
              label={acc.name}
              selected={accountId === acc.id}
              onPress={() => setAccountId(acc.id)}
            />
          ))}
        </View>
      </View>

      <CategoryPicker
        categories={filteredCategories}
        selected={subcategoryIds}
        onSelectionChange={setSubcategoryIds}
      />

      <View style={styles.row}>
        <View style={styles.halfInput}>
          <DatePicker label="Start Date" value={nextDate} onChange={setNextDate} />
        </View>
        <View style={styles.halfInput}>
          {endDate ? (
            <DatePicker label="End Date" value={endDate} onChange={setEndDate} />
          ) : (
            <AppInput
              label="End Date (optional)"
              value=""
              onFocus={() => setEndDate(nextDate)}
              placeholder="No end date"
            />
          )}
        </View>
      </View>

      <AppButton title="Create Recurring" onPress={handleSubmit} disabled={!isValid} />
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
  section: { gap: spacing.sm },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  row: { flexDirection: "row", gap: spacing.md },
  halfInput: { flex: 1 },
});
