import { View, Pressable, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/providers/ThemeProvider";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { spacing } from "@/theme/spacing";

type ModalLayoutProps = {
  title: string;
  children: React.ReactNode;
  onClose?: () => void;
};

export function ModalLayout({ title, children, onClose }: ModalLayoutProps) {
  const { colors } = useTheme();

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={["top"]}
    >
      <View style={styles.header}>
        <AppText variant="h3" style={styles.title}>
          {title}
        </AppText>
        {onClose && (
          <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
            <AppIcon name="close" size={24} color={colors.icon} />
          </Pressable>
        )}
      </View>
      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}
      >
        {children}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: {
    flex: 1,
  },
  closeBtn: {
    padding: spacing.xs,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
});
