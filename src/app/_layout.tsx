import { StatusBar } from "expo-status-bar";
import { Stack } from "expo-router";
import { DatabaseProvider } from "@/providers/DatabaseProvider";
import { ThemeProvider, useTheme } from "@/providers/ThemeProvider";
import { DataRefreshProvider } from "@/providers/DataRefreshProvider";

function AppStatusBar() {
  const { statusBarStyle, isDark } = useTheme();
  const resolvedStyle = statusBarStyle === "auto" ? (isDark ? "light" : "dark") : statusBarStyle;

  return <StatusBar style={resolvedStyle} />;
}

function AppStack() {
  const { colors } = useTheme();

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
      <AppStatusBar />
    </>
  );
}

export default function RootLayout() {
  return (
    <DatabaseProvider>
      <DataRefreshProvider>
        <ThemeProvider>
          <AppStack />
        </ThemeProvider>
      </DataRefreshProvider>
    </DatabaseProvider>
  );
}
