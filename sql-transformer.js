const upstreamTransformer = require("@expo/metro-config/babel-transformer");
const fs = require("fs");

module.exports.transform = function ({ src, filename, options }) {
  if (filename.endsWith(".sql")) {
    // Read the raw SQL and export it as a string
    const sql = fs.readFileSync(filename, "utf8");
    const escaped = JSON.stringify(sql);
    return upstreamTransformer.transform({
      src: `export default ${escaped};`,
      filename,
      options,
    });
  }
  return upstreamTransformer.transform({ src, filename, options });
};
