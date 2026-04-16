import { View, Pressable, StyleSheet } from "react-native";
import { useTheme } from "@/providers/ThemeProvider";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { spacing } from "@/theme/spacing";

type HeaderAction = {
  icon: string;
  onPress: () => void;
};

type HeaderBarProps = {
  title: string;
  onBack?: () => void;
  leftIcon?: string;
  onLeftPress?: () => void;
  rightIcon?: string;
  onRightPress?: () => void;
  rightActions?: HeaderAction[];
};

export function HeaderBar({
  title,
  onBack,
  leftIcon,
  onLeftPress,
  rightIcon,
  onRightPress,
  rightActions,
}: HeaderBarProps) {
  const { colors } = useTheme();

  const actions =
    rightActions ?? (rightIcon && onRightPress ? [{ icon: rightIcon, onPress: onRightPress }] : []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.left}>
        {onBack && (
          <Pressable onPress={onBack} hitSlop={8} style={styles.iconButton}>
            <AppIcon name="arrow-left" size={24} color={colors.text} />
          </Pressable>
        )}
        {!onBack && leftIcon && onLeftPress && (
          <Pressable onPress={onLeftPress} hitSlop={8} style={styles.iconButton}>
            <AppIcon name={leftIcon} size={24} color={colors.text} />
          </Pressable>
        )}
      </View>
      <AppText variant="h3" style={styles.title}>
        {title}
      </AppText>
      <View style={styles.right}>
        {actions.map((action) => (
          <Pressable
            key={action.icon}
            onPress={action.onPress}
            hitSlop={8}
            style={styles.iconButton}
          >
            <AppIcon name={action.icon} size={24} color={colors.text} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 48,
  },
  left: {
    width: 40,
  },
  title: {
    flex: 1,
    textAlign: "center",
  },
  right: {
    flexDirection: "row",
    gap: spacing.sm,
    minWidth: 40,
    justifyContent: "flex-end",
  },
  iconButton: {
    padding: spacing.xs,
  },
});
