import { bundledAssets, inspectBundledAssets } from "./lib/bundled-assets.mjs";

const { assets, exceptions } = await inspectBundledAssets(
  process.argv[2] || "docs/s3-assets-export"
);
console.log(
  JSON.stringify(
    {
      scope: "historical-public-visual-export",
      expectedObjects: bundledAssets.length,
      verifiedObjects: assets.length,
      verifiedBytes: assets.reduce((sum, asset) => sum + asset.size, 0),
      objects: assets.map(({ body, ...asset }) => asset),
      exceptions,
      productionAcceptance: false,
    },
    null,
    2
  )
);
if (exceptions.length) process.exitCode = 1;
