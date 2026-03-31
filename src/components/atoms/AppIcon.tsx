import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useTheme } from "@/providers/ThemeProvider";

type AppIconProps = {
  name: string;
  size?: number;
  color?: string;
};

export function AppIcon({ name, size = 24, color }: AppIconProps) {
  const { colors } = useTheme();

  return (
    <MaterialCommunityIcons
      name={name as keyof typeof MaterialCommunityIcons.glyphMap}
      size={size}
      color={color ?? colors.icon}
    />
  );
}
