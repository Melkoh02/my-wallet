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

/** Camera region snapshot fired on pan/zoom settle. */
export type MapRegion = {
  center: [number, number];
  zoom: number;
  /** Visible bounds: [west, south, east, north]. Use for "what's in view" queries. */
  bounds: [number, number, number, number];
};

export type MapViewProps = {
  /** [lng, lat] of the initial camera center. */
  initialCenter: [number, number];
  /** Initial camera zoom (lower = wider). */
  initialZoom: number;
  /**
   * Fires when the user finishes panning/zooming. Receives the new center
   * as `[lng, lat]`. Use for "where's the pin?" semantics (place picker).
   */
  onCenterChange?: (center: [number, number], zoom: number) => void;
  /**
   * Fires when the user finishes panning/zooming with the full region —
   * center + zoom + visible bounds. Use for "what's in view?" semantics
   * (spending map's "show all in view" sheet).
   */
  onRegionChange?: (region: MapRegion) => void;
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
  { initialCenter, initialZoom, onCenterChange, onRegionChange, style, children },
  cameraRef,
) {
  const handleRegionDidChange = useMemo(() => {
    if (!onCenterChange && !onRegionChange) return undefined;
    return (e: { nativeEvent: ViewStateChangeEvent }) => {
      const { center, zoom, bounds } = e.nativeEvent;
      if (onCenterChange) onCenterChange([center[0], center[1]], zoom);
      if (onRegionChange) {
        onRegionChange({
          center: [center[0], center[1]],
          zoom,
          bounds: [bounds[0], bounds[1], bounds[2], bounds[3]],
        });
      }
    };
  }, [onCenterChange, onRegionChange]);

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
