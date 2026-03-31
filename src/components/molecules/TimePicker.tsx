import { useState } from "react";
import { View, Pressable, StyleSheet, Platform } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { useTheme } from "@/providers/ThemeProvider";
import { formatTime } from "@/utils/format";
import { spacing } from "@/theme/spacing";

type TimePickerProps = {
  label?: string;
  value: string; // HH:mm
  onChange: (time: string) => void;
};

export function TimePicker({ label, value, onChange }: TimePickerProps) {
  const { colors } = useTheme();
  const [show, setShow] = useState(false);

  const [hours, minutes] = value.split(":").map(Number);
  const dateObj = new Date();
  dateObj.setHours(hours, minutes, 0, 0);

  const handleChange = (_: unknown, selectedDate?: Date) => {
    if (Platform.OS === "android") setShow(false);
    if (selectedDate) {
      const h = String(selectedDate.getHours()).padStart(2, "0");
      const m = String(selectedDate.getMinutes()).padStart(2, "0");
      onChange(`${h}:${m}`);
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
        <AppIcon name="clock-outline" size={20} color={colors.iconSecondary} />
        <AppText variant="body">{formatTime(value)}</AppText>
      </Pressable>
      {show && (
        <DateTimePicker
          value={dateObj}
          mode="time"
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
