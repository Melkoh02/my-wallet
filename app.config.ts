import { ExpoConfig, ConfigContext } from "expo/config";

const IS_DEV = process.env.APP_VARIANT === "development";

const VERSION = "1.9.0";

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
  name: IS_DEV ? "[Dev] My Wallet" : "My Wallet",
  slug: "my-wallet",
  version: VERSION,
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: IS_DEV ? "mywallet-dev" : "mywallet",
  userInterfaceStyle: "automatic",
  ios: {
    icon: "./assets/expo.icon",
    bundleIdentifier: IS_DEV ? "dev.melkoh.mywallet.dev" : "dev.melkoh.mywallet",
    infoPlist: {
      UIFileSharingEnabled: true,
      LSSupportsOpeningDocumentsInPlace: true,
      NSFaceIDUsageDescription:
        "Use Face ID to authenticate before performing protected actions in My Wallet (e.g. opening Backups or disabling random-numbers privacy mode).",
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#2563EB",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    package: IS_DEV ? "dev.melkoh.mywallet.dev" : "dev.melkoh.mywallet",
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
        backgroundColor: "#1D4ED8",
        android: {
          image: "./assets/images/splash-icon.png",
          imageWidth: 76,
        },
      },
    ],
    "expo-sqlite",
    "expo-sharing",
    "@react-native-community/datetimepicker",
    "expo-localization",
    "expo-local-authentication",
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
