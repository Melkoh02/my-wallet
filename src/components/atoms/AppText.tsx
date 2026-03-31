import { Text, type TextProps, type TextStyle } from "react-native";
import { useTheme } from "@/providers/ThemeProvider";
import { typography, type TypographyVariant } from "@/theme/typography";

type AppTextProps = TextProps & {
  variant?: TypographyVariant;
  color?: string;
};

export function AppText({ variant = "body", color, style, ...props }: AppTextProps) {
  const { colors } = useTheme();

  return (
    <Text
      style={[typography[variant], { color: color ?? colors.text }, style as TextStyle]}
      {...props}
    />
  );
}
