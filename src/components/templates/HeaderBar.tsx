import { View, Pressable, StyleSheet } from "react-native";
import { useTheme } from "@/providers/ThemeProvider";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { spacing } from "@/theme/spacing";

type HeaderBarProps = {
  title: string;
  onBack?: () => void;
  rightIcon?: string;
  onRightPress?: () => void;
};

export function HeaderBar({ title, onBack, rightIcon, onRightPress }: HeaderBarProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.left}>
        {onBack && (
          <Pressable onPress={onBack} hitSlop={8} style={styles.iconButton}>
            <AppIcon name="arrow-left" size={24} color={colors.text} />
          </Pressable>
        )}
      </View>
      <AppText variant="h3" style={styles.title}>
        {title}
      </AppText>
      <View style={styles.right}>
        {rightIcon && onRightPress && (
          <Pressable onPress={onRightPress} hitSlop={8} style={styles.iconButton}>
            <AppIcon name={rightIcon} size={24} color={colors.text} />
          </Pressable>
        )}
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
    width: 40,
    alignItems: "flex-end",
  },
  iconButton: {
    padding: spacing.xs,
  },
});
