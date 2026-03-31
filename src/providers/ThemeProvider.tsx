import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import { lightPalette, darkPalette, applyAccentColor, type ColorPalette } from "@/theme/colors";
import { createThemeTokens, type ThemeTokens } from "@/theme/tokens";
import { db } from "@/db/client";
import { themes, settings } from "@/db/schema";
import { eq } from "drizzle-orm";

type ThemeContextValue = ThemeTokens & {
  setThemeId: (id: number | null) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [activeTheme, setActiveTheme] = useState<{
    mode: string;
    accentColor: string;
    statusBarStyle: string;
  } | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Load active theme on mount
  useEffect(() => {
    (async () => {
      const [setting] = await db.select().from(settings).where(eq(settings.key, "active_theme_id"));

      if (setting?.value) {
        const id = parseInt(setting.value, 10);
        if (!isNaN(id)) {
          const [theme] = await db.select().from(themes).where(eq(themes.id, id));
          if (theme) {
            setActiveTheme({
              mode: theme.mode,
              accentColor: theme.accentColor,
              statusBarStyle: theme.statusBarStyle,
            });
          }
        }
      }
      setLoaded(true);
    })();
  }, []);

  const setThemeId = useCallback(async (id: number | null) => {
    // Deactivate all themes
    await db.update(themes).set({ isActive: false });

    if (id !== null) {
      await db.update(themes).set({ isActive: true }).where(eq(themes.id, id));
      const [theme] = await db.select().from(themes).where(eq(themes.id, id));
      if (theme) {
        setActiveTheme({
          mode: theme.mode,
          accentColor: theme.accentColor,
          statusBarStyle: theme.statusBarStyle,
        });
      }
    } else {
      setActiveTheme(null);
    }

    await db
      .insert(settings)
      .values({ key: "active_theme_id", value: id?.toString() ?? "" })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: id?.toString() ?? "" },
      });
  }, []);

  const tokens = useMemo<ThemeTokens>(() => {
    let isDark: boolean;
    let palette: ColorPalette;
    let statusBarStyle: "light" | "dark" | "auto" = "auto";

    if (activeTheme) {
      isDark = activeTheme.mode === "dark";
      palette = isDark ? { ...darkPalette } : { ...lightPalette };
      palette = applyAccentColor(palette, activeTheme.accentColor);
      statusBarStyle = activeTheme.statusBarStyle as "light" | "dark" | "auto";
    } else {
      isDark = systemScheme === "dark";
      palette = isDark ? darkPalette : lightPalette;
    }

    return createThemeTokens(palette, isDark, statusBarStyle);
  }, [activeTheme, systemScheme]);

  const value = useMemo<ThemeContextValue>(() => ({ ...tokens, setThemeId }), [tokens, setThemeId]);

  if (!loaded) return null;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
