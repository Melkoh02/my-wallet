import { useEffect, useState } from "react";
import { View, Pressable, ScrollView, StyleSheet } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { ModalLayout } from "@/components/templates/ModalLayout";
import { AppInput } from "@/components/atoms/AppInput";
import { AppButton } from "@/components/atoms/AppButton";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { IconPickerModal } from "@/components/organisms/IconPickerModal";
import { useTheme } from "@/providers/ThemeProvider";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import {
  createCategory,
  updateCategory,
  getCategoryById,
  deleteCategory,
} from "@/db/queries/categories";
import { spacing } from "@/theme/spacing";
import type { Category } from "@/db/schema";

const COLORS = [
  "#EF4444",
  "#F59E0B",
  "#10B981",
  "#3B82F6",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
  "#6366F1",
  "#F97316",
  "#06B6D4",
  "#78716C",
  "#22C55E",
];

const QUICK_ICONS = [
  "food",
  "car",
  "home",
  "shopping",
  "movie-open",
  "heart-pulse",
  "school",
  "account",
  "briefcase",
  "laptop",
  "chart-line",
  "cash-plus",
  "tag",
  "gift",
  "paw",
  "dumbbell",
  "phone",
  "airplane",
  "music",
];

export default function CategoryFormScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id?: string }>();
  const { colors } = useTheme();
  const { invalidate } = useDataRefresh();
  const [initial, setInitial] = useState<Category | undefined>();
  const [loaded, setLoaded] = useState(!params.id);
  const [iconPickerVisible, setIconPickerVisible] = useState(false);

  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[2]);
  const [icon, setIcon] = useState("tag");

  useEffect(() => {
    if (params.id) {
      getCategoryById(parseInt(params.id, 10)).then((cat) => {
        if (cat) {
          setInitial(cat);
          setName(cat.name);
          setColor(cat.color);
          setIcon(cat.icon);
        }
        setLoaded(true);
      });
    }
  }, [params.id]);

  const handleSubmit = async () => {
    const data = { name: name.trim(), color, icon, isIncome: true, isExpense: true };
    if (initial) {
      await updateCategory(initial.id, data);
    } else {
      await createCategory(data);
    }
    invalidate("categories");
    router.back();
  };

  const handleDelete = async () => {
    if (initial) {
      await deleteCategory(initial.id);
      invalidate("categories");
      router.back();
    }
  };

  if (!loaded) return null;

  const isValid = name.trim().length > 0;

  return (
    <ModalLayout
      title={initial ? t("categories.editCategory") : t("categories.newCategory")}
      onClose={() => router.back()}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <AppInput
          label={t("categories.categoryName")}
          value={name}
          onChangeText={setName}
          placeholder={t("categories.categoryNamePlaceholder")}
        />

        <View style={styles.section}>
          <AppText variant="label" color={colors.textSecondary}>
            {t("accounts.color")}
          </AppText>
          <View style={styles.grid}>
            {COLORS.map((c) => (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                style={[
                  styles.colorDot,
                  { backgroundColor: c, borderColor: color === c ? colors.text : "transparent" },
                ]}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <AppText variant="label" color={colors.textSecondary}>
            {t("categories.icon")}
          </AppText>
          <View style={styles.grid}>
            {/* Show selected icon first if it's custom (not in defaults) */}
            {!QUICK_ICONS.includes(icon) && (
              <Pressable
                onPress={() => {}}
                style={[
                  styles.iconOption,
                  {
                    backgroundColor: color + "20",
                    borderColor: color,
                    borderWidth: 2,
                  },
                ]}
              >
                <AppIcon name={icon} size={22} color={color} />
              </Pressable>
            )}
            {QUICK_ICONS.map((i) => (
              <Pressable
                key={i}
                onPress={() => setIcon(i)}
                style={[
                  styles.iconOption,
                  { backgroundColor: icon === i ? color + "20" : colors.surface },
                ]}
              >
                <AppIcon name={i} size={22} color={icon === i ? color : colors.icon} />
              </Pressable>
            ))}
            {/* Search all icons */}
            <Pressable
              onPress={() => setIconPickerVisible(true)}
              style={[
                styles.iconOption,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderWidth: 1,
                  borderStyle: "dashed",
                },
              ]}
            >
              <AppIcon name="magnify" size={22} color={colors.primary} />
            </Pressable>
          </View>
        </View>

        <View style={styles.actions}>
          <AppButton
            title={initial ? t("accounts.saveChanges") : t("common.create")}
            onPress={handleSubmit}
            disabled={!isValid}
          />
          {initial && !initial.isSystem && (
            <AppButton
              title={t("categories.deleteCategory")}
              onPress={handleDelete}
              variant="danger"
              icon="delete"
            />
          )}
        </View>
      </ScrollView>

      <IconPickerModal
        visible={iconPickerVisible}
        onClose={() => setIconPickerVisible(false)}
        onSelect={setIcon}
        selectedColor={color}
      />
    </ModalLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.lg,
    paddingBottom: spacing["5xl"],
  },
  section: {
    gap: spacing.sm,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  colorDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2.5,
  },
  iconOption: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  actions: {
    gap: spacing.md,
    marginTop: spacing.lg,
  },
});
