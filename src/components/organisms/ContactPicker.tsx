import { useState, useCallback, useRef } from "react";
import { View, Pressable, FlatList, Modal, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { AppText } from "@/components/atoms/AppText";
import { AppInput } from "@/components/atoms/AppInput";
import { AppIcon } from "@/components/atoms/AppIcon";
import { useTheme } from "@/providers/ThemeProvider";
import { spacing } from "@/theme/spacing";
import {
  searchContacts,
  getAllContacts,
  requestContactsPermission,
  hasContactsPermission,
  type SimpleContact,
} from "@/services/contacts.service";
import { getFrequentContacts, getLastUsedContact } from "@/db/queries/transactions";

const PAGE_SIZE = 50;

type ContactPickerProps = {
  selected: { id: string; name: string } | null;
  onSelect: (contact: { id: string; name: string } | null) => void;
};

export function ContactPicker({ selected, onSelect }: ContactPickerProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");
  const [allContacts, setAllContacts] = useState<SimpleContact[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<SimpleContact[]>([]);
  const [frequents, setFrequents] = useState<{ id: string; name: string }[]>([]);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const hasMoreRef = useRef(true);
  const pageRef = useRef(0);

  const openPicker = useCallback(async () => {
    let perm = await hasContactsPermission();
    if (!perm) {
      perm = await requestContactsPermission();
    }
    setHasPermission(perm);
    if (!perm) return;

    // Load frequents + first page of contacts in parallel
    const [frequent, lastUsed, contacts] = await Promise.all([
      getFrequentContacts(5),
      getLastUsedContact(),
      getAllContacts(PAGE_SIZE),
    ]);

    // Build unique frequents list: top 4 frequent + last used if different
    const seen = new Set<string>();
    const freqList: { id: string; name: string }[] = [];
    for (const f of frequent.slice(0, 4)) {
      if (!seen.has(f.id)) {
        seen.add(f.id);
        freqList.push({ id: f.id, name: f.name });
      }
    }
    if (lastUsed && !seen.has(lastUsed.id) && freqList.length < 5) {
      freqList.push(lastUsed);
    }

    setFrequents(freqList);
    setAllContacts(contacts);
    setFilteredContacts(contacts);
    hasMoreRef.current = contacts.length === PAGE_SIZE;
    pageRef.current = 1;
    setQuery("");
    setVisible(true);
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMoreRef.current || query.length >= 2) return;
    setLoadingMore(true);
    const offset = pageRef.current * PAGE_SIZE;
    const moreContacts = await getAllContacts(PAGE_SIZE + offset);
    // getAllContacts doesn't support offset, so we take the full set
    // and only add contacts we don't have yet
    const existingIds = new Set(allContacts.map((c) => c.id));
    const newContacts = moreContacts.filter((c) => !existingIds.has(c.id));
    if (newContacts.length > 0) {
      const updated = [...allContacts, ...newContacts];
      setAllContacts(updated);
      setFilteredContacts(updated);
    }
    hasMoreRef.current = moreContacts.length > allContacts.length;
    pageRef.current += 1;
    setLoadingMore(false);
  }, [loadingMore, query, allContacts]);

  const handleSearch = useCallback(
    async (text: string) => {
      setQuery(text);
      if (text.length >= 2) {
        const contacts = await searchContacts(text);
        setFilteredContacts(contacts);
      } else {
        setFilteredContacts(allContacts);
      }
    },
    [allContacts],
  );

  const handleSelect = useCallback(
    (item: { id: string; name: string }) => {
      onSelect(item);
      setVisible(false);
      setQuery("");
      setFilteredContacts([]);
    },
    [onSelect],
  );

  const renderContactRow = useCallback(
    (item: { id: string; name: string }) => (
      <Pressable
        onPress={() => handleSelect(item)}
        style={[styles.contactRow, { borderBottomColor: colors.borderLight }]}
      >
        <AppIcon name="account-circle" size={32} color={colors.iconSecondary} />
        <AppText variant="body">{item.name}</AppText>
      </Pressable>
    ),
    [handleSelect, colors],
  );

  return (
    <View>
      <Pressable
        onPress={selected ? () => onSelect(null) : openPicker}
        style={[styles.trigger, { borderColor: colors.border, backgroundColor: colors.surface }]}
      >
        <AppText variant="label" color={colors.textSecondary} style={styles.triggerLabel}>
          {t("transactionForm.contact")} ({t("common.optional")})
        </AppText>
        <View style={styles.triggerValue}>
          {selected ? (
            <>
              <AppIcon name="account" size={20} color={colors.primary} />
              <AppText variant="body" style={styles.contactName} numberOfLines={1}>
                {selected.name}
              </AppText>
              <AppIcon name="close-circle" size={20} color={colors.iconSecondary} />
            </>
          ) : (
            <>
              <AppIcon name="account-plus-outline" size={20} color={colors.iconSecondary} />
              <AppText variant="body" color={colors.placeholder} numberOfLines={1}>
                {t("transactionForm.selectContact")}
              </AppText>
            </>
          )}
        </View>
      </Pressable>

      {hasPermission === false && (
        <AppText variant="caption" color={colors.warning} style={{ marginTop: spacing.xs }}>
          {t("contacts.permissionDenied")}
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
            <AppText variant="h3">{t("contacts.selectContact")}</AppText>
            <Pressable onPress={() => setVisible(false)}>
              <AppIcon name="close" size={24} color={colors.icon} />
            </Pressable>
          </View>
          <View style={styles.searchWrap}>
            <AppInput
              placeholder={t("contacts.searchContacts")}
              value={query}
              onChangeText={handleSearch}
              autoFocus
            />
          </View>
          <FlatList
            data={filteredContacts}
            keyExtractor={(item) => item.id}
            ListHeaderComponent={
              frequents.length > 0 ? (
                <View>
                  <AppText
                    variant="label"
                    color={colors.textSecondary}
                    style={styles.sectionHeader}
                  >
                    {t("contacts.frequents")}
                  </AppText>
                  {frequents.map((item) => (
                    <View key={item.id}>{renderContactRow(item)}</View>
                  ))}
                  <AppText
                    variant="label"
                    color={colors.textSecondary}
                    style={styles.sectionHeader}
                  >
                    {t("contacts.allContacts")}
                  </AppText>
                </View>
              ) : null
            }
            renderItem={({ item }) => renderContactRow(item)}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            ListEmptyComponent={
              query.length >= 2 ? (
                <AppText variant="bodySmall" color={colors.textTertiary} style={styles.emptyText}>
                  {t("contacts.noContacts")}
                </AppText>
              ) : null
            }
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  triggerLabel: {
    marginBottom: 2,
  },
  triggerValue: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 32,
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
  sectionHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
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
