const { withAppBuildGradle } = require("expo/config-plugins");

/**
 * Expo config plugin that configures release signing from keystore.properties.
 * The keystore lives at project root (outside android/) so it survives prebuild --clean.
 */
module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (config) => {
    const buildGradle = config.modResults.contents;

    // Add keystore.properties loading at the top of the android block
    const keystorePropsBlock = `
    // --- Release signing from keystore.properties ---
    def keystorePropertiesFile = rootProject.file("../keystore.properties")
    def keystoreProperties = new Properties()
    if (keystorePropertiesFile.exists()) {
        keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
    }`;

    // Insert after "android {" line
    config.modResults.contents = buildGradle.replace(
      /android\s*\{/,
      `android {\n${keystorePropsBlock}`,
    );

    // Replace the release signingConfig to use our keystore when properties exist
    const releaseSigningReplacement = `release {
            if (keystorePropertiesFile.exists()) {
                signingConfig signingConfigs.create("release") {
                    storeFile file(keystoreProperties['storeFile'])
                    storePassword keystoreProperties['storePassword']
                    keyAlias keystoreProperties['keyAlias']
                    keyPassword keystoreProperties['keyPassword']
                }
            } else {
                signingConfig signingConfigs.debug
            }`;

    // Match the release block that uses signingConfigs.debug
    config.modResults.contents = config.modResults.contents.replace(
      /release\s*\{[^}]*signingConfig\s+signingConfigs\.debug/s,
      releaseSigningReplacement,
    );

    return config;
  });
};
