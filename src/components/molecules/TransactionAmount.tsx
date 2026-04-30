import { View, type TextStyle } from "react-native";
import { AmountDisplay } from "./AmountDisplay";
import { useConverter } from "@/hooks/useConverter";
import type { TypographyVariant } from "@/theme/typography";

type TransactionAmountProps = {
  amount: number;
  currency: string;
  // Phase 2 stored-rate fields. When provided and the snapshot still matches
  // the current display currency, conversion uses the captured rate (stable
  // history). Otherwise falls back to today's rate via the converter, with
  // an ≈ marker.
  rateToDisplay?: number | null;
  displayCurrencySnapshot?: string | null;
  type?: "income" | "expense" | "transfer" | "neutral";
  variant?: TypographyVariant;
  style?: TextStyle;
};

/**
 * Renders a transaction amount with a Phase 2 dual-line layout when the
 * source currency differs from the display currency:
 *   - primary: amount in display currency (stored rate when valid, today's
 *     rate as fallback with ≈)
 *   - secondary: amount in source currency
 *
 * When source == display, or while the converter is still loading, falls
 * back to a single line in the source currency (matches Phase 1 behaviour).
 */
export function TransactionAmount({
  amount,
  currency,
  rateToDisplay,
  displayCurrencySnapshot,
  type = "neutral",
  variant = "label",
  style,
}: TransactionAmountProps) {
  const converter = useConverter();
  const displayCurrency = converter?.displayCurrency;

  // No converter yet, same currency, or no rate available at all → single line.
  if (!converter || !displayCurrency || currency === displayCurrency) {
    return (
      <AmountDisplay
        amount={amount}
        currency={currency}
        type={type}
        variant={variant}
        style={style}
      />
    );
  }

  let displayValue: number | null = null;
  let approximate = false;
  if (rateToDisplay != null && displayCurrencySnapshot === displayCurrency) {
    displayValue = amount * rateToDisplay;
  } else if (converter.hasRateFor(currency)) {
    displayValue = converter.convert(amount, currency);
    approximate = true;
  }

  // No rate for this row's currency at all → fall back to source-only.
  if (displayValue === null) {
    return (
      <AmountDisplay
        amount={amount}
        currency={currency}
        type={type}
        variant={variant}
        style={style}
      />
    );
  }

  return (
    <View style={{ alignItems: "flex-end" }}>
      <AmountDisplay
        amount={displayValue}
        currency={displayCurrency}
        approximate={approximate}
        type={type}
        variant={variant}
        style={style}
      />
      <AmountDisplay amount={amount} currency={currency} type="neutral" variant="caption" />
    </View>
  );
}
