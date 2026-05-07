import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { View, StyleSheet } from "react-native";
import type { CameraRef } from "@maplibre/maplibre-react-native";
import { MapView } from "@/components/molecules/MapView";
import { AppIcon } from "@/components/atoms/AppIcon";
import { useTheme } from "@/providers/ThemeProvider";
import { getDefaultMapCenter } from "@/utils/countryCenters";

const ZOOM_FOR_KNOWN_COORDS = 14; // ~city-block precision when re-opening an existing place

export type PlaceMapPickerProps = {
  /**
   * Existing latitude — when provided, the map opens centered on this point
   * at street-level zoom. When null, falls back to the device-locale country
   * center (`countryCenters.ts`).
   */
  latitude: number | null;
  longitude: number | null;
  /**
   * Fires whenever the user finishes panning the map. Receives the lat/lng
   * of the new center. Debounced to ~150ms inside this component so callers
   * don't have to. Imperative recentres via the ref do NOT fire this — the
   * caller already has the coords they passed in.
   */
  onCoordsChange: (latitude: number, longitude: number) => void;
};

export type PlaceMapPickerHandle = {
  /**
   * Imperative pan-to-coords. Use when the GPS button captures fresh coords
   * and we want the map to follow without round-tripping through props (the
   * map is uncontrolled — its camera owns its own state after mount).
   */
  recenterToCoords: (latitude: number, longitude: number) => void;
};

/**
 * Map-based pin-drop for picking a place's coords. Uses the "center-pin"
 * pattern — a fixed pin overlay sits at screen center, the map pans
 * underneath, and the pin's location IS the camera center. Easier than
 * draggable markers, no gesture conflicts with the modal-presented form.
 *
 * Initial camera is uncontrolled by design: changing `latitude`/`longitude`
 * props mid-mount does NOT recenter — call `recenterToCoords` via the ref
 * for that. Without this, every onCoordsChange would feed back into props
 * and trigger a re-render loop.
 */
export const PlaceMapPicker = forwardRef<PlaceMapPickerHandle, PlaceMapPickerProps>(
  function PlaceMapPicker({ latitude, longitude, onCoordsChange }, ref) {
    const { colors } = useTheme();
    const cameraRef = useRef<CameraRef>(null);

    // Capture initial center once, on mount. Subsequent prop updates apply
    // imperatively via the ref to avoid re-render loops.
    const [initialCenter] = useState<[number, number]>(() => {
      if (latitude !== null && longitude !== null) return [longitude, latitude];
      const fallback = getDefaultMapCenter();
      return [fallback.longitude, fallback.latitude];
    });
    const [initialZoom] = useState<number>(() => {
      if (latitude !== null && longitude !== null) return ZOOM_FOR_KNOWN_COORDS;
      return getDefaultMapCenter().zoom;
    });

    // Debounce camera-change callbacks. The map fires onRegionDidChange
    // once when motion settles; the debounce mostly guards against rapid
    // successive interactions.
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // True when the next change event was triggered by us (recenterToCoords)
    // not the user. Suppress to avoid double-firing onCoordsChange.
    const suppressNextChangeRef = useRef(false);

    useEffect(() => {
      return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
      };
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        recenterToCoords: (lat: number, lng: number) => {
          suppressNextChangeRef.current = true;
          cameraRef.current?.easeTo({
            center: [lng, lat],
            zoom: ZOOM_FOR_KNOWN_COORDS,
            duration: 500,
          });
        },
      }),
      [],
    );

    const handleCenterChange = (center: [number, number]) => {
      if (suppressNextChangeRef.current) {
        suppressNextChangeRef.current = false;
        return;
      }
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        // Map gives [lng, lat]; form wants (lat, lng).
        onCoordsChange(center[1], center[0]);
      }, 150);
    };

    return (
      <View style={styles.container}>
        <MapView
          ref={cameraRef}
          initialCenter={initialCenter}
          initialZoom={initialZoom}
          onCenterChange={handleCenterChange}
        />
        {/* Center pin overlay — absolute-positioned so it never moves with
            the map; the map pans underneath it. The pin's tip is anchored
            at the bottom-center of the icon, so the marginTop offset lifts
            the icon up by its height, putting the tip on screen center
            where the camera center actually is. */}
        <View pointerEvents="none" style={styles.pinAnchor}>
          <AppIcon name="map-marker" size={36} color={colors.primary} />
        </View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    position: "relative",
  },
  pinAnchor: {
    position: "absolute",
    top: "50%",
    left: "50%",
    marginTop: -36,
    marginLeft: -18,
  },
});
