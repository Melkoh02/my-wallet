import { View, Pressable, StyleSheet } from "react-native";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { AmountDisplay } from "@/components/molecules/AmountDisplay";
import { useTheme } from "@/providers/ThemeProvider";
import { spacing } from "@/theme/spacing";
import type { Account } from "@/db/schema";

type AccountCardProps = {
  account: Account;
  onPress?: () => void;
};

const TYPE_LABELS: Record<string, string> = {
  credit: "Credit",
  debit: "Debit",
  savings: "Savings",
  wallet: "Wallet",
  cash: "Cash",
};

export function AccountCard({ account, onPress }: AccountCardProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <View style={[styles.iconContainer, { backgroundColor: account.color + "20" }]}>
        <AppIcon name={account.icon} size={24} color={account.color} />
      </View>
      <View style={styles.info}>
        <AppText variant="label" numberOfLines={1}>
          {account.name}
        </AppText>
        <AppText variant="caption" color={colors.textSecondary}>
          {account.institution || TYPE_LABELS[account.type] || account.type}
        </AppText>
      </View>
      <AmountDisplay
        amount={account.balance}
        currency={account.currency}
        type={account.type === "credit" && account.balance < 0 ? "expense" : "neutral"}
        variant="label"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
    borderRadius: 12,
    borderWidth: 1,
    gap: spacing.md,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  info: {
    flex: 1,
    gap: 2,
  },
});
