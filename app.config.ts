import { ExpoConfig, ConfigContext } from "expo/config";

const IS_DEV = process.env.APP_VARIANT === "development";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: IS_DEV ? "[Dev] My Wallet" : "My Wallet",
  slug: "my-wallet",
  version: "1.7.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: IS_DEV ? "mywallet-dev" : "mywallet",
  userInterfaceStyle: "automatic",
  ios: {
    icon: "./assets/expo.icon",
    bundleIdentifier: IS_DEV ? "dev.melkoh.mywallet.dev" : "dev.melkoh.mywallet",
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#2563EB",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    package: IS_DEV ? "dev.melkoh.mywallet.dev" : "dev.melkoh.mywallet",
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
