import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { listingMedia, listings, storefronts, vendorProfiles } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { getPublicMediaUrl, normalizeStorageKey, storageDelete, storageHead, storageList, storagePut } from "./storage";
import type { getDb } from "./db";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export function mediaKey(value: string): string | null {
  const base = new URL(ENV.publicMediaBaseUrl.replace(/\/?$/, "/"), ENV.appUrl);
  const url = new URL(value, ENV.appUrl);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Use an uploaded image URL." });
  }
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return null;
  try { return normalizeStorageKey(decodeURIComponent(url.pathname.slice(base.pathname.length))); }
  catch { throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid image key." }); }
}

export function isOwnedMediaKey(key: string, vendorId: number) {
  return new RegExp(`^public/vendors/${vendorId}/[a-f0-9-]{36}\\.webp$`).test(key);
}

export async function validateMedia(value: string, vendorId: number, existing: string[] = []) {
  const key = mediaKey(value);
  // Legacy shared/remote assets may only be retained, never adopted or deleted.
  if (!key || !isOwnedMediaKey(key, vendorId)) {
    if (!existing.includes(value) || key?.startsWith("public/vendors/")) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Choose an image uploaded to your vendor account." });
    }
    if (!key) return { url: value, storageKey: null };
  }
  if (!key?.startsWith("public/")) throw new TRPCError({ code: "BAD_REQUEST", message: "Public image required." });
  try {
    const object = await storageHead(key);
    if (isOwnedMediaKey(key, vendorId) && (object.ContentType !== "image/webp" || !object.ContentLength || object.ContentLength > 5 * 1024 * 1024)) {
      throw new Error("Invalid stored image");
    }
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Image is missing or storage is unavailable. Upload it again or retry." });
  }
  return { url: getPublicMediaUrl(key), storageKey: key };
}

export async function lockVendor(tx: Transaction, userId: number) {
  const [profile] = await tx.select().from(vendorProfiles).where(eq(vendorProfiles.userId, userId)).for("update");
  if (!profile) throw new TRPCError({ code: "FORBIDDEN", message: "Vendor profile required." });
  return profile;
}

export async function encodePublicImage(base64: string) {
  if (base64.length > 4 * Math.ceil(5 * 1024 * 1024 / 3)) throw new TRPCError({ code: "BAD_REQUEST", message: "Image must be 5 MB or smaller." });
  if (!base64 || base64.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid image encoding." });
  }
  const buffer = Buffer.from(base64, "base64");
  if (buffer.toString("base64") !== base64) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid image encoding." });
  if (buffer.length > 5 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "Image must be 5 MB or smaller." });
  try {
    const image = sharp(buffer, { limitInputPixels: 25_000_000, animated: true });
    const metadata = await image.metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format || "") || (metadata.pages ?? 1) > 1) throw new Error("Unsupported image");
    return await image.rotate().resize(2000, 2000, { fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Use a valid, non-animated JPEG, PNG or WebP image under 25 megapixels." });
  }
}

export async function uploadVendorImage(vendorId: number, bytes: Buffer) {
  try { return await storagePut(`public/vendors/${vendorId}/${randomUUID()}.webp`, bytes, "image/webp"); }
  catch { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Image could not be stored. Please retry." }); }
}

export async function referencedMedia(tx: Transaction, vendorId: number) {
  const gallery = await tx.select({ key: listingMedia.storageKey }).from(listingMedia)
    .innerJoin(listings, eq(listings.id, listingMedia.listingId)).where(eq(listings.vendorId, vendorId));
  const stores = await tx.select().from(storefronts).where(eq(storefronts.vendorId, vendorId));
  return new Set([...gallery.map(row => row.key), ...stores.flatMap(row => [row.logoStorageKey, row.coverStorageKey])].filter(Boolean));
}

export async function deleteUnreferencedMedia(tx: Transaction, vendorId: number, keys: string[]) {
  const referenced = await referencedMedia(tx, vendorId);
  let deleted = 0;
  for (const key of Array.from(new Set(keys))) {
    if (!isOwnedMediaKey(key, vendorId) || referenced.has(key)) continue;
    await storageDelete(key);
    deleted++;
  }
  return deleted;
}

export async function cleanupVendorOrphans(tx: Transaction, vendorId: number) {
  let token: string | undefined;
  let deleted = 0;
  const cutoff = Date.now() - 24 * 60 * 60_000;
  do {
    const page = await storageList(`public/vendors/${vendorId}`, token);
    deleted += await deleteUnreferencedMedia(tx, vendorId, (page.Contents ?? [])
      .filter(object => object.LastModified && object.LastModified.getTime() < cutoff).map(object => object.Key!));
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return { deleted };
}
