import * as Location from "expo-location";

export type LocationStamp = {
  latitude: number;
  longitude: number;
  name?: string;
};

let _hasPermission: boolean | null = null;

export async function hasLocationPermission(): Promise<boolean> {
  if (_hasPermission !== null) return _hasPermission;
  const { status } = await Location.getForegroundPermissionsAsync();
  _hasPermission = status === "granted";
  return _hasPermission;
}

export async function requestLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  _hasPermission = status === "granted";
  return _hasPermission;
}

export async function getCurrentLocation(): Promise<LocationStamp | null> {
  if (!(await hasLocationPermission())) {
    const granted = await requestLocationPermission();
    if (!granted) return null;
  }

  try {
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const stamp: LocationStamp = {
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
    };

    // Try reverse geocoding for a human-readable name
    try {
      const [address] = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
      if (address) {
        const parts = [address.name, address.city, address.region].filter(Boolean);
        stamp.name = parts.join(", ");
      }
    } catch {
      // Reverse geocoding failed, that's ok
    }

    return stamp;
  } catch {
    return null;
  }
}
