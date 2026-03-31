import { View, StyleSheet } from "react-native";
import { ScreenLayout } from "@/components/templates/ScreenLayout";
import { HeaderBar } from "@/components/templates/HeaderBar";
import { AppText } from "@/components/atoms/AppText";
import { useTheme } from "@/providers/ThemeProvider";
import { spacing } from "@/theme/spacing";

export default function HomeScreen() {
  const { colors } = useTheme();

  return (
    <ScreenLayout scrollable edges={["top"]}>
      <HeaderBar
        title="My Wallet"
        rightIcon="cog"
        onRightPress={() => {
          // TODO: navigate to settings
        }}
      />
      <View style={styles.content}>
        <AppText variant="bodySmall" color={colors.textSecondary}>
          Dashboard coming soon
        </AppText>
      </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
});
