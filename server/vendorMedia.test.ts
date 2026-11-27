import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

vi.mock("./storage", async importOriginal => ({
  ...await importOriginal<typeof import("./storage")>(),
  storageHead: vi.fn(), storageDelete: vi.fn(), storageList: vi.fn(), storagePut: vi.fn(),
}));
import { storageDelete, storageHead, storageList } from "./storage";
import { cleanupVendorOrphans, deleteUnreferencedMedia, encodePublicImage, isOwnedMediaKey, mediaKey, validateMedia } from "./vendorMedia";

const key = "public/vendors/12/8c6cc968-c75e-43a4-ae2f-b8996be33f07.webp";
const url = `/media/${key}`;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(storageHead).mockResolvedValue({ ContentLength: 100, ContentType: "image/webp" } as never);
});

describe("owned vendor media", () => {
  it("requires uploaded vendor ownership and object existence", async () => {
    expect(await validateMedia(url, 12)).toEqual({ url, storageKey: key });
    await expect(validateMedia(url, 13)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(validateMedia(url, 13, [url])).rejects.toMatchObject({ code: "FORBIDDEN" });
    vi.mocked(storageHead).mockRejectedValueOnce(new Error("NoSuchKey"));
    await expect(validateMedia(url, 12)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it.each(["javascript:alert(1)", "data:image/png;base64,aA==", "//evil.test/media/" + key, "https://evil.test/media/" + key, url + "?x=1"])(
    "rejects unowned or unsafe reference %s", async value => {
      await expect(validateMedia(value, 12)).rejects.toBeDefined();
    }
  );

  it("keeps existing shared seed assets without permitting adoption", async () => {
    const seed = "/media/public/shared/seed.webp";
    expect(await validateMedia(seed, 12, [seed])).toEqual({ url: seed, storageKey: "public/shared/seed.webp" });
    await expect(validateMedia(seed, 12)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const remote = "https://images.example.test/seed.jpg";
    expect(await validateMedia(remote, 12, [remote])).toEqual({ url: remote, storageKey: null });
    await expect(validateMedia(remote, 12)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(isOwnedMediaKey("public/vendors/120/8c6cc968-c75e-43a4-ae2f-b8996be33f07.webp", 12)).toBe(false);
    expect(mediaKey(url)).toBe(key);
  });

  it("decodes signatures and transcodes supported images without metadata", async () => {
    const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: "red" } }).png().toBuffer();
    const result = await encodePublicImage(png.toString("base64"));
    expect((await sharp(result).metadata()).format).toBe("webp");
    await expect(encodePublicImage(Buffer.from("<svg></svg>").toString("base64"))).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(encodePublicImage("not-base64")).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(encodePublicImage(Buffer.alloc(5 * 1024 * 1024 + 1).toString("base64"))).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  function references(gallery: { key: string }[] = [], stores: unknown[] = []) {
    let calls = 0;
    const query: any = { from: () => query, innerJoin: () => query, where: () => Promise.resolve(calls++ === 0 ? gallery : stores) };
    return { select: () => query } as any;
  }

  it("never deletes another vendor, shared seeds, or still-referenced media", async () => {
    expect(await deleteUnreferencedMedia(references([{ key }]), 12, [key, "public/shared/seed.webp"])).toBe(0);
    expect(await deleteUnreferencedMedia(references(), 13, [key])).toBe(0);
    expect(storageDelete).not.toHaveBeenCalled();
    expect(await deleteUnreferencedMedia(references(), 12, [key, key])).toBe(1);
    expect(storageDelete).toHaveBeenCalledOnce();
    expect(storageDelete).toHaveBeenCalledWith(key);
  });

  it("cleans only aged orphan uploads, with retryable storage errors", async () => {
    vi.mocked(storageList).mockResolvedValue({ Contents: [
      { Key: key, LastModified: new Date(Date.now() - 25 * 60 * 60_000) },
      { Key: key.replace("8c6cc968", "8c6cc969"), LastModified: new Date() },
    ] } as never);
    expect(await cleanupVendorOrphans(references(), 12)).toEqual({ deleted: 1 });
    expect(storageDelete).toHaveBeenCalledOnce();
    expect(storageDelete).toHaveBeenCalledWith(key);
    vi.mocked(storageDelete).mockRejectedValueOnce(new Error("Storage down"));
    await expect(cleanupVendorOrphans(references(), 12)).rejects.toThrow("Storage down");
  });
});
