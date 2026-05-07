import { forwardRef, useMemo } from "react";
import { StyleSheet, type ViewStyle } from "react-native";
import {
  Map,
  Camera,
  type CameraRef,
  type ViewStateChangeEvent,
} from "@maplibre/maplibre-react-native";

/**
 * Tile source for every map view in the app. Centralised so swapping
 * providers later (e.g. if OpenFreeMap degrades, switch to MapTiler free
 * tier) is a single-line change.
 *
 * Style choices: positron (minimal light, currently active) keeps the pin /
 * heatmap layers visually dominant; bright and liberty are more colourful
 * alternatives also free at OpenFreeMap.
 */
export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

export type MapViewProps = {
  /** [lng, lat] of the initial camera center. */
  initialCenter: [number, number];
  /** Initial camera zoom (lower = wider). */
  initialZoom: number;
  /**
   * Fires when the user finishes panning/zooming. Receives the new center
   * as `[lng, lat]`. Wire onCenterChange when you need live coords (e.g.
   * the place picker reading the pin location).
   */
  onCenterChange?: (center: [number, number], zoom: number) => void;
  /** Container style — height defaults to 250 if not provided. */
  style?: ViewStyle;
  /**
   * Render-prop children: receives nothing, but lets callers compose
   * sources / layers / annotations inside the map (markers, heatmap, etc.).
   */
  children?: React.ReactNode;
};

/**
 * Thin wrapper around MapLibre's `Map` + `Camera`. Both the place picker
 * and the (future) spending heatmap mount this; uniform style URL and
 * sensible defaults live here. Forwards a `CameraRef` so callers can
 * imperatively recenter (e.g. "Use my current location" pans the map).
 */
export const MapView = forwardRef<CameraRef, MapViewProps>(function MapView(
  { initialCenter, initialZoom, onCenterChange, style, children },
  cameraRef,
) {
  const handleRegionDidChange = useMemo(() => {
    if (!onCenterChange) return undefined;
    return (e: { nativeEvent: ViewStateChangeEvent }) => {
      const { center, zoom } = e.nativeEvent;
      onCenterChange([center[0], center[1]], zoom);
    };
  }, [onCenterChange]);

  return (
    <Map
      style={[styles.map, style]}
      mapStyle={MAP_STYLE_URL}
      onRegionDidChange={handleRegionDidChange}
      attribution
      logo={false}
      compass={false}
    >
      <Camera ref={cameraRef} initialViewState={{ center: initialCenter, zoom: initialZoom }} />
      {children}
    </Map>
  );
});

const styles = StyleSheet.create({
  map: {
    width: "100%",
    height: 250,
    borderRadius: 12,
  },
});
