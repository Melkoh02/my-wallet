import { useState, useEffect } from "react";
import { View, Modal, Pressable, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { useTheme } from "@/providers/ThemeProvider";
import { spacing } from "@/theme/spacing";
import { PIN_LENGTH } from "@/services/auth.service";

type Mode = "verify" | "setup";

type PinEntryModalProps = {
  visible: boolean;
  mode: Mode;
  title: string;
  /**
   * In `verify` mode, called once with the entered PIN. Returns / resolves to
   * `true` to dismiss the modal, `false` to flash an "incorrect" error and
   * keep the modal open with the input cleared.
   *
   * In `setup` mode, the modal asks the user to enter the PIN twice. This
   * fires once after the second (matching) entry. Mismatches are handled
   * internally — the modal resets to phase 1 with a "PINs don't match" error.
   */
  onSubmit: (pin: string) => Promise<boolean> | boolean;
  onCancel: () => void;
};

export function PinEntryModal({ visible, mode, title, onSubmit, onCancel }: PinEntryModalProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [phase, setPhase] = useState<"first" | "confirm">("first");
  const [firstPin, setFirstPin] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible) {
      setPin("");
      setFirstPin("");
      setPhase("first");
      setError("");
    }
  }, [visible]);

  const append = (digit: string) => {
    if (pin.length >= PIN_LENGTH) return;
    setError("");
    setPin((prev) => prev + digit);
  };

  const remove = () => {
    setPin((prev) => prev.slice(0, -1));
    setError("");
  };

  // Auto-submit when the input reaches PIN_LENGTH digits.
  useEffect(() => {
    if (pin.length !== PIN_LENGTH) return;
    let cancelled = false;
    (async () => {
      if (mode === "setup") {
        if (phase === "first") {
          if (cancelled) return;
          setFirstPin(pin);
          setPin("");
          setPhase("confirm");
        } else {
          if (pin === firstPin) {
            const ok = await Promise.resolve(onSubmit(pin));
            if (cancelled) return;
            if (!ok) {
              setError(t("security.pinPrompt.incorrect"));
              setPin("");
            }
          } else {
            if (cancelled) return;
            setError(t("security.pinPrompt.mismatch"));
            setPhase("first");
            setFirstPin("");
            setPin("");
          }
        }
      } else {
        const ok = await Promise.resolve(onSubmit(pin));
        if (cancelled) return;
        if (!ok) {
          setError(t("security.pinPrompt.incorrect"));
          setPin("");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pin, phase, mode, firstPin, onSubmit, t]);

  const dynamicTitle =
    mode === "setup" && phase === "confirm" ? t("security.pinPrompt.confirmTitle") : title;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <SafeAreaView
          edges={["top", "bottom"]}
          style={[styles.sheet, { backgroundColor: colors.background }]}
        >
          <View style={styles.header}>
            <AppText variant="h3">{dynamicTitle}</AppText>
            <Pressable onPress={onCancel} hitSlop={8}>
              <AppIcon name="close" size={24} color={colors.icon} />
            </Pressable>
          </View>

          <View style={styles.dotsRow}>
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  {
                    borderColor: error ? colors.danger : colors.border,
                    backgroundColor:
                      i < pin.length ? (error ? colors.danger : colors.primary) : "transparent",
                  },
                ]}
              />
            ))}
          </View>

          {error ? (
            <AppText variant="caption" color={colors.danger} style={styles.errorText}>
              {error}
            </AppText>
          ) : null}

          <View style={styles.keypad}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <Pressable
                key={n}
                onPress={() => append(n.toString())}
                style={({ pressed }) => [
                  styles.key,
                  { backgroundColor: pressed ? colors.borderLight : colors.surface },
                ]}
              >
                <AppText variant="h2">{n}</AppText>
              </Pressable>
            ))}
            <View style={styles.key} />
            <Pressable
              onPress={() => append("0")}
              style={({ pressed }) => [
                styles.key,
                { backgroundColor: pressed ? colors.borderLight : colors.surface },
              ]}
            >
              <AppText variant="h2">0</AppText>
            </Pressable>
            <Pressable
              onPress={remove}
              style={({ pressed }) => [
                styles.key,
                { backgroundColor: pressed ? colors.borderLight : "transparent" },
              ]}
            >
              <AppIcon name="backspace-outline" size={24} color={colors.icon} />
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
  },
  sheet: {
    flex: 1,
    padding: spacing.xl,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xl,
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.md,
    marginVertical: spacing.xl,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  errorText: { textAlign: "center" },
  keypad: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  key: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
  },
});
