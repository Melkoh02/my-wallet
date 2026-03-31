// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Allow importing .sql files as raw text for Drizzle ORM migrations
config.resolver.sourceExts.push("sql");

config.transformer.babelTransformerPath = require.resolve("./sql-transformer.js");

module.exports = config;
