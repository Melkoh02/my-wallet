import { type TextStyle } from "react-native";
import { AppText } from "@/components/atoms/AppText";
import { useTheme } from "@/providers/ThemeProvider";
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
  currency = "USD",
  type = "neutral",
  variant = "body",
  style,
}: AmountDisplayProps) {
  const { colors } = useTheme();

  const colorMap = {
    income: colors.income,
    expense: colors.expense,
    transfer: colors.transfer,
    neutral: colors.text,
  };

  const prefix = type === "income" ? "+" : type === "expense" ? "-" : "";

  return (
    <AppText variant={variant} color={colorMap[type]} style={style}>
      {prefix}
      {formatCurrency(Math.abs(amount), currency)}
    </AppText>
  );
}
