import "@/i18n";
import { StatusBar } from "expo-status-bar";
import { Stack } from "expo-router";
import { DatabaseProvider } from "@/providers/DatabaseProvider";
import { ThemeProvider, useTheme } from "@/providers/ThemeProvider";
import { DataRefreshProvider } from "@/providers/DataRefreshProvider";
import { PrivacyProvider } from "@/providers/PrivacyProvider";

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
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="account/form" options={{ presentation: "modal" }} />
        <Stack.Screen name="account/[id]" />
        <Stack.Screen name="transaction/form" options={{ presentation: "modal" }} />
        <Stack.Screen name="transaction/[id]" />
        <Stack.Screen name="category/form" options={{ presentation: "modal" }} />
        <Stack.Screen name="category/[id]" />
        <Stack.Screen name="recurring/index" />
        <Stack.Screen name="recurring/form" options={{ presentation: "modal" }} />
        <Stack.Screen name="settings/index" />
        <Stack.Screen name="settings/themes" />
        <Stack.Screen name="settings/backup" />
      </Stack>
      <AppStatusBar />
    </>
  );
}

export default function RootLayout() {
  return (
    <DatabaseProvider>
      <DataRefreshProvider>
        <ThemeProvider>
          <PrivacyProvider>
            <AppStack />
          </PrivacyProvider>
        </ThemeProvider>
      </DataRefreshProvider>
    </DatabaseProvider>
  );
}
