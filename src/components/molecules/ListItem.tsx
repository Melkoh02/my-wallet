import { Pressable, View, StyleSheet } from "react-native";
import { useTheme } from "@/providers/ThemeProvider";
import { spacing } from "@/theme/spacing";

type ListItemProps = {
  onPress?: () => void;
  left?: React.ReactNode;
  children: React.ReactNode;
  right?: React.ReactNode;
};

export function ListItem({ onPress, left, children, right }: ListItemProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        { backgroundColor: pressed && onPress ? colors.borderLight : "transparent" },
      ]}
    >
      {left && <View style={styles.left}>{left}</View>}
      <View style={styles.content}>{children}</View>
      {right && <View style={styles.right}>{right}</View>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 56,
  },
  left: {
    marginRight: spacing.md,
  },
  content: {
    flex: 1,
  },
  right: {
    marginLeft: spacing.md,
  },
});
