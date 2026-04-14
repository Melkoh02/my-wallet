import { View, FlatList, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScreenLayout } from "@/components/templates/ScreenLayout";
import { HeaderBar } from "@/components/templates/HeaderBar";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { EmptyState } from "@/components/molecules/EmptyState";
import { FAB } from "@/components/atoms/FAB";
import { useCategories } from "@/hooks/useCategories";
import { useTheme } from "@/providers/ThemeProvider";
import { translateCategoryName } from "@/constants/categories";
import { spacing } from "@/theme/spacing";
import type { CategoryWithSubs } from "@/db/queries/categories";

function CategoryRow({ category, onPress }: { category: CategoryWithSubs; onPress: () => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const subCount = category.subcategories.filter((s) => !s.isGeneral).length;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.borderLight : colors.card, borderColor: colors.border },
      ]}
    >
      <View style={[styles.iconContainer, { backgroundColor: category.color + "20" }]}>
        <AppIcon name={category.icon} size={22} color={category.color} />
      </View>
      <View style={styles.rowInfo}>
        <AppText variant="label">{translateCategoryName(category.name, t)}</AppText>
        <AppText variant="caption" color={colors.textSecondary}>
          {subCount} {subCount === 1 ? t("categories.subcategory") : t("categories.subcategories")}
        </AppText>
      </View>
      <AppIcon name="chevron-right" size={20} color={colors.iconSecondary} />
    </Pressable>
  );
}

export default function CategoriesScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { categories, loading } = useCategories();

  return (
    <ScreenLayout edges={["top"]}>
      <HeaderBar title={t("categories.title")} />
      <FlatList
        data={categories}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <CategoryRow category={item} onPress={() => router.push(`/category/${item.id}`)} />
        )}
        ListEmptyComponent={
          loading ? null : <EmptyState icon="shape" title={t("categories.noCategories")} />
        }
      />
      <FAB onPress={() => router.push("/category/form")} />
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    gap: spacing.md,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  rowInfo: {
    flex: 1,
    gap: 2,
  },
});
