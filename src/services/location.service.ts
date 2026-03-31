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

  try {
    const [address] = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (address) {
      const parts = [address.name, address.city, address.region].filter(Boolean);
      stamp.name = parts.join(", ");
    }
  } catch {
    // Reverse geocoding failed, coords are still useful
  }

  return stamp;
}
