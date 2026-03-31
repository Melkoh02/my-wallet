import { useEffect, useState } from "react";
import { View, ScrollView, StyleSheet } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ModalLayout } from "@/components/templates/ModalLayout";
import { AppInput } from "@/components/atoms/AppInput";
import { AppButton } from "@/components/atoms/AppButton";
import { AppText } from "@/components/atoms/AppText";
import { Chip } from "@/components/atoms/Chip";
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

const ICONS = [
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
  "book-open-variant",
];

export default function CategoryFormScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { colors } = useTheme();
  const { invalidate } = useDataRefresh();
  const [initial, setInitial] = useState<Category | undefined>();
  const [loaded, setLoaded] = useState(!params.id);

  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[2]);
  const [icon, setIcon] = useState("tag");
  const [isIncome, setIsIncome] = useState(false);
  const [isExpense, setIsExpense] = useState(true);

  useEffect(() => {
    if (params.id) {
      getCategoryById(parseInt(params.id, 10)).then((cat) => {
        if (cat) {
          setInitial(cat);
          setName(cat.name);
          setColor(cat.color);
          setIcon(cat.icon);
          setIsIncome(cat.isIncome);
          setIsExpense(cat.isExpense);
        }
        setLoaded(true);
      });
    }
  }, [params.id]);

  const handleSubmit = async () => {
    const data = { name: name.trim(), color, icon, isIncome, isExpense };
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

  const isValid = name.trim().length > 0 && (isIncome || isExpense);

  return (
    <ModalLayout title={initial ? "Edit Category" : "New Category"} onClose={() => router.back()}>
      <ScrollView contentContainerStyle={styles.container}>
        <AppInput
          label="Category Name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Groceries"
        />

        <View style={styles.section}>
          <AppText variant="label" color={colors.textSecondary}>
            Used for
          </AppText>
          <View style={styles.chipRow}>
            <Chip label="Expense" selected={isExpense} onPress={() => setIsExpense(!isExpense)} />
            <Chip label="Income" selected={isIncome} onPress={() => setIsIncome(!isIncome)} />
          </View>
        </View>

        <View style={styles.section}>
          <AppText variant="label" color={colors.textSecondary}>
            Color
          </AppText>
          <View style={styles.grid}>
            {COLORS.map((c) => (
              <View
                key={c}
                style={[
                  styles.colorDot,
                  { backgroundColor: c, borderColor: color === c ? colors.text : "transparent" },
                ]}
                onTouchEnd={() => setColor(c)}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <AppText variant="label" color={colors.textSecondary}>
            Icon
          </AppText>
          <View style={styles.grid}>
            {ICONS.map((i) => (
              <View
                key={i}
                style={[
                  styles.iconOption,
                  { backgroundColor: icon === i ? color + "20" : colors.surface },
                ]}
                onTouchEnd={() => setIcon(i)}
              >
                <AppText>{/* AppIcon inline */}</AppText>
                <View style={styles.iconCenter}>
                  <AppButton
                    title=""
                    variant="ghost"
                    icon={i}
                    onPress={() => setIcon(i)}
                    style={styles.iconBtn}
                  />
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.actions}>
          <AppButton
            title={initial ? "Save Changes" : "Create Category"}
            onPress={handleSubmit}
            disabled={!isValid}
          />
          {initial && !initial.isSystem && (
            <AppButton
              title="Delete Category"
              onPress={handleDelete}
              variant="danger"
              icon="delete"
            />
          )}
        </View>
      </ScrollView>
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
  chipRow: {
    flexDirection: "row",
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
  iconCenter: {
    position: "absolute",
  },
  iconBtn: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderWidth: 0,
  },
  actions: {
    gap: spacing.md,
    marginTop: spacing.lg,
  },
});
