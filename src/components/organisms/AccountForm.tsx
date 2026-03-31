import { useState } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { AppInput } from "@/components/atoms/AppInput";
import { AppButton } from "@/components/atoms/AppButton";
import { AppText } from "@/components/atoms/AppText";
import { Chip } from "@/components/atoms/Chip";
import { useTheme } from "@/providers/ThemeProvider";
import { spacing } from "@/theme/spacing";
import type { Account, NewAccount } from "@/db/schema";
import type { AccountType } from "@/types";

const ACCOUNT_TYPES: { value: AccountType; label: string; icon: string }[] = [
  { value: "debit", label: "Debit", icon: "bank" },
  { value: "credit", label: "Credit", icon: "credit-card" },
  { value: "cash", label: "Cash", icon: "cash" },
  { value: "wallet", label: "Wallet", icon: "wallet" },
  { value: "savings", label: "Savings", icon: "piggy-bank" },
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
  const [name, setName] = useState(initial?.name ?? "");
  const [institution, setInstitution] = useState(initial?.institution ?? "");
  const [type, setType] = useState<AccountType>((initial?.type as AccountType) ?? "debit");
  const [balance, setBalance] = useState(initial?.balance?.toString() ?? "0");
  const [creditLimit, setCreditLimit] = useState(initial?.creditLimit?.toString() ?? "");
  const [color, setColor] = useState(initial?.color ?? COLORS[3]);
  const [currency] = useState(initial?.currency ?? "USD");

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
      icon: ACCOUNT_TYPES.find((t) => t.value === type)?.icon ?? "wallet",
    });
  };

  const isValid = name.trim().length > 0;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <AppInput
        label="Account Name"
        value={name}
        onChangeText={setName}
        placeholder="e.g. Main Checking"
      />
      <AppInput
        label="Institution"
        value={institution}
        onChangeText={setInstitution}
        placeholder="e.g. Chase Bank"
      />

      <View style={styles.section}>
        <AppText variant="label" color={colors.textSecondary}>
          Type
        </AppText>
        <View style={styles.chipRow}>
          {ACCOUNT_TYPES.map((t) => (
            <Chip
              key={t.value}
              label={t.label}
              selected={type === t.value}
              onPress={() => setType(t.value)}
            />
          ))}
        </View>
      </View>

      <AppInput
        label="Initial Balance"
        value={balance}
        onChangeText={setBalance}
        keyboardType="decimal-pad"
        placeholder="0.00"
      />

      {type === "credit" && (
        <AppInput
          label="Credit Limit"
          value={creditLimit}
          onChangeText={setCreditLimit}
          keyboardType="decimal-pad"
          placeholder="0.00"
        />
      )}

      <View style={styles.section}>
        <AppText variant="label" color={colors.textSecondary}>
          Color
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
          title={initial ? "Save Changes" : "Create Account"}
          onPress={handleSubmit}
          disabled={!isValid}
        />
        {initial && onDelete && (
          <AppButton title="Archive Account" onPress={onDelete} variant="danger" icon="archive" />
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
    gap: spacing.sm,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
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
});
