import { useState } from "react";
import { View, Pressable, FlatList, Modal, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { Chip } from "@/components/atoms/Chip";
import { Divider } from "@/components/atoms/Divider";
import { useTheme } from "@/providers/ThemeProvider";
import { spacing } from "@/theme/spacing";
import type { CategoryWithSubs } from "@/db/queries/categories";

type CategoryPickerProps = {
  categories: CategoryWithSubs[];
  selected: number[]; // subcategory IDs
  onSelectionChange: (ids: number[]) => void;
  label?: string;
};

export function CategoryPicker({
  categories,
  selected,
  onSelectionChange,
  label = "Categories",
}: CategoryPickerProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [expandedCatId, setExpandedCatId] = useState<number | null>(null);

  const toggleSub = (subId: number) => {
    if (selected.includes(subId)) {
      onSelectionChange(selected.filter((id) => id !== subId));
    } else {
      onSelectionChange([...selected, subId]);
    }
  };

  // Resolve selected subcategory names for display
  const selectedNames: string[] = [];
  for (const cat of categories) {
    for (const sub of cat.subcategories) {
      if (selected.includes(sub.id)) {
        selectedNames.push(sub.isGeneral ? cat.name : `${cat.name} › ${sub.name}`);
      }
    }
  }

  return (
    <View style={styles.container}>
      <AppText variant="label" color={colors.textSecondary}>
        {label}
      </AppText>
      <Pressable
        onPress={() => setVisible(true)}
        style={[styles.trigger, { borderColor: colors.border, backgroundColor: colors.surface }]}
      >
        {selectedNames.length > 0 ? (
          <View style={styles.chipWrap}>
            {selectedNames.map((name) => (
              <Chip key={name} label={name} selected />
            ))}
          </View>
        ) : (
          <AppText variant="body" color={colors.placeholder}>
            {t("categoryPicker.selectPlaceholder")}
          </AppText>
        )}
        <AppIcon name="chevron-down" size={20} color={colors.iconSecondary} />
      </Pressable>

      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setVisible(false)}
      >
        <SafeAreaView style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={styles.modalHeader}>
            <AppText variant="h3">{t("categoryPicker.title")}</AppText>
            <Pressable onPress={() => setVisible(false)}>
              <AppText variant="button" color={colors.primary}>
                {t("common.done")}
              </AppText>
            </Pressable>
          </View>
          <FlatList
            data={categories}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item: cat }) => (
              <View>
                <Pressable
                  onPress={() => setExpandedCatId(expandedCatId === cat.id ? null : cat.id)}
                  style={styles.catRow}
                >
                  <View style={[styles.catIcon, { backgroundColor: cat.color + "20" }]}>
                    <AppIcon name={cat.icon} size={20} color={cat.color} />
                  </View>
                  <AppText variant="label" style={styles.catName}>
                    {cat.name}
                  </AppText>
                  <AppIcon
                    name={expandedCatId === cat.id ? "chevron-up" : "chevron-down"}
                    size={20}
                    color={colors.iconSecondary}
                  />
                </Pressable>
                {expandedCatId === cat.id &&
                  cat.subcategories.map((sub) => (
                    <Pressable key={sub.id} onPress={() => toggleSub(sub.id)} style={styles.subRow}>
                      <AppIcon
                        name={
                          selected.includes(sub.id) ? "checkbox-marked" : "checkbox-blank-outline"
                        }
                        size={22}
                        color={selected.includes(sub.id) ? colors.primary : colors.iconSecondary}
                      />
                      <AppText variant="body" style={styles.subName}>
                        {sub.name}
                      </AppText>
                      {sub.isGeneral && (
                        <AppText variant="caption" color={colors.textTertiary}>
                          {t("common.general")}
                        </AppText>
                      )}
                    </Pressable>
                  ))}
                <Divider />
              </View>
            )}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 48,
  },
  chipWrap: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  modal: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  catRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  catIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  catName: {
    flex: 1,
  },
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: spacing["3xl"] + spacing.lg,
    paddingRight: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  subName: {
    flex: 1,
  },
});
