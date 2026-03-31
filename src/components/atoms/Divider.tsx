import { View, type ViewStyle } from "react-native";
import { useTheme } from "@/providers/ThemeProvider";

type DividerProps = {
  style?: ViewStyle;
};

export function Divider({ style }: DividerProps) {
  const { colors } = useTheme();

  return <View style={[{ height: 1, backgroundColor: colors.borderLight }, style]} />;
}
