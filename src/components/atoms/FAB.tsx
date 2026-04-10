import { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet, PanResponder } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import Animated, {
  type SharedValue,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Easing,
} from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/providers/ThemeProvider";
import { AppIcon } from "./AppIcon";
import { AppText } from "./AppText";

type FABAction = {
  key: string;
  labelKey: string;
  icon: string;
  color: string;
};

type FABProps = {
  onPress?: () => void;
  actions?: FABAction[];
  onAction?: (key: string) => void;
  icon?: string;
};

const ITEM_HEIGHT = 52;
const ITEM_GAP = 10;
const ITEM_WIDTH = 150;
const FAB_SIZE = 56;
const DRAG_THRESHOLD = 10;
const ANIM_DURATION = 160;
const ANIM_EASING = Easing.out(Easing.cubic);

export function FAB({ onPress, actions, onAction, icon = "plus" }: FABProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const isFocused = useIsFocused();
  const expanded = useSharedValue(0);
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState(-1);
  const fabRef = useRef<View>(null);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const isOpenRef = useRef(false);
  const wasOpenOnGrant = useRef(false);
  const lastHoveredIndex = useRef(-1);
  const fabTopPageY = useRef(0);

  const isSpeedDial = actions && actions.length > 0;

  // Close speed dial when navigating away
  useEffect(() => {
    if (!isFocused && isOpenRef.current) {
      expanded.value = withTiming(0, { duration: 0 });
      setIsOpen(false);
      setHoveredIndex(-1);
      lastHoveredIndex.current = -1;
      isOpenRef.current = false;
    }
  }, [isFocused, expanded]);

  const open = useCallback(() => {
    setIsOpen(true);
    isOpenRef.current = true;
    expanded.value = withTiming(1, { duration: ANIM_DURATION, easing: ANIM_EASING });
  }, [expanded]);

  const close = useCallback(() => {
    expanded.value = withTiming(0, { duration: 120 });
    setHoveredIndex(-1);
    lastHoveredIndex.current = -1;
    isOpenRef.current = false;
    setTimeout(() => setIsOpen(false), 120);
  }, [expanded]);

  // Hit test with clamping: if finger is above all items, clamp to topmost;
  // if between FAB and bottom item, clamp to bottom item
  const getActionIndexAtPosition = useCallback(
    (pageY: number) => {
      if (!actions || actions.length === 0) return -1;
      const fabTop = fabTopPageY.current;
      if (fabTop === 0) return -1;

      const count = actions.length;
      const topItemTop = fabTop - count * (ITEM_HEIGHT + ITEM_GAP);
      const bottomItemBottom = fabTop - ITEM_GAP;

      // Above all items → clamp to topmost
      if (pageY < topItemTop) return count - 1;
      // Below all items but above FAB → clamp to bottommost
      if (pageY > bottomItemBottom && pageY < fabTop) return 0;

      for (let i = 0; i < count; i++) {
        const itemTop = fabTop - (i + 1) * (ITEM_HEIGHT + ITEM_GAP);
        const itemBottom = itemTop + ITEM_HEIGHT;
        if (pageY >= itemTop && pageY <= itemBottom) {
          return i;
        }
      }

      // In a gap between items — find the closest
      for (let i = 0; i < count - 1; i++) {
        const thisTop = fabTop - (i + 1) * (ITEM_HEIGHT + ITEM_GAP);
        const nextBottom = fabTop - (i + 2) * (ITEM_HEIGHT + ITEM_GAP) + ITEM_HEIGHT;
        if (pageY >= nextBottom && pageY <= thisTop) {
          const distToThis = thisTop - pageY;
          const distToNext = pageY - nextBottom;
          return distToThis < distToNext ? i : i + 1;
        }
      }

      return -1;
    },
    [actions],
  );

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !!isSpeedDial,
      onMoveShouldSetPanResponder: () => !!isSpeedDial,
      onPanResponderGrant: (evt) => {
        isDragging.current = false;
        lastHoveredIndex.current = -1;
        wasOpenOnGrant.current = isOpenRef.current;
        startY.current = evt.nativeEvent.pageY;
        fabTopPageY.current = evt.nativeEvent.pageY - evt.nativeEvent.locationY;
        if (!isOpenRef.current) {
          open();
        }
      },
      onPanResponderMove: (evt) => {
        const dy = Math.abs(evt.nativeEvent.pageY - startY.current);
        if (dy > DRAG_THRESHOLD) {
          isDragging.current = true;
        }
        if (isDragging.current) {
          const idx = getActionIndexAtPosition(evt.nativeEvent.pageY);
          lastHoveredIndex.current = idx;
          setHoveredIndex(idx);
        }
      },
      onPanResponderRelease: () => {
        if (isDragging.current && lastHoveredIndex.current >= 0 && actions && onAction) {
          onAction(actions[lastHoveredIndex.current].key);
          close();
        } else if (isDragging.current) {
          close();
        } else if (wasOpenOnGrant.current) {
          // Tap on FAB while open → close
          close();
        }
        // If not dragging and wasn't open → menu just opened, stays open for tap-to-select
        isDragging.current = false;
      },
    }),
  ).current;

  const handleTap = () => {
    if (!isSpeedDial) {
      onPress?.();
    }
  };

  const mainIconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(expanded.value, [0, 1], [0, 45])}deg` }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: expanded.value * 0.4,
    pointerEvents: expanded.value > 0 ? ("auto" as const) : ("none" as const),
  }));

  return (
    <>
      {isSpeedDial && <Animated.View style={[styles.backdrop, backdropStyle]} onTouchEnd={close} />}

      {isSpeedDial &&
        isOpen &&
        actions!.map((action, i) => (
          <SpeedDialItem
            key={action.key}
            action={action}
            index={i}
            expanded={expanded}
            hovered={hoveredIndex === i}
            colors={colors}
            label={t(action.labelKey)}
            onPress={() => {
              onAction?.(action.key);
              close();
            }}
          />
        ))}

      <View
        ref={fabRef}
        style={[styles.fab, { backgroundColor: colors.primary }]}
        {...(isSpeedDial ? panResponder.panHandlers : {})}
        onTouchEnd={isSpeedDial ? undefined : handleTap}
      >
        <Animated.View style={mainIconStyle}>
          <AppIcon name={icon} size={26} color={colors.textInverse} />
        </Animated.View>
      </View>
    </>
  );
}

function SpeedDialItem({
  action,
  index,
  expanded,
  hovered,
  colors,
  onPress,
  label,
}: {
  action: FABAction;
  index: number;
  expanded: SharedValue<number>;
  hovered: boolean;
  colors: ReturnType<typeof useTheme>["colors"];
  onPress: () => void;
  label: string;
}) {
  const animStyle = useAnimatedStyle(() => {
    const offset = (index + 1) * (ITEM_HEIGHT + ITEM_GAP);
    return {
      transform: [
        { translateY: interpolate(expanded.value, [0, 1], [offset, 0]) },
        { scale: interpolate(expanded.value, [0, 0.5, 1], [0.8, 0.95, 1]) },
      ],
      opacity: expanded.value,
    };
  });

  return (
    <Animated.View
      style={[
        styles.actionItem,
        {
          bottom: 24 + FAB_SIZE + ITEM_GAP + index * (ITEM_HEIGHT + ITEM_GAP),
          backgroundColor: hovered ? action.color : colors.card,
          borderColor: hovered ? action.color : colors.border,
        },
        animStyle,
      ]}
      onTouchEnd={onPress}
    >
      <AppIcon name={action.icon} size={20} color={hovered ? colors.textInverse : action.color} />
      <AppText
        variant="label"
        color={hovered ? colors.textInverse : colors.text}
        style={styles.actionLabel}
      >
        {label}
      </AppText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
    zIndex: 90,
  },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 20,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    zIndex: 100,
  },
  actionItem: {
    position: "absolute",
    right: 20,
    width: ITEM_WIDTH,
    height: ITEM_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    zIndex: 95,
  },
  actionLabel: {
    marginRight: 4,
  },
});
