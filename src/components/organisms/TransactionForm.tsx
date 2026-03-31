import { useState } from "react";
import { View, ScrollView, StyleSheet, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { AppInput } from "@/components/atoms/AppInput";
import { AppButton } from "@/components/atoms/AppButton";
import { AppText } from "@/components/atoms/AppText";
import { Chip } from "@/components/atoms/Chip";
import { DatePicker } from "@/components/molecules/DatePicker";
import { TimePicker } from "@/components/molecules/TimePicker";
import { CategoryPicker } from "@/components/organisms/CategoryPicker";
import { ContactPicker } from "@/components/organisms/ContactPicker";
import { useTheme } from "@/providers/ThemeProvider";
import { spacing } from "@/theme/spacing";
import { todayDateString, nowTimeString } from "@/utils/format";
import { getCurrentLocation } from "@/services/location.service";
import type { Account, NewTransaction } from "@/db/schema";
import type { CategoryWithSubs } from "@/db/queries/categories";
import type { TransactionType } from "@/types";

type TransactionFormProps = {
  accounts: Account[];
  categories: CategoryWithSubs[];
  onSubmit: (data: NewTransaction, subcategoryIds: number[]) => void;
  initialType?: TransactionType;
  locationEnabled?: boolean;
};

export function TransactionForm({
  accounts,
  categories,
  onSubmit,
  initialType = "expense",
  locationEnabled = false,
}: TransactionFormProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [type, setType] = useState<TransactionType>(initialType);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [accountId, setAccountId] = useState<number | null>(accounts[0]?.id ?? null);
  const [toAccountId, setToAccountId] = useState<number | null>(null);
  const [date, setDate] = useState(todayDateString());
  const [time, setTime] = useState(nowTimeString());
  const [subcategoryIds, setSubcategoryIds] = useState<number[]>([]);
  const [notes, setNotes] = useState("");
  const [contact, setContact] = useState<{ id: string; name: string } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [location, setLocation] = useState<{
    latitude: number;
    longitude: number;
    name?: string;
  } | null>(null);

  const filteredCategories = categories;

  const handleAddLocation = async () => {
    setLocationLoading(true);
    const loc = await getCurrentLocation();
    setLocation(loc);
    setLocationLoading(false);
  };

  const handleSubmit = () => {
    const parsed = parseFloat(amount);
    if (!parsed || !accountId) return;

    onSubmit(
      {
        type,
        amount: parsed,
        description: description.trim(),
        accountId,
        toAccountId: type === "transfer" ? toAccountId : null,
        date,
        time,
        notes: notes.trim() || null,
        contactId: contact?.id ?? null,
        contactName: contact?.name ?? null,
        latitude: location?.latitude ?? null,
        longitude: location?.longitude ?? null,
        locationName: location?.name ?? null,
      },
      subcategoryIds,
    );
  };

  const isValid =
    parseFloat(amount) > 0 && accountId !== null && (type !== "transfer" || toAccountId !== null);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
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
                {tp === "expense"
                  ? t("transactionForm.expense")
                  : tp === "income"
                    ? t("transactionForm.income")
                    : t("transactionForm.transfer")}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <AppInput
        label={t("transactionForm.amount")}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        placeholder="0.00"
      />

      <AppInput
        label={t("transactionForm.description")}
        value={description}
        onChangeText={setDescription}
        placeholder={t("transactionForm.descriptionPlaceholder")}
      />

      {/* Account selector */}
      <View style={styles.section}>
        <AppText variant="label" color={colors.textSecondary}>
          {type === "transfer" ? t("transactionForm.fromAccount") : t("transactionForm.account")}
        </AppText>
        <View style={styles.chipRow}>
          {accounts.map((acc) => (
            <Chip
              key={acc.id}
              label={acc.name}
              selected={accountId === acc.id}
              onPress={() => setAccountId(acc.id)}
            />
          ))}
        </View>
      </View>

      {type === "transfer" && (
        <View style={styles.section}>
          <AppText variant="label" color={colors.textSecondary}>
            {t("transactionForm.toAccount")}
          </AppText>
          <View style={styles.chipRow}>
            {accounts
              .filter((a) => a.id !== accountId)
              .map((acc) => (
                <Chip
                  key={acc.id}
                  label={acc.name}
                  selected={toAccountId === acc.id}
                  onPress={() => setToAccountId(acc.id)}
                />
              ))}
          </View>
        </View>
      )}

      {type !== "transfer" && (
        <CategoryPicker
          categories={filteredCategories}
          selected={subcategoryIds}
          onSelectionChange={setSubcategoryIds}
        />
      )}

      {/* Contact - only for income/expense */}
      {type !== "transfer" && <ContactPicker selected={contact} onSelect={setContact} />}

      {/* Date & Time */}
      <View style={styles.row}>
        <View style={styles.halfInput}>
          <DatePicker label={t("transactionForm.date")} value={date} onChange={setDate} />
        </View>
        <View style={styles.halfInput}>
          <TimePicker label={t("transactionForm.time")} value={time} onChange={setTime} />
        </View>
      </View>

      {/* Location stamp */}
      {locationEnabled && (
        <View style={styles.section}>
          {location ? (
            <View style={styles.locationRow}>
              <AppText variant="bodySmall" color={colors.textSecondary} style={styles.locationText}>
                📍{" "}
                {location.name ||
                  `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`}
              </AppText>
              <Pressable onPress={() => setLocation(null)}>
                <AppText variant="caption" color={colors.danger}>
                  {t("common.remove")}
                </AppText>
              </Pressable>
            </View>
          ) : (
            <AppButton
              title={
                locationLoading
                  ? t("transactionForm.gettingLocation")
                  : t("transactionForm.addLocation")
              }
              variant="ghost"
              icon="map-marker-plus"
              onPress={handleAddLocation}
              disabled={locationLoading}
            />
          )}
        </View>
      )}

      <AppInput
        label={t("transactionForm.notes")}
        value={notes}
        onChangeText={setNotes}
        placeholder={t("transactionForm.notesPlaceholder")}
        multiline
        numberOfLines={3}
      />

      <AppButton
        title={t("transactionForm.saveTransaction")}
        onPress={handleSubmit}
        disabled={!isValid}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  container: { gap: spacing.lg, paddingBottom: spacing["5xl"] },
  typeRow: { flexDirection: "row", gap: spacing.sm },
  typeBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1.5,
  },
  section: { gap: spacing.sm },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  row: { flexDirection: "row", gap: spacing.md },
  halfInput: { flex: 1 },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  locationText: { flex: 1 },
});
