import { View, Pressable, StyleSheet } from "react-native";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { AmountDisplay } from "@/components/molecules/AmountDisplay";
import { CategoryPill } from "@/components/molecules/CategoryPill";
import { useTheme } from "@/providers/ThemeProvider";
import { useTranslation } from "react-i18next";
import { translateCategoryName } from "@/constants/categories";
import { formatDateShort } from "@/utils/format";
import { spacing } from "@/theme/spacing";
import type { TransactionWithRelations } from "@/db/queries/transactions";

type Props = {
  transaction: TransactionWithRelations;
  onPress?: () => void;
};

const TYPE_ICONS: Record<string, string> = {
  income: "arrow-down",
  expense: "arrow-up",
  transfer: "swap-horizontal",
};

export function TransactionListItem({ transaction: txn, onPress }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const typeColor =
    txn.type === "income"
      ? colors.income
      : txn.type === "expense"
        ? colors.expense
        : colors.transfer;

  const firstCat = txn.subcategoryList[0];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        { backgroundColor: pressed ? colors.borderLight : "transparent" },
      ]}
    >
      <View style={[styles.iconContainer, { backgroundColor: typeColor + "18" }]}>
        <AppIcon name={TYPE_ICONS[txn.type] ?? "help"} size={20} color={typeColor} />
      </View>
      <View style={styles.info}>
        <AppText variant="label" numberOfLines={1}>
          {txn.description || txn.type.charAt(0).toUpperCase() + txn.type.slice(1)}
        </AppText>
        <View style={styles.meta}>
          <AppText variant="caption" color={colors.textTertiary}>
            {txn.accountName}
            {txn.toAccountName ? ` → ${txn.toAccountName}` : ""}
          </AppText>
          <AppText variant="caption" color={colors.textTertiary}>
            {" · "}
            {formatDateShort(txn.date)}
          </AppText>
        </View>
        {firstCat && (
          <View style={styles.pills}>
            <CategoryPill
              name={translateCategoryName(firstCat.categoryName, t)}
              icon={firstCat.categoryIcon}
              color={firstCat.categoryColor}
            />
            {txn.subcategoryList.length > 1 && (
              <AppText variant="caption" color={colors.textTertiary}>
                +{txn.subcategoryList.length - 1}
              </AppText>
            )}
          </View>
        )}
      </View>
      <AmountDisplay
        amount={txn.amount}
        type={txn.type as "income" | "expense" | "transfer"}
        variant="label"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  info: {
    flex: 1,
    gap: 2,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
  },
  pills: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: 2,
  },
});
