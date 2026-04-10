import { useState } from "react";
import { View, FlatList, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScreenLayout } from "@/components/templates/ScreenLayout";
import { HeaderBar } from "@/components/templates/HeaderBar";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { AmountDisplay } from "@/components/molecules/AmountDisplay";
import { EmptyState } from "@/components/molecules/EmptyState";
import { Divider } from "@/components/atoms/Divider";
import { ConfirmModal } from "@/components/atoms/ConfirmModal";
import { FAB } from "@/components/atoms/FAB";
import { useTemplates } from "@/hooks/useTemplates";
import { useTheme } from "@/providers/ThemeProvider";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import { deleteTemplate } from "@/db/queries/templates";
import { spacing } from "@/theme/spacing";
import type { TemplateWithSubs } from "@/db/queries/templates";

const TYPE_ICONS: Record<string, string> = {
  income: "arrow-down",
  expense: "arrow-up",
  transfer: "swap-horizontal",
};

export default function TemplatesScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { templates, loading } = useTemplates();
  const { invalidate } = useDataRefresh();
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteTemplate(deleteTarget.id);
    invalidate("templates");
    setDeleteTarget(null);
  };

  const renderItem = ({ item }: { item: TemplateWithSubs }) => {
    const typeColor =
      item.type === "income"
        ? colors.income
        : item.type === "expense"
          ? colors.expense
          : colors.transfer;
    return (
      <Pressable
        onPress={() => router.push(`/template/form?id=${item.id}` as never)}
        style={styles.row}
      >
        <View style={[styles.iconWrap, { backgroundColor: typeColor + "18" }]}>
          <AppIcon name={item.icon || TYPE_ICONS[item.type]} size={22} color={typeColor} />
        </View>
        <View style={styles.info}>
          <AppText variant="label" numberOfLines={1}>
            {item.name}
          </AppText>
          {item.description ? (
            <AppText variant="caption" color={colors.textSecondary} numberOfLines={1}>
              {item.description}
            </AppText>
          ) : null}
        </View>
        {item.amount > 0 && (
          <AmountDisplay
            amount={item.amount}
            type={item.type as "income" | "expense" | "transfer"}
            variant="label"
          />
        )}
        <Pressable onPress={() => setDeleteTarget({ id: item.id, name: item.name })} hitSlop={8}>
          <AppIcon name="delete-outline" size={22} color={colors.danger} />
        </Pressable>
      </Pressable>
    );
  };

  return (
    <ScreenLayout edges={["top"]}>
      <HeaderBar title={t("templates.title")} onBack={() => router.back()} />
      <FlatList
        data={templates}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderItem}
        ItemSeparatorComponent={Divider}
        ListEmptyComponent={
          loading ? null : (
            <EmptyState
              icon="file-document-multiple"
              title={t("templates.noItems")}
              description={t("templates.noItemsDesc")}
            />
          )
        }
      />
      <FAB onPress={() => router.push("/template/form" as never)} />
      <ConfirmModal
        visible={!!deleteTarget}
        title={t("templates.deleteTitle")}
        message={t("templates.deleteMessage", { name: deleteTarget?.name ?? "" })}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
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
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  info: { flex: 1, gap: 2 },
});
