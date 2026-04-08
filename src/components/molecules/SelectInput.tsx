import { View, Pressable, StyleSheet, type ViewStyle } from "react-native";
import { useTheme } from "@/providers/ThemeProvider";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { spacing } from "@/theme/spacing";

type SelectInputProps = {
  label?: string;
  value?: React.ReactNode;
  placeholder?: string;
  onPress: () => void;
  style?: ViewStyle;
};

export function SelectInput({ label, value, placeholder, onPress, style }: SelectInputProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.container,
        { borderColor: colors.border, backgroundColor: colors.surface },
        style,
      ]}
    >
      {label && (
        <AppText variant="label" color={colors.textSecondary} style={styles.label}>
          {label}
        </AppText>
      )}
      <View style={styles.valueRow}>
        {value ? (
          typeof value === "string" ? (
            <AppText variant="body">{value}</AppText>
          ) : (
            value
          )
        ) : (
          <AppText variant="body" color={colors.placeholder}>
            {placeholder ?? ""}
          </AppText>
        )}
        <AppIcon name="chevron-down" size={18} color={colors.iconSecondary} />
      </View>
    </Pressable>
  );
}

// Styles matching the existing selectInput pattern from TransactionForm/AccountForm
const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  label: {
    marginBottom: 2,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 32,
  },
});
