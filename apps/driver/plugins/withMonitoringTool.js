const { withAndroidManifest } = require("@expo/config-plugins");

const withMonitoringTool = (config) => {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    if (!manifest["meta-data"]) {
      manifest["meta-data"] = [];
    }
    const alreadyAdded = manifest["meta-data"].some(
      m => m.$?.["android:name"] === "isMonitoringTool"
    );
    if (!alreadyAdded) {
      manifest["meta-data"].push({
        $: {
          "android:name": "isMonitoringTool",
          "android:value": "enterprise_management",
        },
      });
    }
    return config;
  });
};

module.exports = withMonitoringTool;
