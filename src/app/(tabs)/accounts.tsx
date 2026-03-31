import { FlatList, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScreenLayout } from "@/components/templates/ScreenLayout";
import { HeaderBar } from "@/components/templates/HeaderBar";
import { AccountCard } from "@/components/organisms/AccountCard";
import { AmountDisplay } from "@/components/molecules/AmountDisplay";
import { EmptyState } from "@/components/molecules/EmptyState";
import { FAB } from "@/components/atoms/FAB";
import { useAccounts } from "@/hooks/useAccounts";
import { spacing } from "@/theme/spacing";

export default function AccountsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { accounts, totals, loading } = useAccounts();

  return (
    <ScreenLayout edges={["top"]}>
      <HeaderBar title={t("accounts.title")} />
      <FlatList
        data={accounts}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          accounts.length > 0 ? (
            <AmountDisplay amount={totals.netWorth} variant="amountLarge" style={styles.netWorth} />
          ) : null
        }
        renderItem={({ item }) => (
          <AccountCard account={item} onPress={() => router.push(`/account/${item.id}`)} />
        )}
        ListEmptyComponent={
          loading ? null : (
            <EmptyState
              icon="wallet"
              title={t("accounts.noAccounts")}
              description={t("accounts.addFirst")}
            />
          )
        }
        ItemSeparatorComponent={() => <></>}
      />
      <FAB onPress={() => router.push("/account/form")} />
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  netWorth: {
    textAlign: "center",
    marginBottom: spacing.sm,
  },
});
