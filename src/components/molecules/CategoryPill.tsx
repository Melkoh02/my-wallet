import { View, StyleSheet } from "react-native";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { spacing } from "@/theme/spacing";

type CategoryPillProps = {
  name: string;
  icon: string;
  color: string;
};

export function CategoryPill({ name, icon, color }: CategoryPillProps) {
  return (
    <View style={[styles.container, { backgroundColor: color + "18" }]}>
      <AppIcon name={icon} size={14} color={color} />
      <AppText variant="caption" color={color}>
        {name}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: 12,
  },
});
