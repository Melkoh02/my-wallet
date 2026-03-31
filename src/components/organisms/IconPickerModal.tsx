import { useState, useMemo } from "react";
import { View, FlatList, Pressable, Modal, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { AppInput } from "@/components/atoms/AppInput";
import { useTheme } from "@/providers/ThemeProvider";
import { spacing } from "@/theme/spacing";

// Get all available icon names from the glyph map
const ALL_ICONS = Object.keys(MaterialCommunityIcons.glyphMap).sort();

type IconPickerModalProps = {
  visible: boolean;
  onClose: () => void;
  onSelect: (icon: string) => void;
  selectedColor?: string;
};

export function IconPickerModal({
  visible,
  onClose,
  onSelect,
  selectedColor,
}: IconPickerModalProps) {
  const { colors } = useTheme();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return ALL_ICONS.slice(0, 200); // Show first 200 by default
    const q = search.toLowerCase();
    return ALL_ICONS.filter((name) => name.includes(q)).slice(0, 200);
  }, [search]);

  const iconColor = selectedColor ?? colors.icon;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <AppText variant="h3">Choose Icon</AppText>
          <Pressable onPress={onClose}>
            <AppIcon name="close" size={24} color={colors.icon} />
          </Pressable>
        </View>
        <View style={styles.searchWrap}>
          <AppInput
            placeholder="Search icons... (e.g. cart, music, star)"
            value={search}
            onChangeText={setSearch}
            autoFocus
          />
        </View>
        <FlatList
          data={filtered}
          keyExtractor={(item) => item}
          numColumns={6}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                onSelect(item);
                onClose();
                setSearch("");
              }}
              style={[styles.iconCell, { backgroundColor: colors.surface }]}
            >
              <AppIcon name={item} size={24} color={iconColor} />
            </Pressable>
          )}
          ListEmptyComponent={
            <AppText variant="bodySmall" color={colors.textTertiary} style={styles.empty}>
              No icons found for &ldquo;{search}&rdquo;
            </AppText>
          }
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  searchWrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  grid: {
    paddingHorizontal: spacing.md,
  },
  iconCell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    margin: 3,
    borderRadius: 10,
  },
  empty: {
    textAlign: "center",
    padding: spacing["2xl"],
  },
});
