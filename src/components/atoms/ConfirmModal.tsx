import { Modal, Pressable, View, StyleSheet } from "react-native";
import { useTheme } from "@/providers/ThemeProvider";
import { AppText } from "./AppText";
import { AppButton } from "./AppButton";
import { spacing } from "@/theme/spacing";

type ConfirmModalProps = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
  onConfirm: () => void;
  onCancel?: () => void;
};

export function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const { colors } = useTheme();
  const dismiss = onCancel ?? onConfirm;
  const showCancel = !!onCancel;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss}>
      <Pressable style={styles.backdrop} onPress={dismiss}>
        <Pressable
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.content}>
            <AppText variant="h3">{title}</AppText>
            <AppText variant="body" color={colors.textSecondary}>
              {message}
            </AppText>
          </View>
          <View style={styles.actions}>
            {showCancel && (
              <AppButton
                title={cancelLabel}
                variant="ghost"
                onPress={onCancel!}
                style={styles.btn}
              />
            )}
            <AppButton
              title={confirmLabel}
              variant={showCancel ? variant : "primary"}
              onPress={onConfirm}
              style={styles.btn}
            />
          </View>
        </Pressable>
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
    padding: spacing["3xl"],
  },
  card: {
    width: "100%",
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  content: {
    padding: spacing["2xl"],
    gap: spacing.sm,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  btn: {
    paddingHorizontal: spacing.lg,
  },
});
