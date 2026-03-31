import { useState } from "react";
import { View, ScrollView, StyleSheet, Pressable } from "react-native";
import { AppInput } from "@/components/atoms/AppInput";
import { AppButton } from "@/components/atoms/AppButton";
import { AppText } from "@/components/atoms/AppText";
import { Chip } from "@/components/atoms/Chip";
import { CategoryPicker } from "@/components/organisms/CategoryPicker";
import { useTheme } from "@/providers/ThemeProvider";
import { spacing } from "@/theme/spacing";
import { todayDateString, nowTimeString } from "@/utils/format";
import type { Account, NewTransaction } from "@/db/schema";
import type { CategoryWithSubs } from "@/db/queries/categories";
import type { TransactionType } from "@/types";

type TransactionFormProps = {
  accounts: Account[];
  categories: CategoryWithSubs[];
  onSubmit: (data: NewTransaction, subcategoryIds: number[]) => void;
  initialType?: TransactionType;
};

export function TransactionForm({
  accounts,
  categories,
  onSubmit,
  initialType = "expense",
}: TransactionFormProps) {
  const { colors } = useTheme();
  const [type, setType] = useState<TransactionType>(initialType);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [accountId, setAccountId] = useState<number | null>(accounts[0]?.id ?? null);
  const [toAccountId, setToAccountId] = useState<number | null>(null);
  const [date, setDate] = useState(todayDateString());
  const [time, setTime] = useState(nowTimeString());
  const [subcategoryIds, setSubcategoryIds] = useState<number[]>([]);
  const [notes, setNotes] = useState("");

  const filteredCategories = categories.filter((c) => {
    if (type === "income") return c.isIncome;
    if (type === "expense") return c.isExpense;
    return c.isExpense; // transfer uses expense categories
  });

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
        notes: notes.trim() || null,
      },
      subcategoryIds,
    );
  };

  const isValid =
    parseFloat(amount) > 0 && accountId !== null && (type !== "transfer" || toAccountId !== null);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      {/* Type selector */}
      <View style={styles.typeRow}>
        {(["expense", "income", "transfer"] as const).map((t) => {
          const isActive = type === t;
          const tColor =
            t === "income" ? colors.income : t === "expense" ? colors.expense : colors.transfer;
          return (
            <Pressable
              key={t}
              onPress={() => setType(t)}
              style={[
                styles.typeBtn,
                {
                  backgroundColor: isActive ? tColor + "18" : colors.surface,
                  borderColor: isActive ? tColor : colors.border,
                },
              ]}
            >
              <AppText variant="label" color={isActive ? tColor : colors.textSecondary}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {/* Amount */}
      <AppInput
        label="Amount"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        placeholder="0.00"
      />

      <AppInput
        label="Description"
        value={description}
        onChangeText={setDescription}
        placeholder="What was this for?"
      />

      {/* Account selector */}
      <View style={styles.section}>
        <AppText variant="label" color={colors.textSecondary}>
          {type === "transfer" ? "From Account" : "Account"}
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

      {/* To account for transfers */}
      {type === "transfer" && (
        <View style={styles.section}>
          <AppText variant="label" color={colors.textSecondary}>
            To Account
          </AppText>
          <View style={styles.chipRow}>
            {accounts
              .filter((a) => a.id !== accountId)
              .map((acc) => (
                <Chip
                  key={acc.id}
                  label={acc.name}
                  selected={toAccountId === acc.id}
                  onPress={() => setToAccountId(acc.id)}
                />
              ))}
          </View>
        </View>
      )}

      {/* Categories */}
      {type !== "transfer" && (
        <CategoryPicker
          categories={filteredCategories}
          selected={subcategoryIds}
          onSelectionChange={setSubcategoryIds}
        />
      )}

      {/* Date & Time */}
      <View style={styles.row}>
        <View style={styles.halfInput}>
          <AppInput label="Date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
        </View>
        <View style={styles.halfInput}>
          <AppInput label="Time" value={time} onChangeText={setTime} placeholder="HH:mm" />
        </View>
      </View>

      {/* Notes */}
      <AppInput
        label="Notes"
        value={notes}
        onChangeText={setNotes}
        placeholder="Optional notes..."
        multiline
        numberOfLines={3}
      />

      <AppButton title="Save Transaction" onPress={handleSubmit} disabled={!isValid} />
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
  typeRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1.5,
  },
  section: {
    gap: spacing.sm,
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
  halfInput: {
    flex: 1,
  },
});
