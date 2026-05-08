import { useMemo } from "react";
import { View, StyleSheet } from "react-native";
import { GeoJSONSource, Layer } from "@maplibre/maplibre-react-native";
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
 * Approximate zoom level that fits a bbox into the map viewport. Uses a
 * Mercator-friendly heuristic: world width = 360°, map width at zoom z is
 * 360 / 2^z, fit the bbox width into ~80% of viewport.
 *
 * Single-point bboxes (zero-area) snap to street-level zoom so the user
 * lands somewhere visible instead of zoomed all the way out.
 */
function zoomForBbox(lngSpan: number, latSpan: number): number {
  const span = Math.max(lngSpan, latSpan);
  if (span <= 0) return 14;
  // 360 / 2^z = span / 0.8  →  z = log2(288 / span). Clamp to map limits.
  return Math.max(1, Math.min(16, Math.log2(288 / span)));
}

/**
 * Spending heatmap. Composes a `<MapView>` with a `<GeoJSONSource>` +
 * `<Layer type="heatmap">` to paint per-place intensity.
 *
 * Camera state (centre + zoom) is computed from the data's bbox at mount
 * and passed into MapView's initial state — no imperative `fitBounds` after
 * the fact. why: the native fitBounds call has to land after the map style
 * finishes loading, and racing it with a setTimeout was crashing on real
 * devices for some users (silent native crash, no JS error).
 *
 * Without features the parent is expected to render an empty-state view
 * instead of mounting this.
 */
export function PlacesHeatmap({ data }: PlacesHeatmapProps) {
  const { colors } = useTheme();

  // why: heatmap weights are intensity-relative. A user with one $5000
  // expense and many $5 expenses would otherwise show only the big one.
  // Normalising to 0..1 lets the gradient see *every* point and lets
  // heatmap-intensity accumulate them.
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

  // gotcha: stringify the GeoJSON before passing to the native source.
  // The library accepts either a URL string or a parsed GeoJSON object,
  // but some native bridges have serialization quirks with object payloads
  // — passing JSON eliminates a class of "works in dev, crashes on
  // production build" surprises.
  const dataString = useMemo(() => JSON.stringify(normalizedData), [normalizedData]);

  const { center, zoom } = useMemo<{ center: [number, number]; zoom: number }>(() => {
    if (data.features.length === 0) {
      return { center: [0, 20], zoom: 1 };
    }
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
    return {
      center: [(minLng + maxLng) / 2, (minLat + maxLat) / 2],
      zoom: zoomForBbox(maxLng - minLng, maxLat - minLat),
    };
  }, [data]);

  return (
    <View style={styles.container}>
      <MapView initialCenter={center} initialZoom={zoom} style={styles.map}>
        <GeoJSONSource id={HEATMAP_SOURCE_ID} data={dataString}>
          <Layer
            id={HEATMAP_LAYER_ID}
            type="heatmap"
            // Bind layer to the parent source explicitly. Some Drizzle/MapLibre
            // RN paths rely on the React tree for source-binding, but being
            // explicit is safer across versions and avoids "layer references
            // unknown source" native errors.
            source={HEATMAP_SOURCE_ID}
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
