import { useCallback, useRef, useState } from "react";
import { View, StyleSheet, PanResponder } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Easing,
} from "react-native-reanimated";
import { useTheme } from "@/providers/ThemeProvider";
import { AppIcon } from "./AppIcon";
import { AppText } from "./AppText";

type FABAction = {
  key: string;
  label: string;
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
const FAB_SIZE = 56;
const DRAG_THRESHOLD = 10;
const ANIM_DURATION = 160;
const ANIM_EASING = Easing.out(Easing.cubic);

export function FAB({ onPress, actions, onAction, icon = "plus" }: FABProps) {
  const { colors } = useTheme();
  const expanded = useSharedValue(0);
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState(-1);
  const fabRef = useRef<View>(null);
  const fabLayout = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const isDragging = useRef(false);
  const startY = useRef(0);
  const isOpenRef = useRef(false);
  const lastHoveredIndex = useRef(-1);

  const isSpeedDial = actions && actions.length > 0;

  // Measure on layout so it's always ready — no async delay during gestures
  const handleLayout = useCallback(() => {
    fabRef.current?.measureInWindow((x, y, width, height) => {
      fabLayout.current = { x, y, width, height };
    });
  }, []);

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

  // Hit test using pre-measured layout — no async needed
  const getActionIndexAtPosition = useCallback(
    (pageY: number) => {
      if (!actions) return -1;
      const fabTop = fabLayout.current.y;
      if (fabTop === 0) return -1; // Not measured yet

      for (let i = 0; i < actions.length; i++) {
        const itemBottom = fabTop - (i + 1) * (ITEM_HEIGHT + ITEM_GAP) + ITEM_GAP;
        const itemTop = itemBottom + ITEM_HEIGHT;
        if (pageY >= itemBottom && pageY <= itemTop) {
          return i;
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
        startY.current = evt.nativeEvent.pageY;
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
        }
        // If not dragging, it was a tap — menu stays open for tap-to-select
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
            onPress={() => {
              onAction?.(action.key);
              close();
            }}
          />
        ))}

      <View
        ref={fabRef}
        onLayout={handleLayout}
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
}: {
  action: FABAction;
  index: number;
  expanded: Animated.SharedValue<number>;
  hovered: boolean;
  colors: ReturnType<typeof useTheme>["colors"];
  onPress: () => void;
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
        {action.label}
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
