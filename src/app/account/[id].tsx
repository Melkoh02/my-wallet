import { useEffect, useState } from "react";
import { View, FlatList, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScreenLayout } from "@/components/templates/ScreenLayout";
import { HeaderBar } from "@/components/templates/HeaderBar";
import { AmountDisplay } from "@/components/molecules/AmountDisplay";
import { EmptyState } from "@/components/molecules/EmptyState";
import { TransactionListItem } from "@/components/organisms/TransactionListItem";
import { AppText } from "@/components/atoms/AppText";
import { Divider } from "@/components/atoms/Divider";
import { useTheme } from "@/providers/ThemeProvider";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import { getAccountById } from "@/db/queries/accounts";
import { getTransactions, type TransactionWithRelations } from "@/db/queries/transactions";
import { spacing } from "@/theme/spacing";
import type { Account } from "@/db/schema";

export default function AccountDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { revisions } = useDataRefresh();
  const [account, setAccount] = useState<Account | null>(null);
  const [transactions, setTransactions] = useState<TransactionWithRelations[]>([]);

  useEffect(() => {
    if (id) {
      const accountId = parseInt(id, 10);
      getAccountById(accountId).then((acc) => setAccount(acc ?? null));
      getTransactions({ accountId, limit: 50 }).then(setTransactions);
    }
  }, [id, revisions.accounts, revisions.transactions]);

  if (!account) return null;

  return (
    <ScreenLayout edges={["top"]}>
      <HeaderBar
        title={account.name}
        onBack={() => router.back()}
        rightIcon="pencil"
        onRightPress={() => router.push(`/account/form?id=${account.id}`)}
      />
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id.toString()}
        ListHeaderComponent={
          <View style={styles.balanceSection}>
            <AppText variant="caption" color={colors.textSecondary}>
              {t("accounts.currentBalance")}
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
            <Divider style={styles.divider} />
          </View>
        }
        renderItem={({ item }) => (
          <TransactionListItem
            transaction={item}
            onPress={() => router.push(`/transaction/${item.id}`)}
          />
        )}
        ItemSeparatorComponent={Divider}
        ListEmptyComponent={
          <EmptyState
            icon="swap-horizontal"
            title={t("home.noTransactionsYet")}
            description={t("transactions.addFirst")}
          />
        }
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
  divider: {
    marginTop: spacing.lg,
    alignSelf: "stretch",
  },
});
