import "@/i18n";
import { StatusBar } from "expo-status-bar";
import { Stack } from "expo-router";
import { DatabaseProvider, useDatabase } from "@/providers/DatabaseProvider";
import { ThemeProvider, useTheme } from "@/providers/ThemeProvider";
import { DataRefreshProvider } from "@/providers/DataRefreshProvider";
import { PrivacyProvider } from "@/providers/PrivacyProvider";
import { BackupSetupModal } from "@/components/organisms/BackupSetupModal";

function AppStatusBar() {
  const { statusBarStyle, isDark } = useTheme();
  const resolvedStyle = statusBarStyle === "auto" ? (isDark ? "light" : "dark") : statusBarStyle;

  return <StatusBar style={resolvedStyle} />;
}

function AppStack() {
  const { colors } = useTheme();
  const { needsBackupSetup, dismissBackupSetup } = useDatabase();

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
        <Stack.Screen name="contact/index" />
        <Stack.Screen name="contact/[id]" />
        <Stack.Screen name="transaction/form" options={{ presentation: "modal" }} />
        <Stack.Screen name="transaction/[id]" />
        <Stack.Screen name="category/form" options={{ presentation: "modal" }} />
        <Stack.Screen name="category/[id]" />
        <Stack.Screen name="recurring/index" />
        <Stack.Screen name="recurring/form" options={{ presentation: "modal" }} />
        <Stack.Screen name="settings/index" />
        <Stack.Screen name="settings/themes" />
        <Stack.Screen name="settings/backup" />
        <Stack.Screen name="settings/security" />
      </Stack>
      <AppStatusBar />
      <BackupSetupModal visible={needsBackupSetup} onComplete={dismissBackupSetup} />
    </>
  );
}

export default function RootLayout() {
  // invariant: provider order is load-bearing. DatabaseProvider wraps Theme/Privacy (both read
  // DB on mount); BackupSetupModal must live inside AppStack to access useTheme().
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
