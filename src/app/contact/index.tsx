import { useEffect, useState } from "react";
import { View, Pressable, FlatList, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScreenLayout } from "@/components/templates/ScreenLayout";
import { HeaderBar } from "@/components/templates/HeaderBar";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { Divider } from "@/components/atoms/Divider";
import { EmptyState } from "@/components/molecules/EmptyState";
import { useTheme } from "@/providers/ThemeProvider";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import { spacing } from "@/theme/spacing";
import { formatDate } from "@/utils/format";
import { getAllContactsWithActivity, type ContactSummary } from "@/db/queries/transactions";

export default function ContactsListScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { revisions } = useDataRefresh();
  const [contacts, setContacts] = useState<ContactSummary[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Re-query whenever the transactions revision bumps. Other mutation paths
  // (transaction create/edit/delete) call `invalidate("transactions")`, so a
  // separate focus refetch would just duplicate this — sticking with the
  // single-source-of-truth pattern used by every other list screen.
  useEffect(() => {
    let cancelled = false;
    getAllContactsWithActivity().then((rows) => {
      if (cancelled) return;
      setContacts(rows);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [revisions.transactions]);

  const handleOpen = (item: ContactSummary) => {
    // Free-typed contacts have no detail-screen route (the `/contact/[id]`
    // route requires a contactId). The Pressable below is `disabled` for
    // these rows, so this guard is a defensive backstop — v2.0 contact-as-
    // first-class will give them a proper destination.
    if (!item.contactId) return;
    router.push({
      pathname: "/contact/[id]",
      params: { id: item.contactId, name: item.contactName },
    });
  };

  return (
    <ScreenLayout>
      <HeaderBar title={t("contactsList.title")} onBack={() => router.back()} />
      <FlatList
        data={contacts}
        // Composite key: pipe separator can't appear in either segment
        // (contactIds are UUIDs/numeric, names don't normally contain `|`).
        keyExtractor={(item) => `${item.contactId ?? "__free__"}|${item.contactName}`}
        renderItem={({ item }) => {
          const navigable = item.contactId !== null;
          return (
            <Pressable
              onPress={() => handleOpen(item)}
              disabled={!navigable}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: pressed ? colors.borderLight : "transparent",
                  opacity: navigable ? 1 : 0.55,
                },
              ]}
            >
              <View style={[styles.avatar, { backgroundColor: colors.primary + "18" }]}>
                <AppIcon name="account" size={22} color={colors.primary} />
              </View>
              <View style={styles.text}>
                <AppText variant="body">{item.contactName}</AppText>
                <AppText variant="caption" color={colors.textSecondary}>
                  {t("contactsList.subtitle", {
                    count: item.count,
                    date: formatDate(item.lastDate),
                  })}
                </AppText>
              </View>
              {navigable ? (
                <AppIcon name="chevron-right" size={20} color={colors.iconSecondary} />
              ) : (
                <AppIcon name="link-variant-off" size={18} color={colors.iconSecondary} />
              )}
            </Pressable>
          );
        }}
        ItemSeparatorComponent={Divider}
        ListEmptyComponent={
          loaded ? (
            <EmptyState
              icon="account-multiple-outline"
              title={t("contactsList.emptyTitle")}
              description={t("contactsList.emptyDesc")}
            />
          ) : null
        }
      />
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    flex: 1,
    gap: 2,
  },
});
