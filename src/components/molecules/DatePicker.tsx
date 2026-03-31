import { useState } from "react";
import { View, Pressable, StyleSheet, Platform } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { useTheme } from "@/providers/ThemeProvider";
import { formatDate } from "@/utils/format";
import { spacing } from "@/theme/spacing";

type DatePickerProps = {
  label?: string;
  value: string; // YYYY-MM-DD
  onChange: (date: string) => void;
};

export function DatePicker({ label, value, onChange }: DatePickerProps) {
  const { colors } = useTheme();
  const [show, setShow] = useState(false);

  const dateObj = new Date(value + "T00:00:00");

  const handleChange = (_: unknown, selectedDate?: Date) => {
    if (Platform.OS === "android") setShow(false);
    if (selectedDate) {
      onChange(selectedDate.toISOString().slice(0, 10));
    }
  };

  return (
    <View style={styles.container}>
      {label && (
        <AppText variant="label" color={colors.textSecondary}>
          {label}
        </AppText>
      )}
      <Pressable
        onPress={() => setShow(true)}
        style={[styles.trigger, { borderColor: colors.border, backgroundColor: colors.surface }]}
      >
        <AppIcon name="calendar" size={20} color={colors.iconSecondary} />
        <AppText variant="body">{formatDate(value)}</AppText>
      </Pressable>
      {show && (
        <DateTimePicker
          value={dateObj}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={handleChange}
        />
      )}
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
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 48,
  },
});
