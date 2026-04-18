import { Modal, Pressable, View, ScrollView, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/providers/ThemeProvider";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { spacing } from "@/theme/spacing";

type HelpModalProps = {
  visible: boolean;
  title: string;
  helpKey: string;
  onClose: () => void;
};

const SECTIONS = ["overview", "howTo", "tips"] as const;

export function HelpModal({ visible, title, helpKey, onClose }: HelpModalProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

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
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            {SECTIONS.map((section) => (
              <View key={section} style={styles.section}>
                <AppText variant="label" color={colors.primary} style={styles.sectionHeading}>
                  {t(`help.sections.${section}`)}
                </AppText>
                <AppText variant="body" color={colors.textSecondary} style={styles.sectionBody}>
                  {t(`help.${helpKey}.${section}`)}
                </AppText>
              </View>
            ))}
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
    maxHeight: "80%",
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  title: {
    flex: 1,
  },
  body: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  bodyContent: {
    paddingBottom: spacing.xl,
    gap: spacing.xl,
  },
  section: {
    gap: spacing.sm,
  },
  sectionHeading: {
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  sectionBody: {
    lineHeight: 24,
  },
});
