import type { ColorPalette } from "./colors";
import { spacing } from "./spacing";
import { typography } from "./typography";

export type ThemeTokens = {
  colors: ColorPalette;
  spacing: typeof spacing;
  typography: typeof typography;
  isDark: boolean;
  statusBarStyle: "light" | "dark" | "auto";
};

export function createThemeTokens(
  colors: ColorPalette,
  isDark: boolean,
  statusBarStyle: "light" | "dark" | "auto" = "auto",
): ThemeTokens {
  return {
    colors,
    spacing,
    typography,
    isDark,
    statusBarStyle,
  };
}
