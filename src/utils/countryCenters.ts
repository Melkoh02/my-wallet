/**
 * Best-effort country-level map centers for the "no GPS, no existing coords"
 * fallback in the place picker. Values are rough geographic centers + a
 * country-fitting zoom level (lower = wider view).
 *
 * Not exhaustive — only regions we've seen actual users in plus the locales
 * the app ships translations for. Anything unlisted falls back to a world
 * view, which the user can pan from.
 */

import * as Localization from "expo-localization";

export type MapCenter = {
  latitude: number;
  longitude: number;
  zoom: number;
};

const WORLD: MapCenter = { latitude: 20, longitude: 0, zoom: 1 };

const COUNTRY_CENTERS: Record<string, MapCenter> = {
  US: { latitude: 39.5, longitude: -98.35, zoom: 3 },
  CA: { latitude: 56.13, longitude: -106.35, zoom: 3 },
  MX: { latitude: 23.6, longitude: -102.55, zoom: 4 },
  BR: { latitude: -14.24, longitude: -51.93, zoom: 3 },
  AR: { latitude: -34.0, longitude: -64.0, zoom: 4 },
  PY: { latitude: -23.44, longitude: -58.44, zoom: 5 },
  CL: { latitude: -35.68, longitude: -71.54, zoom: 4 },
  GB: { latitude: 54.0, longitude: -2.5, zoom: 5 },
  IE: { latitude: 53.0, longitude: -8.0, zoom: 6 },
  ES: { latitude: 40.46, longitude: -3.75, zoom: 5 },
  PT: { latitude: 39.4, longitude: -8.22, zoom: 6 },
  FR: { latitude: 46.23, longitude: 2.21, zoom: 5 },
  DE: { latitude: 51.17, longitude: 10.45, zoom: 5 },
  IT: { latitude: 41.87, longitude: 12.57, zoom: 5 },
  NL: { latitude: 52.13, longitude: 5.29, zoom: 6 },
  SE: { latitude: 60.13, longitude: 18.64, zoom: 4 },
  NO: { latitude: 60.47, longitude: 8.47, zoom: 4 },
  DK: { latitude: 56.26, longitude: 9.5, zoom: 6 },
  FI: { latitude: 61.92, longitude: 25.75, zoom: 4 },
  PL: { latitude: 51.92, longitude: 19.13, zoom: 5 },
  RU: { latitude: 61.52, longitude: 105.32, zoom: 2 },
  TR: { latitude: 38.96, longitude: 35.24, zoom: 5 },
  IL: { latitude: 31.05, longitude: 34.85, zoom: 7 },
  AE: { latitude: 23.42, longitude: 53.85, zoom: 6 },
  SA: { latitude: 23.89, longitude: 45.08, zoom: 4 },
  ZA: { latitude: -30.56, longitude: 22.94, zoom: 5 },
  NG: { latitude: 9.08, longitude: 8.68, zoom: 5 },
  EG: { latitude: 26.82, longitude: 30.8, zoom: 5 },
  IN: { latitude: 20.59, longitude: 78.96, zoom: 4 },
  CN: { latitude: 35.86, longitude: 104.2, zoom: 3 },
  JP: { latitude: 36.2, longitude: 138.25, zoom: 5 },
  KR: { latitude: 35.91, longitude: 127.77, zoom: 6 },
  TH: { latitude: 15.87, longitude: 100.99, zoom: 5 },
  ID: { latitude: -0.79, longitude: 113.92, zoom: 4 },
  PH: { latitude: 12.88, longitude: 121.77, zoom: 5 },
  VN: { latitude: 14.06, longitude: 108.28, zoom: 5 },
  AU: { latitude: -25.27, longitude: 133.77, zoom: 3 },
  NZ: { latitude: -40.9, longitude: 174.89, zoom: 5 },
};

/**
 * Resolve a sensible map center using the device's region code. Falls back
 * to a world view when the locale lookup misses (or expo-localization can't
 * supply a region for whatever reason).
 */
export function getDefaultMapCenter(): MapCenter {
  try {
    const locales = Localization.getLocales();
    const region = locales[0]?.regionCode;
    if (region && COUNTRY_CENTERS[region]) return COUNTRY_CENTERS[region];
  } catch {
    // expo-localization shouldn't throw, but defensive fallback in case it
    // does in some test environment.
  }
  return WORLD;
}
