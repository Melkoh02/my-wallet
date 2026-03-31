import { useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenLayout } from "@/components/templates/ScreenLayout";
import { HeaderBar } from "@/components/templates/HeaderBar";
import { AmountDisplay } from "@/components/molecules/AmountDisplay";
import { EmptyState } from "@/components/molecules/EmptyState";
import { AppText } from "@/components/atoms/AppText";
import { Divider } from "@/components/atoms/Divider";
import { useTheme } from "@/providers/ThemeProvider";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import { getAccountById } from "@/db/queries/accounts";
import { spacing } from "@/theme/spacing";
import type { Account } from "@/db/schema";

export default function AccountDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { revisions } = useDataRefresh();
  const [account, setAccount] = useState<Account | null>(null);

  useEffect(() => {
    if (id) {
      getAccountById(parseInt(id, 10)).then((acc) => setAccount(acc ?? null));
    }
  }, [id, revisions.accounts]);

  if (!account) return null;

  return (
    <ScreenLayout edges={["top"]}>
      <HeaderBar
        title={account.name}
        onBack={() => router.back()}
        rightIcon="pencil"
        onRightPress={() => router.push(`/account/form?id=${account.id}`)}
      />
      <View style={styles.balanceSection}>
        <AppText variant="caption" color={colors.textSecondary}>
          Current Balance
        </AppText>
        <AmountDisplay
          amount={account.balance}
          currency={account.currency}
          variant="amountLarge"
          type={account.type === "credit" && account.balance > 0 ? "expense" : "neutral"}
        />
        {account.institution ? (
          <AppText variant="bodySmall" color={colors.textTertiary}>
            {account.institution}
          </AppText>
        ) : null}
      </View>
      <Divider />
      <EmptyState
        icon="swap-horizontal"
        title="No transactions yet"
        description="Transactions for this account will appear here"
      />
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  balanceSection: {
    alignItems: "center",
    paddingVertical: spacing["2xl"],
    gap: spacing.xs,
  },
});
