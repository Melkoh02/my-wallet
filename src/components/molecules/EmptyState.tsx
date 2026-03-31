import { View, StyleSheet } from "react-native";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { useTheme } from "@/providers/ThemeProvider";
import { spacing } from "@/theme/spacing";

type EmptyStateProps = {
  icon: string;
  title: string;
  description?: string;
};

export function EmptyState({ icon, title, description }: EmptyStateProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <AppIcon name={icon} size={48} color={colors.iconSecondary} />
      <AppText variant="h3" color={colors.textSecondary} style={styles.title}>
        {title}
      </AppText>
      {description && (
        <AppText variant="bodySmall" color={colors.textTertiary} style={styles.description}>
          {description}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing["3xl"],
    gap: spacing.sm,
  },
  title: {
    textAlign: "center",
    marginTop: spacing.sm,
  },
  description: {
    textAlign: "center",
  },
});
