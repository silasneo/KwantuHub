import "dotenv/config";
import { createHash } from "node:crypto";
import { storageGetObject, storagePut } from "../server/storage";
import { inspectBundledAssets } from "./lib/bundled-assets.mjs";

async function importAssets() {
  const assetDirectory = process.env.ASSET_DIR || "docs/s3-assets-export";
  console.warn(
    "Excluded kwantu-christmas-market_9ea74b26_1a8e6c12.jpg: the archived export is an HTML error page, not an image."
  );
  const { assets, exceptions } = await inspectBundledAssets(assetDirectory);
  if (exceptions.length) {
    throw new Error(
      `Source preflight failed; no objects uploaded: ${JSON.stringify(exceptions)}`
    );
  }
  if (process.argv.includes("--dry-run")) {
    console.log(
      `Preflight verified ${assets.length} historical public assets; no objects uploaded.`
    );
    return;
  }
  for (const asset of assets) {
    const { body, key } = asset;
    const checksum = createHash("sha256").update(body).digest("hex");
    await storagePut(key, body, asset.contentType);
    const object = await storageGetObject(key);
    if (!object.Body) throw new Error(`Uploaded object has no body: ${key}`);
    const uploaded = await object.Body.transformToByteArray();
    const uploadedChecksum = createHash("sha256")
      .update(uploaded)
      .digest("hex");
    if (
      uploadedChecksum !== checksum ||
      uploaded.byteLength !== body.byteLength ||
      object.ContentType !== asset.contentType
    ) {
      throw new Error(
        `Uploaded object failed checksum, size, or content-type verification: ${key}`
      );
    }
    console.log(
      `Verified ${key} (${body.byteLength} bytes, SHA-256 ${checksum})`
    );
  }
}

importAssets().catch(error => {
  console.error("Asset import failed:", error);
  process.exitCode = 1;
});
