import { Pressable, StyleSheet, type ViewStyle } from "react-native";
import { useTheme } from "@/providers/ThemeProvider";
import { AppText } from "./AppText";
import { AppIcon } from "./AppIcon";
import { spacing } from "@/theme/spacing";

type AppButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type AppButtonProps = {
  title: string;
  onPress: () => void;
  variant?: AppButtonVariant;
  icon?: string;
  disabled?: boolean;
  style?: ViewStyle;
};

export function AppButton({
  title,
  onPress,
  variant = "primary",
  icon,
  disabled = false,
  style,
}: AppButtonProps) {
  const { colors } = useTheme();

  const variantStyles = {
    primary: {
      bg: disabled ? colors.primaryLight : colors.primary,
      text: disabled ? colors.textSecondary : colors.textInverse,
      border: disabled ? colors.primaryLight : colors.primary,
    },
    secondary: {
      bg: "transparent",
      text: colors.primary,
      border: colors.primary,
    },
    ghost: {
      bg: "transparent",
      text: colors.text,
      border: "transparent",
    },
    danger: {
      bg: colors.danger,
      text: colors.textInverse,
      border: colors.danger,
    },
  }[variant];

  const disabledOpacity = variant === "primary" ? 1 : 0.6;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: variantStyles.bg,
          borderColor: variantStyles.border,
          opacity: disabled ? disabledOpacity : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {icon && <AppIcon name={icon} size={20} color={variantStyles.text} />}
      <AppText variant="button" color={variantStyles.text}>
        {title}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: 12,
    borderWidth: 1.5,
  },
});
