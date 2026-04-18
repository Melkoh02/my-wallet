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
import { HelpModal } from "@/components/molecules/HelpModal";
import { useRecurring } from "@/hooks/useRecurring";
import { useTheme } from "@/providers/ThemeProvider";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import { deleteRecurring, toggleRecurring } from "@/db/queries/recurring";
import { formatDate } from "@/utils/format";
import { spacing } from "@/theme/spacing";
import type { RecurringTransaction } from "@/db/schema";

const FREQ_KEYS: Record<string, string> = {
  daily: "recurring.daily",
  weekly: "recurring.weekly",
  biweekly: "recurring.biweekly",
  monthly: "recurring.monthly",
  yearly: "recurring.yearly",
};

function RecurringRow({
  item,
  onPress,
  onToggle,
  onDelete,
}: {
  item: RecurringTransaction;
  onPress: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const typeColor = item.type === "income" ? colors.income : colors.expense;

  return (
    <Pressable onPress={onPress} style={[styles.row, { opacity: item.isActive ? 1 : 0.5 }]}>
      <View style={[styles.iconWrap, { backgroundColor: typeColor + "18" }]}>
        <AppIcon
          name={item.type === "income" ? "arrow-down" : "arrow-up"}
          size={20}
          color={typeColor}
        />
      </View>
      <View style={styles.info}>
        <AppText variant="label" numberOfLines={1}>
          {item.description}
        </AppText>
        <AppText variant="caption" color={colors.textSecondary}>
          {t(FREQ_KEYS[item.frequency])} · {t("recurring.next")}: {formatDate(item.nextDate)}
        </AppText>
      </View>
      <AmountDisplay
        amount={item.amount}
        type={item.type as "income" | "expense"}
        variant="label"
      />
      <View style={styles.actions}>
        <Pressable onPress={onToggle} hitSlop={8}>
          <AppIcon
            name={item.isActive ? "pause-circle-outline" : "play-circle-outline"}
            size={22}
            color={colors.iconSecondary}
          />
        </Pressable>
        <Pressable onPress={onDelete} hitSlop={8}>
          <AppIcon name="delete-outline" size={22} color={colors.danger} />
        </Pressable>
      </View>
    </Pressable>
  );
}

export default function RecurringScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { items, loading } = useRecurring(false);
  const { invalidate } = useDataRefresh();
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const handleToggle = async (id: number) => {
    await toggleRecurring(id);
    invalidate("recurring");
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteRecurring(deleteTarget.id);
    invalidate("recurring");
    setDeleteTarget(null);
  };

  return (
    <ScreenLayout>
      <HeaderBar
        title={t("recurring.title")}
        onBack={() => router.back()}
        rightIcon="help-circle-outline"
        onRightPress={() => setShowHelp(true)}
      />
      <FlatList
        data={items}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <RecurringRow
            item={item}
            onPress={() => router.push(`/recurring/${item.id}` as never)}
            onToggle={() => handleToggle(item.id)}
            onDelete={() => setDeleteTarget({ id: item.id, name: item.description })}
          />
        )}
        ItemSeparatorComponent={Divider}
        ListEmptyComponent={
          loading ? null : (
            <EmptyState
              icon="refresh"
              title={t("recurring.noItems")}
              description={t("recurring.noItemsDesc")}
            />
          )
        }
      />
      <FAB onPress={() => router.push("/recurring/form")} />
      <ConfirmModal
        visible={!!deleteTarget}
        title={t("recurring.deleteTitle")}
        message={t("recurring.deleteMessage", { name: deleteTarget?.name ?? "" })}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
      <HelpModal
        visible={showHelp}
        title={t("recurring.title")}
        helpKey="recurring"
        onClose={() => setShowHelp(false)}
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
  actions: { flexDirection: "row", gap: spacing.sm },
});
