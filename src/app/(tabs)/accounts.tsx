import { useState } from "react";
import { View, FlatList, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScreenLayout } from "@/components/templates/ScreenLayout";
import { HeaderBar } from "@/components/templates/HeaderBar";
import { AccountCard } from "@/components/organisms/AccountCard";
import { EmptyState } from "@/components/molecules/EmptyState";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { FAB } from "@/components/atoms/FAB";
import { HelpModal } from "@/components/molecules/HelpModal";
import { useAccounts } from "@/hooks/useAccounts";
import { useTheme } from "@/providers/ThemeProvider";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import { unarchiveAccount } from "@/db/queries/accounts";
import { spacing } from "@/theme/spacing";

export default function AccountsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { invalidate } = useDataRefresh();
  const [showArchived, setShowArchived] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const { accounts: activeAccounts, loading } = useAccounts(true);
  const { accounts: allAccounts } = useAccounts(false);
  const archivedAccounts = allAccounts.filter((a) => !a.isActive);

  const handleUnarchive = async (id: number) => {
    await unarchiveAccount(id);
    invalidate("accounts");
  };

  return (
    <ScreenLayout edges={["top"]}>
      <HeaderBar
        title={t("accounts.title")}
        rightActions={[
          ...(archivedAccounts.length > 0
            ? [
                {
                  icon: showArchived ? "archive-off" : "archive",
                  onPress: () => setShowArchived((p: boolean) => !p),
                },
              ]
            : []),
          { icon: "help-circle-outline", onPress: () => setShowHelp(true) },
        ]}
      />
      <FlatList
        data={showArchived ? archivedAccounts : activeAccounts}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.list}
        renderItem={({ item }) =>
          showArchived ? (
            <View style={[styles.archivedRow, { borderColor: colors.border }]}>
              <AccountCard account={item} onPress={() => router.push(`/account/${item.id}`)} />
              <Pressable onPress={() => handleUnarchive(item.id)} style={styles.unarchiveBtn}>
                <AppIcon name="archive-arrow-up" size={20} color={colors.primary} />
                <AppText variant="caption" color={colors.primary}>
                  {t("accounts.unarchive")}
                </AppText>
              </Pressable>
            </View>
          ) : (
            <AccountCard account={item} onPress={() => router.push(`/account/${item.id}`)} />
          )
        }
        ListHeaderComponent={
          showArchived ? (
            <AppText variant="bodySmall" color={colors.textSecondary} style={styles.archivedHint}>
              {t("accounts.archivedHint")}
            </AppText>
          ) : null
        }
        ListEmptyComponent={
          loading ? null : (
            <EmptyState
              icon={showArchived ? "archive" : "wallet"}
              title={showArchived ? t("accounts.noArchived") : t("accounts.noAccounts")}
              description={showArchived ? undefined : t("accounts.addFirst")}
            />
          )
        }
      />
      {!showArchived && <FAB onPress={() => router.push("/account/form")} />}
      <HelpModal
        visible={showHelp}
        title={t("accounts.title")}
        content={t("help.accounts")}
        onClose={() => setShowHelp(false)}
      />
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  archivedRow: {
    gap: spacing.xs,
  },
  unarchiveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  archivedHint: {
    textAlign: "center",
    marginBottom: spacing.md,
  },
});
