import { useEffect, useMemo, useRef } from "react";
import { View, StyleSheet } from "react-native";
import { GeoJSONSource, Layer, type CameraRef } from "@maplibre/maplibre-react-native";
import { MapView } from "@/components/molecules/MapView";
import { useTheme } from "@/providers/ThemeProvider";
import type { HeatmapFeatureCollection } from "@/db/queries/places";

const HEATMAP_SOURCE_ID = "places-heatmap-source";
const HEATMAP_LAYER_ID = "places-heatmap-layer";

export type PlacesHeatmapProps = {
  /**
   * Raw GeoJSON from `getPlacesAsGeoJSON`. Weights are normalised in this
   * component (max → 1) so the heatmap config stays a fixed gradient
   * regardless of whether the user is in count or amount mode and
   * regardless of currency magnitude.
   */
  data: HeatmapFeatureCollection;
};

/**
 * Spending heatmap. Composes a `<MapView>` with a `<GeoJSONSource>` +
 * `<Layer type="heatmap">` to paint per-place intensity. Mounts auto-fit
 * the camera to the data's bounding box; without features the parent is
 * expected to render an empty-state view instead of mounting this.
 */
export function PlacesHeatmap({ data }: PlacesHeatmapProps) {
  const { colors } = useTheme();
  const cameraRef = useRef<CameraRef>(null);

  // why: heatmap weights are intensity-relative. A user with one $5000
  // expense and many $5 expenses would otherwise show only the big one.
  // Normalising to 0..1 lets the gradient see *every* point and lets
  // heatmap-intensity accumulate them. Raw weight is stashed as
  // `weightRaw` for any future tooltip layer.
  const normalizedData = useMemo<HeatmapFeatureCollection>(() => {
    if (data.features.length === 0) return data;
    const maxWeight = data.features.reduce((m, f) => Math.max(m, f.properties.weight), 0);
    if (maxWeight <= 0) return data;
    return {
      type: "FeatureCollection",
      features: data.features.map((f) => ({
        ...f,
        properties: {
          ...f.properties,
          weight: f.properties.weight / maxWeight,
        },
      })),
    };
  }, [data]);

  // Compute the bounding box of features so we can fitBounds on mount.
  const bbox = useMemo(() => {
    if (data.features.length === 0) return null;
    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;
    for (const f of data.features) {
      const [lng, lat] = f.geometry.coordinates;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    return { sw: [minLng, minLat] as [number, number], ne: [maxLng, maxLat] as [number, number] };
  }, [data]);

  useEffect(() => {
    if (!bbox) return;
    // Tiny defer so the camera ref settles after the first map paint.
    const t = setTimeout(() => {
      // LngLatBounds: [west, south, east, north].
      cameraRef.current?.fitBounds([bbox.sw[0], bbox.sw[1], bbox.ne[0], bbox.ne[1]], {
        padding: { top: 60, right: 60, bottom: 60, left: 60 },
        duration: 0,
      });
    }, 100);
    return () => clearTimeout(t);
  }, [bbox]);

  // Initial center is meaningful only until fitBounds runs (~100ms after
  // mount). Use the centroid of the bbox so there's no visible jump even
  // if the map paints before fitBounds fires.
  const initialCenter: [number, number] = useMemo(() => {
    if (!bbox) return [0, 20];
    return [(bbox.ne[0] + bbox.sw[0]) / 2, (bbox.ne[1] + bbox.sw[1]) / 2];
  }, [bbox]);

  return (
    <View style={styles.container}>
      <MapView ref={cameraRef} initialCenter={initialCenter} initialZoom={2} style={styles.map}>
        <GeoJSONSource id={HEATMAP_SOURCE_ID} data={normalizedData}>
          <Layer
            id={HEATMAP_LAYER_ID}
            type="heatmap"
            paint={{
              // Per-feature contribution. We've already normalised to 0..1.
              "heatmap-weight": ["get", "weight"],
              // Global multiplier; ramps up at higher zooms so a tight
              // cluster doesn't look washed out when the user zooms in.
              "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 1, 9, 3],
              // Gradient: transparent at zero density, theme-coloured peak.
              // Stops chosen for a smooth blue→cyan→yellow→red curve that
              // works on both light (positron) and dark map styles.
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
              // Pixel radius scales with zoom — denser when zoomed out so
              // sparse country-wide data still reads, tighter when zoomed
              // in so a single block doesn't bleed across the whole map.
              "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 8, 9, 30, 14, 60],
              // Slight fade at very high zooms (>15) — a city-block view
              // benefits from seeing actual map detail under the heat.
              "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 7, 0.85, 16, 0.5],
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
  // Override the wrapper's default 250px height — heatmap fills its parent.
  map: {
    width: "100%",
    height: "100%",
    borderRadius: 0,
  },
});
