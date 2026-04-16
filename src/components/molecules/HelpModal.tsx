import { Modal, Pressable, View, ScrollView, StyleSheet } from "react-native";
import { useTheme } from "@/providers/ThemeProvider";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { spacing } from "@/theme/spacing";

type HelpModalProps = {
  visible: boolean;
  title: string;
  content: string;
  onClose: () => void;
};

export function HelpModal({ visible, title, content, onClose }: HelpModalProps) {
  const { colors } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.header}>
            <AppIcon name="help-circle-outline" size={24} color={colors.primary} />
            <AppText variant="h3" style={styles.title}>
              {title}
            </AppText>
            <Pressable onPress={onClose} hitSlop={8}>
              <AppIcon name="close" size={22} color={colors.iconSecondary} />
            </Pressable>
          </View>
          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            <AppText variant="body" color={colors.textSecondary} style={styles.content}>
              {content}
            </AppText>
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing["2xl"],
  },
  card: {
    width: "100%",
    maxHeight: "70%",
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: {
    flex: 1,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  content: {
    lineHeight: 22,
    paddingBottom: spacing.lg,
  },
});
