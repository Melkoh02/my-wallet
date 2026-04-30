import { type TextStyle } from "react-native";
import { AppText } from "@/components/atoms/AppText";
import { useTheme } from "@/providers/ThemeProvider";
import { usePrivacy } from "@/providers/PrivacyProvider";
import { formatCurrency } from "@/utils/format";
import type { TypographyVariant } from "@/theme/typography";

type AmountDisplayProps = {
  amount: number;
  // Required: the actual currency of `amount`. Pass account.currency for
  // per-row displays, or the active display currency for already-converted
  // aggregates. There is intentionally no silent fallback — callers must be
  // explicit so currency mismatches surface at the type level.
  currency: string;
  // Approximate marker for converted aggregates whose ground-truth currency
  // differs from `currency`. Renders a "≈" prefix.
  approximate?: boolean;
  type?: "income" | "expense" | "transfer" | "neutral";
  variant?: TypographyVariant;
  style?: TextStyle;
};

export function AmountDisplay({
  amount,
  currency,
  approximate = false,
  type = "neutral",
  variant = "body",
  style,
}: AmountDisplayProps) {
  const { colors } = useTheme();
  const { hideAmounts, maskAmount } = usePrivacy();

  const colorMap = {
    income: colors.income,
    expense: colors.expense,
    transfer: colors.transfer,
    neutral: colors.text,
  };

  const signPrefix = type === "income" ? "+" : type === "expense" ? "-" : amount < 0 ? "-" : "";
  const approxPrefix = approximate ? "≈" : "";
  const displayAmount = maskAmount(Math.abs(amount));

  return (
    <AppText variant={variant} color={colorMap[type]} style={style}>
      {hideAmounts
        ? "••••"
        : `${approxPrefix}${signPrefix}${formatCurrency(displayAmount, currency)}`}
    </AppText>
  );
}
