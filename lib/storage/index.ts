import crypto from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxBytes = 5 * 1024 * 1024;
type StoredImage = { storageKey: string; url: string };
interface StorageAdapter {
  save(file: File, storageKey: string): Promise<StoredImage>;
}

class LocalStorageAdapter implements StorageAdapter {
  async save(file: File, storageKey: string) {
    const root = path.resolve(
      /* turbopackIgnore: true */ process.env.STORAGE_LOCAL_DIR ||
        "./public/uploads",
    );
    await mkdir(
      path.dirname(path.join(/* turbopackIgnore: true */ root, storageKey)),
      { recursive: true },
    );
    await writeFile(
      path.join(/* turbopackIgnore: true */ root, storageKey),
      Buffer.from(await file.arrayBuffer()),
    );
    return { storageKey, url: `/uploads/${storageKey}` };
  }
}

class S3CompatibleStorageAdapter implements StorageAdapter {
  private bucket = process.env.STORAGE_S3_BUCKET || "";
  private publicUrl = (process.env.STORAGE_PUBLIC_URL || "").replace(/\/$/, "");
  private client = new S3Client({
    region: process.env.STORAGE_S3_REGION || "auto",
    endpoint: process.env.STORAGE_S3_ENDPOINT,
    forcePathStyle: process.env.STORAGE_S3_FORCE_PATH_STYLE === "true",
    credentials:
      process.env.STORAGE_S3_ACCESS_KEY_ID &&
      process.env.STORAGE_S3_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.STORAGE_S3_ACCESS_KEY_ID,
            secretAccessKey: process.env.STORAGE_S3_SECRET_ACCESS_KEY,
          }
        : undefined,
  });

  async save(file: File, storageKey: string) {
    if (!this.bucket || !this.publicUrl)
      throw new Error("STORAGE_NOT_CONFIGURED");
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Body: Buffer.from(await file.arrayBuffer()),
        ContentType: file.type,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    return { storageKey, url: `${this.publicUrl}/${storageKey}` };
  }
}

function getAdapter(): StorageAdapter {
  return process.env.STORAGE_DRIVER === "s3"
    ? new S3CompatibleStorageAdapter()
    : new LocalStorageAdapter();
}

export async function saveImage(file: File, folder: string) {
  if (!allowed.has(file.type)) throw new Error("UNSUPPORTED_FILE_TYPE");
  if (file.size > maxBytes) throw new Error("FILE_TOO_LARGE");
  const ext = file.type.split("/")[1].replace("jpeg", "jpg");
  const storageKey = `${folder}/${crypto.randomUUID()}.${ext}`;
  return getAdapter().save(file, storageKey);
}
