import { useEffect, useState } from "react";
import { View, ScrollView, Pressable, StyleSheet } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { ModalLayout } from "@/components/templates/ModalLayout";
import { AppInput } from "@/components/atoms/AppInput";
import { AppButton } from "@/components/atoms/AppButton";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { SelectInput } from "@/components/molecules/SelectInput";
import { PickerModal } from "@/components/molecules/PickerModal";
import { CategoryChipPicker } from "@/components/organisms/CategoryChipPicker";
import { ContactPicker } from "@/components/organisms/ContactPicker";
import { useTheme } from "@/providers/ThemeProvider";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import {
  createTemplate,
  updateTemplate,
  getTemplateById,
  type TemplateWithSubs,
} from "@/db/queries/templates";
import { spacing } from "@/theme/spacing";
import type { TransactionType } from "@/types";

export default function TemplateFormScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id?: string }>();
  const { accounts } = useAccounts();
  const { categories } = useCategories();
  const { invalidate } = useDataRefresh();
  const [initial, setInitial] = useState<TemplateWithSubs | undefined>();
  const [loaded, setLoaded] = useState(!params.id);

  useEffect(() => {
    if (params.id) {
      getTemplateById(parseInt(params.id, 10)).then((tpl) => {
        setInitial(tpl);
        setLoaded(true);
      });
    }
  }, [params.id]);

  const [name, setName] = useState("");
  const [type, setType] = useState<TransactionType>("expense");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [accountId, setAccountId] = useState<number | null>(null);
  const [toAccountId, setToAccountId] = useState<number | null>(null);
  const [subcategoryIds, setSubcategoryIds] = useState<number[]>([]);
  const [contact, setContact] = useState<{ id: string; name: string } | null>(null);
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [showToAccountPicker, setShowToAccountPicker] = useState(false);

  // Populate fields when editing
  useEffect(() => {
    if (initial) {
      setName(initial.name);
      setType(initial.type as TransactionType);
      setAmount(initial.amount > 0 ? initial.amount.toString() : "");
      setDescription(initial.description);
      setAccountId(initial.accountId);
      setToAccountId(initial.toAccountId);
      setSubcategoryIds(initial.subcategoryIds);
      setContact(
        initial.contactId ? { id: initial.contactId, name: initial.contactName ?? "" } : null,
      );
    }
  }, [initial]);

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const selectedToAccount = accounts.find((a) => a.id === toAccountId);
  const isValid = name.trim().length > 0;

  const handleSubmit = async () => {
    try {
      const data = {
        name: name.trim(),
        type,
        amount: parseFloat(amount) || 0,
        description: description.trim(),
        accountId,
        toAccountId: type === "transfer" ? toAccountId : null,
        contactId: contact?.id ?? null,
        contactName: contact?.name ?? null,
      };
      if (initial) {
        await updateTemplate(initial.id, data, subcategoryIds);
      } else {
        await createTemplate(data, subcategoryIds);
      }
      invalidate("templates");
      router.back();
    } catch (e) {
      console.error("Template save failed:", e);
    }
  };

  if (!loaded) return null;

  return (
    <ModalLayout
      title={initial ? t("templates.editTemplate") : t("templates.newTemplate")}
      onClose={() => router.back()}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <AppInput
          label={t("templates.templateName")}
          value={name}
          onChangeText={setName}
          placeholder={t("templates.templateNamePlaceholder")}
          autoFocus={!initial}
        />

        {/* Type selector */}
        <View style={styles.typeRow}>
          {(["expense", "income", "transfer"] as const).map((tp) => {
            const isActive = type === tp;
            const tColor =
              tp === "income" ? colors.income : tp === "expense" ? colors.expense : colors.transfer;
            return (
              <Pressable
                key={tp}
                onPress={() => setType(tp)}
                style={[
                  styles.typeBtn,
                  {
                    backgroundColor: isActive ? tColor + "18" : colors.surface,
                    borderColor: isActive ? tColor : colors.border,
                  },
                ]}
              >
                <AppText variant="label" color={isActive ? tColor : colors.textSecondary}>
                  {t(`transactionForm.${tp}`)}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        <AppInput
          label={`${t("transactionForm.amount")} (${t("common.optional")})`}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0"
        />

        <AppInput
          label={t("transactionForm.description")}
          value={description}
          onChangeText={setDescription}
          placeholder={t("transactionForm.descriptionPlaceholder")}
        />

        {/* Account */}
        <SelectInput
          label={
            type === "transfer" ? t("transactionForm.fromAccount") : t("transactionForm.account")
          }
          value={
            selectedAccount ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <AppIcon name={selectedAccount.icon} size={18} color={selectedAccount.color} />
                <AppText variant="body">{selectedAccount.name}</AppText>
              </View>
            ) : undefined
          }
          placeholder={t("common.select")}
          onPress={() => setShowAccountPicker(true)}
        />

        {type === "transfer" && (
          <SelectInput
            label={t("transactionForm.toAccount")}
            value={
              selectedToAccount ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <AppIcon
                    name={selectedToAccount.icon}
                    size={18}
                    color={selectedToAccount.color}
                  />
                  <AppText variant="body">{selectedToAccount.name}</AppText>
                </View>
              ) : undefined
            }
            placeholder={t("common.select")}
            onPress={() => setShowToAccountPicker(true)}
          />
        )}

        {type !== "transfer" && (
          <CategoryChipPicker
            categories={categories}
            selected={subcategoryIds}
            onSelectionChange={setSubcategoryIds}
          />
        )}

        {type !== "transfer" && <ContactPicker selected={contact} onSelect={setContact} />}

        <AppButton
          title={initial ? t("accounts.saveChanges") : t("templates.createTemplate")}
          onPress={handleSubmit}
          disabled={!isValid}
        />

        {/* Account pickers */}
        <PickerModal
          visible={showAccountPicker}
          title={t("transactionForm.account")}
          items={accounts}
          keyExtractor={(item) => item.id.toString()}
          selectedKey={accountId?.toString()}
          onSelect={(item) => setAccountId(item.id)}
          onClose={() => setShowAccountPicker(false)}
          renderItem={(item, isSelected) => (
            <>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: item.color + "20",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <AppIcon name={item.icon} size={20} color={item.color} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="body">{item.name}</AppText>
                {item.institution ? (
                  <AppText variant="caption" color={colors.textSecondary}>
                    {item.institution}
                  </AppText>
                ) : null}
              </View>
              {isSelected && <AppIcon name="check" size={20} color={colors.primary} />}
            </>
          )}
        />
        <PickerModal
          visible={showToAccountPicker}
          title={t("transactionForm.toAccount")}
          items={accounts.filter((a) => a.id !== accountId)}
          keyExtractor={(item) => item.id.toString()}
          selectedKey={toAccountId?.toString()}
          onSelect={(item) => setToAccountId(item.id)}
          onClose={() => setShowToAccountPicker(false)}
          renderItem={(item, isSelected) => (
            <>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: item.color + "20",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <AppIcon name={item.icon} size={20} color={item.color} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="body">{item.name}</AppText>
                {item.institution ? (
                  <AppText variant="caption" color={colors.textSecondary}>
                    {item.institution}
                  </AppText>
                ) : null}
              </View>
              {isSelected && <AppIcon name="check" size={20} color={colors.primary} />}
            </>
          )}
        />
      </ScrollView>
    </ModalLayout>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  container: { gap: spacing.lg, paddingBottom: spacing["2xl"] },
  typeRow: { flexDirection: "row", gap: spacing.sm },
  typeBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1.5,
  },
});
