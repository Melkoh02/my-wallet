import { useMemo, useRef } from "react";
import { View, StyleSheet } from "react-native";
import {
  GeoJSONSource,
  Layer,
  type CameraRef,
  type GeoJSONSourceRef,
  type PressEventWithFeatures,
} from "@maplibre/maplibre-react-native";
import type { NativeSyntheticEvent } from "react-native";
import { MapView, type MapRegion } from "@/components/molecules/MapView";
import { useTheme } from "@/providers/ThemeProvider";
import type { HeatmapFeatureCollection } from "@/db/queries/places";

const HEAT_SOURCE_ID = "places-heat-source";
const HEAT_LAYER_ID = "places-heat-layer";
const POINTS_SOURCE_ID = "places-points-source";
const CLUSTER_LAYER_ID = "places-cluster-layer";
const CLUSTER_COUNT_LAYER_ID = "places-cluster-count-layer";
const POINT_LAYER_ID = "places-point-layer";

export type PlacesHeatmapProps = {
  /**
   * Raw GeoJSON from `getPlacesAsGeoJSON`. Heatmap weights are normalised
   * inside this component (max → 1) so a single big-amount outlier doesn't
   * wash out the rest.
   */
  data: HeatmapFeatureCollection;
  /**
   * Fired when the user taps an individual (non-cluster) place dot. Cluster
   * taps are handled internally — they ease the camera in to expand. The
   * parent typically navigates to /place/{placeId}.
   */
  onPlacePress?: (placeId: number) => void;
  /**
   * Fired on every camera-settle (pan / zoom). Forwards the visible bounds
   * so the parent can answer "what's in this view?" (the "Show all in
   * view" affordance on the spending-map screen).
   */
  onRegionChange?: (region: MapRegion) => void;
};

function zoomForBbox(lngSpan: number, latSpan: number): number {
  const span = Math.max(lngSpan, latSpan);
  if (span <= 0) return 14;
  return Math.max(1, Math.min(16, Math.log2(288 / span)));
}

/**
 * Spending heatmap with tappable place dots and zoom-to-expand clusters.
 *
 * Two GeoJSON sources back this view:
 *   - `places-heat-source` — non-clustered, feeds the heatmap layer with
 *     the raw normalised weights so density renders accurately.
 *   - `places-points-source` — clustered, feeds the cluster + dot layers.
 *     Clustering on the heatmap source would silently merge points and
 *     distort the density gradient, so the two sources stay separate.
 *
 * Tap dispatch:
 *   - A cluster feature (`properties.cluster === true`) triggers an
 *     `easeTo` to that cluster's expansion zoom, breaking it up into
 *     individual dots or smaller clusters.
 *   - An individual feature emits `onPlacePress(placeId)` for the parent
 *     to handle (typically navigation).
 */
export function PlacesHeatmap({ data, onPlacePress, onRegionChange }: PlacesHeatmapProps) {
  const { colors } = useTheme();
  const cameraRef = useRef<CameraRef>(null);
  const pointsSourceRef = useRef<GeoJSONSourceRef>(null);

  // Normalise heatmap weights to 0..1 so big-amount outliers don't dominate.
  const heatData = useMemo<HeatmapFeatureCollection>(() => {
    if (data.features.length === 0) return data;
    const maxWeight = data.features.reduce((m, f) => Math.max(m, f.properties.weight), 0);
    if (maxWeight <= 0) return data;
    return {
      type: "FeatureCollection",
      features: data.features.map((f) => ({
        ...f,
        properties: { ...f.properties, weight: f.properties.weight / maxWeight },
      })),
    };
  }, [data]);

  // gotcha: pass GeoJSON as a string — some MapLibre RN bridges have known
  // serialization quirks with object payloads on Android.
  const heatString = useMemo(() => JSON.stringify(heatData), [heatData]);
  const pointsString = useMemo(() => JSON.stringify(data), [data]);

  const { center, zoom } = useMemo<{ center: [number, number]; zoom: number }>(() => {
    if (data.features.length === 0) return { center: [0, 20], zoom: 1 };

    // why: focus the camera on where the heat actually is, not on a bbox
    // that fits every outlier. Sort features by weight (descending) and
    // include them until the running total covers DOMINANT_WEIGHT_PCT of
    // the total weight; fit the camera to that subset's bbox. Result:
    // a rare-but-far-away place doesn't pull the camera all the way out
    // to a continental view, while two genuinely-balanced centres of
    // activity stay visible together.
    const DOMINANT_WEIGHT_PCT = 0.8;
    const sorted = [...data.features].sort((a, b) => b.properties.weight - a.properties.weight);
    const totalWeight = sorted.reduce((s, f) => s + f.properties.weight, 0);
    const target = totalWeight * DOMINANT_WEIGHT_PCT;
    let accum = 0;
    const dominant: typeof sorted = [];
    for (const f of sorted) {
      dominant.push(f);
      accum += f.properties.weight;
      if (accum >= target) break;
    }

    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;
    for (const f of dominant) {
      const [lng, lat] = f.geometry.coordinates;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    return {
      center: [(minLng + maxLng) / 2, (minLat + maxLat) / 2],
      zoom: zoomForBbox(maxLng - minLng, maxLat - minLat),
    };
  }, [data]);

  const handleSourcePress = async (e: NativeSyntheticEvent<PressEventWithFeatures>) => {
    const features = e.nativeEvent.features ?? [];
    if (features.length === 0) return;
    // why: when both cluster + individual layers are above the same point
    // (the rare case where a cluster sits exactly on a leaf), prefer the
    // cluster — taps near a cluster should always expand, not navigate.
    const cluster = features.find((f) => (f.properties as { cluster?: boolean })?.cluster === true);
    if (cluster) {
      const props = cluster.properties as { cluster_id?: number };
      if (props.cluster_id == null) return;
      try {
        const expansionZoom = await pointsSourceRef.current?.getClusterExpansionZoom(
          props.cluster_id,
        );
        if (expansionZoom == null) return;
        const coords = (cluster.geometry as GeoJSON.Point).coordinates;
        cameraRef.current?.easeTo({
          center: [coords[0], coords[1]],
          zoom: expansionZoom,
          duration: 400,
        });
      } catch {
        // getClusterExpansionZoom can throw if the source hasn't finished
        // building its cluster index — silently no-op rather than crashing.
      }
      return;
    }
    const single = features[0];
    const placeId = (single.properties as { placeId?: number })?.placeId;
    if (placeId != null) onPlacePress?.(placeId);
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={cameraRef}
        initialCenter={center}
        initialZoom={zoom}
        style={styles.map}
        onRegionChange={onRegionChange}
      >
        {/* Heatmap density layer — accurate, non-clustered source. */}
        <GeoJSONSource id={HEAT_SOURCE_ID} data={heatString}>
          <Layer
            id={HEAT_LAYER_ID}
            type="heatmap"
            source={HEAT_SOURCE_ID}
            paint={{
              "heatmap-weight": ["get", "weight"],
              "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 1, 9, 3],
              "heatmap-color": [
                "interpolate",
                ["linear"],
                ["heatmap-density"],
                0,
                "rgba(33, 102, 172, 0)",
                0.2,
                "rgba(103, 169, 207, 0.5)",
                0.4,
                "rgba(209, 229, 240, 0.7)",
                0.6,
                "rgba(253, 219, 199, 0.8)",
                0.8,
                "rgba(239, 138, 98, 0.9)",
                1,
                colors.danger,
              ],
              "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 8, 9, 30, 14, 60],
              "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 7, 0.85, 16, 0.5],
            }}
          />
        </GeoJSONSource>

        {/* Cluster + tappable dots — separate clustered source so the
            heatmap above doesn't merge points unexpectedly. */}
        <GeoJSONSource
          id={POINTS_SOURCE_ID}
          ref={pointsSourceRef}
          data={pointsString}
          cluster
          clusterRadius={50}
          clusterMaxZoom={14}
          onPress={handleSourcePress}
        >
          {/* Cluster bubbles — only renders for cluster features. */}
          <Layer
            id={CLUSTER_LAYER_ID}
            type="circle"
            source={POINTS_SOURCE_ID}
            filter={["has", "point_count"]}
            paint={{
              "circle-color": colors.primary,
              "circle-opacity": 0.85,
              "circle-stroke-width": 2,
              "circle-stroke-color": "rgba(255,255,255,0.9)",
              "circle-radius": [
                "interpolate",
                ["linear"],
                ["get", "point_count"],
                1,
                14,
                10,
                20,
                50,
                28,
              ],
            }}
          />
          {/* Cluster count labels. text-font omitted so MapLibre falls back
              to the style's default; positron exposes Open Sans which is
              fine for our digit labels. */}
          <Layer
            id={CLUSTER_COUNT_LAYER_ID}
            type="symbol"
            source={POINTS_SOURCE_ID}
            filter={["has", "point_count"]}
            layout={{
              "text-field": ["get", "point_count_abbreviated"],
              "text-size": 12,
              "text-allow-overlap": true,
            }}
            paint={{
              "text-color": "#FFFFFF",
            }}
          />
          {/* Individual place dots — single (un-clustered) features. */}
          <Layer
            id={POINT_LAYER_ID}
            type="circle"
            source={POINTS_SOURCE_ID}
            filter={["!", ["has", "point_count"]]}
            paint={{
              "circle-color": colors.primary,
              "circle-radius": 6,
              "circle-stroke-width": 2,
              "circle-stroke-color": "rgba(255,255,255,0.9)",
            }}
          />
        </GeoJSONSource>
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    width: "100%",
    height: "100%",
    borderRadius: 0,
  },
});
