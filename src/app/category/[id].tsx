import { useEffect, useState } from "react";
import { View, FlatList, Pressable, StyleSheet, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScreenLayout } from "@/components/templates/ScreenLayout";
import { HeaderBar } from "@/components/templates/HeaderBar";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { AppInput } from "@/components/atoms/AppInput";
import { AppButton } from "@/components/atoms/AppButton";
import { Divider } from "@/components/atoms/Divider";
import { useTheme } from "@/providers/ThemeProvider";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import { getCategoryById, createSubcategory, deleteSubcategory } from "@/db/queries/categories";
import { spacing } from "@/theme/spacing";
import type { CategoryWithSubs } from "@/db/queries/categories";

export default function CategoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { invalidate, revisions } = useDataRefresh();
  const [category, setCategory] = useState<CategoryWithSubs | null>(null);
  const [newSubName, setNewSubName] = useState("");

  useEffect(() => {
    if (id) {
      getCategoryById(parseInt(id, 10)).then((cat) => setCategory(cat ?? null));
    }
  }, [id, revisions.categories]);

  if (!category) return null;

  const handleAddSub = async () => {
    if (!newSubName.trim()) return;
    await createSubcategory(category.id, newSubName.trim());
    setNewSubName("");
    invalidate("categories");
  };

  const handleDeleteSub = (subId: number, name: string) => {
    Alert.alert(t("categories.deleteSubcategory"), t("categories.removeSubcategory", { name }), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: async () => {
          await deleteSubcategory(subId);
          invalidate("categories");
        },
      },
    ]);
  };

  return (
    <ScreenLayout edges={["top"]}>
      <HeaderBar
        title={category.name}
        onBack={() => router.back()}
        rightIcon="pencil"
        onRightPress={() => router.push(`/category/form?id=${category.id}`)}
      />
      <View style={styles.header}>
        <View style={[styles.iconBig, { backgroundColor: category.color + "20" }]}>
          <AppIcon name={category.icon} size={32} color={category.color} />
        </View>
      </View>
      <Divider />
      <View style={styles.addRow}>
        <AppInput
          placeholder={t("categories.newSubcategory")}
          value={newSubName}
          onChangeText={setNewSubName}
          style={styles.addInput}
          onSubmitEditing={handleAddSub}
        />
        <AppButton title={t("common.add")} onPress={handleAddSub} disabled={!newSubName.trim()} />
      </View>
      <FlatList
        data={category.subcategories}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <View style={[styles.subRow, { borderBottomColor: colors.borderLight }]}>
            <AppText variant="body" style={styles.subName}>
              {item.name}
            </AppText>
            {item.isGeneral ? (
              <AppText variant="caption" color={colors.textTertiary}>
                {t("common.default")}
              </AppText>
            ) : (
              <Pressable onPress={() => handleDeleteSub(item.id, item.name)} hitSlop={8}>
                <AppIcon name="close-circle-outline" size={20} color={colors.iconSecondary} />
              </Pressable>
            )}
          </View>
        )}
      />
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  iconBig: {
    width: 64,
    height: 64,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  addRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  addInput: {
    flex: 1,
  },
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  subName: {
    flex: 1,
  },
});
