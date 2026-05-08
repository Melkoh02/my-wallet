import * as Location from "expo-location";

export type LocationStamp = {
  latitude: number;
  longitude: number;
  name?: string;
};

export async function getCurrentLocation(): Promise<LocationStamp | null> {
  // Always check fresh — don't cache permission status
  const { status } = await Location.getForegroundPermissionsAsync();
  if (status !== "granted") {
    const { status: newStatus } = await Location.requestForegroundPermissionsAsync();
    if (newStatus !== "granted") return null;
  }

  try {
    // Try last known position first (instant)
    const lastKnown = await Location.getLastKnownPositionAsync();
    if (lastKnown) {
      return buildStamp(lastKnown.coords.latitude, lastKnown.coords.longitude);
    }

    // Fall back to current position with a timeout
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Low,
      timeInterval: 5000,
    });

    return buildStamp(loc.coords.latitude, loc.coords.longitude);
  } catch (e) {
    console.warn("Location error:", e);
    return null;
  }
}

async function buildStamp(latitude: number, longitude: number): Promise<LocationStamp> {
  const stamp: LocationStamp = { latitude, longitude };
  const name = await reverseGeocodeCoords(latitude, longitude);
  if (name) stamp.name = name;
  return stamp;
}

/**
 * Best-effort reverse-geocode of coords → human-readable address string.
 * Returns null on any failure (no network, no Geocoder backend, no result).
 * Used both by `getCurrentLocation` (suggesting a place name on GPS capture)
 * and by the place form (auto-populating `places.address` when the user
 * pans the map or captures coords).
 *
 * gotcha: on Android this routes through the system `Geocoder` which on
 * stock devices uses Google Play Services. De-Googled forks (LineageOS-
 * without-MicroG, GrapheneOS without sandboxed Play) will return empty
 * results — that's fine, we just store no address. iOS uses Apple Maps
 * geocoding which is always available.
 */
export async function reverseGeocodeCoords(
  latitude: number,
  longitude: number,
): Promise<string | null> {
  try {
    const [address] = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (!address) return null;
    const parts = [address.name, address.city, address.region].filter(Boolean);
    const joined = parts.join(", ");
    return joined.length > 0 ? joined : null;
  } catch {
    return null;
  }
}
