import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type GetObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "./_core/env";

let client: S3Client | undefined;

function getStorageConfig() {
  const { s3Endpoint, s3Region, s3Bucket, s3AccessKeyId, s3SecretAccessKey } = ENV;
  if (!s3Endpoint || !s3Bucket || !s3AccessKeyId || !s3SecretAccessKey) {
    throw new Error(
      "Object storage is not configured. Set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY."
    );
  }
  return { endpoint: s3Endpoint, region: s3Region, bucket: s3Bucket };
}

function getClient() {
  if (client) return client;
  const config = getStorageConfig();
  client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: ENV.s3ForcePathStyle,
    credentials: {
      accessKeyId: ENV.s3AccessKeyId,
      secretAccessKey: ENV.s3SecretAccessKey,
    },
  });
  return client;
}

export function normalizeStorageKey(value: string): string {
  const key = value.replace(/^\/+/, "");
  const segments = key.split("/");
  if (
    !key ||
    key.length > 512 ||
    key.includes("\\") ||
    segments.some(segment => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("Invalid object storage key");
  }
  return key;
}

function encodeKey(key: string) {
  return key.split("/").map(encodeURIComponent).join("/");
}

export function getPublicMediaUrl(key: string) {
  const normalizedKey = normalizeStorageKey(key);
  if (!normalizedKey.startsWith("public/")) {
    throw new Error("Only public objects can be rendered as media URLs");
  }
  const baseUrl = ENV.publicMediaBaseUrl.replace(/\/+$/, "");
  return `${baseUrl}/${encodeKey(normalizedKey)}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const config = getStorageConfig();
  const key = normalizeStorageKey(relKey);
  await getClient().send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: typeof data === "string" ? Buffer.from(data) : data,
      ContentType: contentType,
      CacheControl: key.startsWith("public/")
        ? "public, max-age=31536000, immutable"
        : "private, no-store",
    })
  );
  return {
    key,
    url: key.startsWith("public/")
      ? getPublicMediaUrl(key)
      : "",
  };
}

export async function storageGet(
  relKey: string
): Promise<{ key: string; url: string }> {
  const key = normalizeStorageKey(relKey);
  return {
    key,
    url: key.startsWith("public/")
      ? getPublicMediaUrl(key)
      : "",
  };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const config = getStorageConfig();
  const key = normalizeStorageKey(relKey);
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({ Bucket: config.bucket, Key: key }),
    { expiresIn: 300 }
  );
}

export async function storageGetObject(key: string): Promise<GetObjectCommandOutput> {
  const config = getStorageConfig();
  return getClient().send(
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: normalizeStorageKey(key),
    })
  );
}

export async function storageDelete(key: string) {
  const config = getStorageConfig();
  await getClient().send(
    new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: normalizeStorageKey(key),
    })
  );
}

export async function storageHead(key: string) {
  const config = getStorageConfig();
  return getClient().send(new HeadObjectCommand({
    Bucket: config.bucket, Key: normalizeStorageKey(key),
  }));
}

export async function storageList(prefix: string, continuationToken?: string) {
  const config = getStorageConfig();
  return getClient().send(new ListObjectsV2Command({
    Bucket: config.bucket, Prefix: normalizeStorageKey(prefix).replace(/\/?$/, "/"),
    ContinuationToken: continuationToken, MaxKeys: 1000,
  }));
}

export async function checkStorageConnection() {
  const config = getStorageConfig();
  await getClient().send(new HeadBucketCommand({ Bucket: config.bucket }));
}
