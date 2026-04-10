import { type TextStyle } from "react-native";
import { AppText } from "@/components/atoms/AppText";
import { useTheme } from "@/providers/ThemeProvider";
import { usePrivacy } from "@/providers/PrivacyProvider";
import { useAccounts } from "@/hooks/useAccounts";
import { formatCurrency } from "@/utils/format";
import type { TypographyVariant } from "@/theme/typography";

type AmountDisplayProps = {
  amount: number;
  currency?: string;
  type?: "income" | "expense" | "transfer" | "neutral";
  variant?: TypographyVariant;
  style?: TextStyle;
};

export function AmountDisplay({
  amount,
  currency,
  type = "neutral",
  variant = "body",
  style,
}: AmountDisplayProps) {
  const { colors } = useTheme();
  const { hideAmounts, maskAmount } = usePrivacy();
  const { totals } = useAccounts();

  const displayCurrency = currency ?? totals.displayCurrency;

  const colorMap = {
    income: colors.income,
    expense: colors.expense,
    transfer: colors.transfer,
    neutral: colors.text,
  };

  const prefix = type === "income" ? "+" : type === "expense" ? "-" : amount < 0 ? "-" : "";
  const displayAmount = maskAmount(Math.abs(amount));

  return (
    <AppText variant={variant} color={colorMap[type]} style={style}>
      {hideAmounts ? "••••" : `${prefix}${formatCurrency(displayAmount, displayCurrency)}`}
    </AppText>
  );
}
