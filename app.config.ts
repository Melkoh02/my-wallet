import { ExpoConfig, ConfigContext } from "expo/config";

const IS_DEV = process.env.APP_VARIANT === "development";

const VERSION = "2.1.0";

// Android requires a monotonically-increasing integer per release. Derive it
// deterministically from the version string: major*10000 + minor*100 + patch.
// 1.8.1 → 10801; 1.7.0 → 10700; 2.0.0 → 20000. Bumping `version` automatically
// bumps versionCode so sideload installs are recognised as upgrades and don't
// reuse cached dex/JS bundles from prior installs.
function deriveVersionCode(v: string): number {
  const [major, minor, patch] = v.split(".").map((n) => parseInt(n, 10));
  return major * 10000 + minor * 100 + patch;
}

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  // why: launcher name = "Froggy" (short, fits under the home-screen icon).
  // Play Store listing title = "Froggy Money: Expense Tracker", configured in
  // the Play Console (not in this file). Dev variant gets a "[Dev]" prefix
  // so test builds don't visually collide with a Play Store install on the
  // same device.
  name: IS_DEV ? "[Dev] Froggy" : "Froggy",
  slug: "froggy",
  version: VERSION,
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: IS_DEV ? "froggy-dev" : "froggy",
  userInterfaceStyle: "automatic",
  ios: {
    // why: dropped the `icon: "./assets/expo.icon"` override (Xcode-26
    // .iconcomposer asset bundle) — that was the "My Wallet" wallet icon,
    // wired before the rebrand. Falls through to the top-level
    // `icon: "./assets/images/icon.png"`, which is the new Froggy.
    // When we eventually want a proper Liquid Glass / multi-mode iOS
    // icon, regenerate the `.iconcomposer` from the Froggy SVG and
    // re-add this line.
    bundleIdentifier: IS_DEV ? "dev.melkoh.froggy.dev" : "dev.melkoh.froggy",
    infoPlist: {
      UIFileSharingEnabled: true,
      LSSupportsOpeningDocumentsInPlace: true,
      NSFaceIDUsageDescription:
        "Use Face ID to authenticate before performing protected actions in Froggy (e.g. opening Backups or disabling random-numbers privacy mode).",
    },
  },
  android: {
    adaptiveIcon: {
      // Cream — matches the icon.svg fill. Adaptive launchers composite
      // the foreground PNG on top of this colour. Dropped backgroundImage
      // (was a separate PNG) — a flat colour is the same visual result
      // and keeps one fewer asset in sync.
      backgroundColor: "#FFE5A8",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    package: IS_DEV ? "dev.melkoh.froggy.dev" : "dev.melkoh.froggy",
    versionCode: deriveVersionCode(VERSION),
  },
  web: {
    output: "static" as const,
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "./plugins/withReleaseSigning",
    "expo-router",
    [
      "expo-splash-screen",
      {
        // Cream — same as the icon background, so the app launch reads
        // as "the icon expanded into a splash" rather than a colour shift.
        backgroundColor: "#FFE5A8",
        android: {
          image: "./assets/images/splash-icon.png",
          imageWidth: 220,
        },
      },
    ],
    "expo-sqlite",
    "expo-sharing",
    "@react-native-community/datetimepicker",
    "expo-localization",
    "expo-local-authentication",
    "@maplibre/maplibre-react-native",
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    router: {},
    eas: {
      projectId: "0e2c5132-f5fc-4a0d-a8d6-b00810136604",
    },
  },
});
