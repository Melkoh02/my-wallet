import { TextInput, View, StyleSheet, type TextInputProps } from "react-native";
import { useTheme } from "@/providers/ThemeProvider";
import { AppText } from "./AppText";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";

type AppInputProps = TextInputProps & {
  label?: string;
  error?: string;
};

export function AppInput({ label, error, style, ...props }: AppInputProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      {label && (
        <AppText variant="label" color={colors.textSecondary}>
          {label}
        </AppText>
      )}
      <TextInput
        placeholderTextColor={colors.placeholder}
        style={[
          styles.input,
          typography.body,
          {
            color: colors.text,
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : colors.border,
          },
          style,
        ]}
        {...props}
      />
      {error && (
        <AppText variant="caption" color={colors.danger}>
          {error}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
});
