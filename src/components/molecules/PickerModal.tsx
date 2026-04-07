import { useState, useMemo } from "react";
import { View, FlatList, Pressable, Modal, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { AppInput } from "@/components/atoms/AppInput";
import { useTheme } from "@/providers/ThemeProvider";
import { spacing } from "@/theme/spacing";

type PickerModalProps<T> = {
  visible: boolean;
  title: string;
  items: T[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T, isSelected: boolean) => React.ReactNode;
  selectedKey?: string;
  onSelect: (item: T) => void;
  onClose: () => void;
  searchable?: boolean;
  searchFilter?: (item: T, query: string) => boolean;
  searchPlaceholder?: string;
  ListHeaderComponent?: React.ReactElement | null;
};

export function PickerModal<T>({
  visible,
  title,
  items,
  keyExtractor,
  renderItem,
  selectedKey,
  onSelect,
  onClose,
  searchable = false,
  searchFilter,
  searchPlaceholder,
  ListHeaderComponent,
}: PickerModalProps<T>) {
  const { colors } = useTheme();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!searchable || !search.trim() || !searchFilter) return items;
    return items.filter((item) => searchFilter(item, search));
  }, [items, search, searchable, searchFilter]);

  const handleSelect = (item: T) => {
    onSelect(item);
    handleClose();
  };

  const handleClose = () => {
    onClose();
    setSearch("");
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <AppText variant="h3">{title}</AppText>
          <Pressable onPress={handleClose}>
            <AppIcon name="close" size={24} color={colors.icon} />
          </Pressable>
        </View>
        {searchable && (
          <View style={styles.searchWrap}>
            <AppInput
              placeholder={searchPlaceholder}
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
            />
          </View>
        )}
        <FlatList
          data={filtered}
          keyExtractor={keyExtractor}
          ListHeaderComponent={ListHeaderComponent}
          renderItem={({ item }) => {
            const key = keyExtractor(item);
            const isSelected = key === selectedKey;
            return (
              <Pressable
                onPress={() => handleSelect(item)}
                style={({ pressed }) => [
                  styles.row,
                  {
                    backgroundColor: pressed
                      ? colors.borderLight
                      : isSelected
                        ? colors.surface
                        : "transparent",
                  },
                ]}
              >
                {renderItem(item, isSelected)}
              </Pressable>
            );
          }}
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
    paddingBottom: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
});
