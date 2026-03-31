import { View, FlatList, Pressable, StyleSheet, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScreenLayout } from "@/components/templates/ScreenLayout";
import { HeaderBar } from "@/components/templates/HeaderBar";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { AmountDisplay } from "@/components/molecules/AmountDisplay";
import { EmptyState } from "@/components/molecules/EmptyState";
import { Divider } from "@/components/atoms/Divider";
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
  onToggle,
  onDelete,
}: {
  item: RecurringTransaction;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const typeColor = item.type === "income" ? colors.income : colors.expense;

  return (
    <View style={[styles.row, { opacity: item.isActive ? 1 : 0.5 }]}>
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
    </View>
  );
}

export default function RecurringScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { items, loading } = useRecurring(false);
  const { invalidate } = useDataRefresh();

  const handleToggle = async (id: number) => {
    await toggleRecurring(id);
    invalidate("recurring");
  };

  const handleDelete = (id: number, name: string) => {
    Alert.alert(t("recurring.deleteTitle"), t("recurring.deleteMessage", { name }), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: async () => {
          await deleteRecurring(id);
          invalidate("recurring");
        },
      },
    ]);
  };

  return (
    <ScreenLayout edges={["top"]}>
      <HeaderBar
        title="Recurring"
        onBack={() => router.back()}
        rightIcon="plus"
        onRightPress={() => router.push("/recurring/form")}
      />
      <FlatList
        data={items}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <RecurringRow
            item={item}
            onToggle={() => handleToggle(item.id)}
            onDelete={() => handleDelete(item.id, item.description)}
          />
        )}
        ItemSeparatorComponent={Divider}
        ListEmptyComponent={
          loading ? null : (
            <EmptyState
              icon="refresh"
              title="No recurring items"
              description="Set up salary, subscriptions, and other regular transactions"
            />
          )
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
