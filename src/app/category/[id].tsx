import { useEffect, useState } from "react";
import { View, FlatList, Pressable, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScreenLayout } from "@/components/templates/ScreenLayout";
import { HeaderBar } from "@/components/templates/HeaderBar";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { AppInput } from "@/components/atoms/AppInput";
import { AppButton } from "@/components/atoms/AppButton";
import { Divider } from "@/components/atoms/Divider";
import { ConfirmModal } from "@/components/atoms/ConfirmModal";
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
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);

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

  const confirmDeleteSub = async () => {
    if (!deleteTarget) return;
    await deleteSubcategory(deleteTarget.id);
    invalidate("categories");
    setDeleteTarget(null);
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
          containerStyle={styles.addInput}
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
              <Pressable
                onPress={() => setDeleteTarget({ id: item.id, name: item.name })}
                hitSlop={8}
              >
                <AppIcon name="close-circle-outline" size={20} color={colors.iconSecondary} />
              </Pressable>
            )}
          </View>
        )}
      />
      <ConfirmModal
        visible={!!deleteTarget}
        title={t("categories.deleteSubcategory")}
        message={t("categories.removeSubcategory", { name: deleteTarget?.name ?? "" })}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={confirmDeleteSub}
        onCancel={() => setDeleteTarget(null)}
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
