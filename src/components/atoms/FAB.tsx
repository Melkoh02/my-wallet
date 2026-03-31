import { Pressable, StyleSheet } from "react-native";
import { useTheme } from "@/providers/ThemeProvider";
import { AppIcon } from "./AppIcon";

type FABProps = {
  icon?: string;
  onPress: () => void;
};

export function FAB({ icon = "plus", onPress }: FABProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: colors.primary,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <AppIcon name={icon} size={26} color={colors.textInverse} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});
