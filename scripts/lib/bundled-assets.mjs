import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// Pins describe the historical visual export, not a current production inventory.
export const bundledAssets = [
  [
    "Kwantu-identity_fc192da7.svg",
    34338,
    "image/svg+xml",
    "f2abd5a0d8a59f49e039ca35bedd9af053337c341e9890062f0f6dfa44ed67b8",
  ],
  [
    "kwantu-braider_2d92759f_6d3ffd6a.jpg",
    5333504,
    "image/png",
    "3121545be8b8ca66f5f246c85832184df1ea27dc617994d24858e698c75f5559",
  ],
  [
    "kwantu-ceremony-tailor_6da99e5d_14bae697.jpg",
    4816655,
    "image/png",
    "c4990bd5eb495e4714bc769043cc60ab27bb2737c1372910740437d3bc70c780",
  ],
  [
    "kwantu-hero-caterer_500a9501_b0867b9e.jpg",
    5233338,
    "image/png",
    "a35fb0329d8acf8b6fc26eec98fef1fbfe52d886a239824925ad40686bea62ed",
  ],
  [
    "kwantu-hero-fashion-maker_20399257_99e7dc6b.jpg",
    4575287,
    "image/png",
    "010f032bbdae13d1788bb783a93a687c39280ec2382ce0cd59c638e6e2f3eb48",
  ],
  [
    "kwantu-tutor-family_96516297_e66523e7.jpg",
    5892087,
    "image/png",
    "adfc0ac27465b72b1b014507b1f8b7d5b0e3fa82a6b2c18aae58f05383e6a4d6",
  ],
  [
    "kwantu-wellness-tea_06aa39c7_ad80b8bd.jpg",
    6901925,
    "image/png",
    "7b6d9a4cf37de473dd614d80c797878b8b5aff2b2897a5e746cfa53a0fb4baa9",
  ],
].map(([name, size, contentType, sha256]) => ({
  name,
  key: `public/${name}`,
  size,
  contentType,
  sha256,
}));

export function verifyBundledBody(asset, body) {
  const sha256 = createHash("sha256").update(body).digest("hex");
  if (body.length !== asset.size || sha256 !== asset.sha256) {
    throw new Error(`Size or SHA-256 mismatch: ${asset.name}`);
  }
  if (
    asset.contentType === "image/png" &&
    !body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    throw new Error(`Source asset is not a PNG image: ${asset.name}`);
  }
  return body;
}

export async function inspectBundledAssets(directory) {
  const assets = [];
  const exceptions = [];
  for (const asset of bundledAssets) {
    try {
      const body = verifyBundledBody(
        asset,
        await readFile(resolve(directory, asset.name))
      );
      assets.push({ ...asset, body });
    } catch (error) {
      exceptions.push({
        key: asset.key,
        reason: error.code === "ENOENT" ? "missing-file" : "invalid-file",
      });
    }
  }
  return { assets, exceptions };
}
