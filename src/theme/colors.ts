export type ColorPalette = {
  // Base
  background: string;
  surface: string;
  surfaceElevated: string;
  card: string;
  // Text
  text: string;
  textSecondary: string;
  textTertiary: string;
  textInverse: string;
  // Primary (overridden by accent color)
  primary: string;
  primaryLight: string;
  // Semantic
  income: string;
  expense: string;
  transfer: string;
  // Status
  success: string;
  warning: string;
  danger: string;
  info: string;
  // UI
  border: string;
  borderLight: string;
  icon: string;
  iconSecondary: string;
  placeholder: string;
  // Tab bar
  tabBar: string;
  tabBarBorder: string;
  tabActive: string;
  tabInactive: string;
};

export const lightPalette: ColorPalette = {
  background: "#F8F9FA",
  surface: "#FFFFFF",
  surfaceElevated: "#FFFFFF",
  card: "#FFFFFF",
  text: "#1A1A1A",
  textSecondary: "#6B7280",
  textTertiary: "#9CA3AF",
  textInverse: "#FFFFFF",
  primary: "#3B82F6",
  primaryLight: "rgba(59, 130, 246, 0.12)",
  income: "#10B981",
  expense: "#EF4444",
  transfer: "#8B5CF6",
  success: "#10B981",
  warning: "#F59E0B",
  danger: "#EF4444",
  info: "#3B82F6",
  border: "#E5E7EB",
  borderLight: "#F3F4F6",
  icon: "#6B7280",
  iconSecondary: "#9CA3AF",
  placeholder: "#9CA3AF",
  tabBar: "#FFFFFF",
  tabBarBorder: "#E5E7EB",
  tabActive: "#3B82F6",
  tabInactive: "#9CA3AF",
};

export const darkPalette: ColorPalette = {
  background: "#0F0F0F",
  surface: "#1A1A1A",
  surfaceElevated: "#252525",
  card: "#1A1A1A",
  text: "#F9FAFB",
  textSecondary: "#9CA3AF",
  textTertiary: "#6B7280",
  textInverse: "#1A1A1A",
  primary: "#60A5FA",
  primaryLight: "rgba(96, 165, 250, 0.15)",
  income: "#34D399",
  expense: "#F87171",
  transfer: "#A78BFA",
  success: "#34D399",
  warning: "#FBBF24",
  danger: "#F87171",
  info: "#60A5FA",
  border: "#2D2D2D",
  borderLight: "#252525",
  icon: "#9CA3AF",
  iconSecondary: "#6B7280",
  placeholder: "#6B7280",
  tabBar: "#1A1A1A",
  tabBarBorder: "#2D2D2D",
  tabActive: "#60A5FA",
  tabInactive: "#6B7280",
};

export function applyAccentColor(palette: ColorPalette, accent: string): ColorPalette {
  return {
    ...palette,
    primary: accent,
    primaryLight: accent + "1F", // ~12% opacity hex suffix
    tabActive: accent,
  };
}
