import { View, StyleSheet } from "react-native";
import { ScreenLayout } from "@/components/templates/ScreenLayout";
import { HeaderBar } from "@/components/templates/HeaderBar";
import { AppText } from "@/components/atoms/AppText";
import { useTheme } from "@/providers/ThemeProvider";
import { spacing } from "@/theme/spacing";

export default function CategoriesScreen() {
  const { colors } = useTheme();

  return (
    <ScreenLayout edges={["top"]}>
      <HeaderBar title="Categories" rightIcon="plus" onRightPress={() => {}} />
      <View style={styles.content}>
        <AppText variant="bodySmall" color={colors.textSecondary}>
          Category list coming soon
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
