import { useState, useCallback } from "react";
import { View, Pressable, FlatList, Modal, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppText } from "@/components/atoms/AppText";
import { AppInput } from "@/components/atoms/AppInput";
import { AppIcon } from "@/components/atoms/AppIcon";
import { useTheme } from "@/providers/ThemeProvider";
import { spacing } from "@/theme/spacing";
import {
  searchContacts,
  requestContactsPermission,
  hasContactsPermission,
  type SimpleContact,
} from "@/services/contacts.service";

type ContactPickerProps = {
  selected: { id: string; name: string } | null;
  onSelect: (contact: { id: string; name: string } | null) => void;
};

export function ContactPicker({ selected, onSelect }: ContactPickerProps) {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SimpleContact[]>([]);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  const openPicker = useCallback(async () => {
    let perm = await hasContactsPermission();
    if (!perm) {
      perm = await requestContactsPermission();
    }
    setHasPermission(perm);
    if (perm) setVisible(true);
  }, []);

  const handleSearch = useCallback(async (text: string) => {
    setQuery(text);
    if (text.length >= 2) {
      const contacts = await searchContacts(text);
      setResults(contacts);
    } else {
      setResults([]);
    }
  }, []);

  return (
    <View style={styles.container}>
      <AppText variant="label" color={colors.textSecondary}>
        Contact (optional)
      </AppText>
      <Pressable
        onPress={selected ? () => onSelect(null) : openPicker}
        style={[styles.trigger, { borderColor: colors.border, backgroundColor: colors.surface }]}
      >
        {selected ? (
          <>
            <AppIcon name="account" size={20} color={colors.primary} />
            <AppText variant="body" style={styles.contactName}>
              {selected.name}
            </AppText>
            <AppIcon name="close-circle" size={20} color={colors.iconSecondary} />
          </>
        ) : (
          <>
            <AppIcon name="account-plus-outline" size={20} color={colors.iconSecondary} />
            <AppText variant="body" color={colors.placeholder}>
              Select contact...
            </AppText>
          </>
        )}
      </Pressable>

      {hasPermission === false && (
        <AppText variant="caption" color={colors.warning}>
          Contact permission denied
        </AppText>
      )}

      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setVisible(false)}
      >
        <SafeAreaView style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={styles.modalHeader}>
            <AppText variant="h3">Select Contact</AppText>
            <Pressable onPress={() => setVisible(false)}>
              <AppIcon name="close" size={24} color={colors.icon} />
            </Pressable>
          </View>
          <View style={styles.searchWrap}>
            <AppInput
              placeholder="Search contacts..."
              value={query}
              onChangeText={handleSearch}
              autoFocus
            />
          </View>
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  onSelect(item);
                  setVisible(false);
                  setQuery("");
                  setResults([]);
                }}
                style={[styles.contactRow, { borderBottomColor: colors.borderLight }]}
              >
                <AppIcon name="account-circle" size={32} color={colors.iconSecondary} />
                <AppText variant="body">{item.name}</AppText>
              </Pressable>
            )}
            ListEmptyComponent={
              query.length >= 2 ? (
                <AppText variant="bodySmall" color={colors.textTertiary} style={styles.emptyText}>
                  No contacts found
                </AppText>
              ) : (
                <AppText variant="bodySmall" color={colors.textTertiary} style={styles.emptyText}>
                  Type at least 2 characters to search
                </AppText>
              )
            }
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 48,
  },
  contactName: { flex: 1 },
  modal: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  searchWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  emptyText: { textAlign: "center", padding: spacing["2xl"] },
});
