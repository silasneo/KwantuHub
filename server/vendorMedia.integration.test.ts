import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { categories, listingMedia, listings, storefronts, users, vendorProfiles } from "../drizzle/schema";

const objects = vi.hoisted(() => new Map<string, Buffer>());
vi.mock("./storage", async importOriginal => ({
  ...await importOriginal<typeof import("./storage")>(),
  storagePut: async (key: string, body: Buffer) => { objects.set(key, body); return { key, url: `/media/${key}` }; },
  storageHead: async (key: string) => {
    if (!objects.has(key)) throw new Error("NoSuchKey");
    return { ContentType: "image/webp", ContentLength: objects.get(key)!.length };
  },
  storageDelete: async (key: string) => { objects.delete(key); },
  storageList: async () => ({ Contents: [] }),
}));

vi.mock("./accountFlows", async importOriginal => ({
  ...await importOriginal<typeof import("./accountFlows")>(),
  vendorReady: async (_tx: unknown, userId: number) => ({ user: { id: userId, role: "vendor" }, onboarding: { completedAt: new Date() } }),
}));

const testUrl = process.env.MEDIA_TEST_DATABASE_URL;
describe.skipIf(!testUrl)("vendor media transactional MySQL journeys", () => {
  let pool: mysql.Pool;
  let db: ReturnType<typeof drizzle>;
  let router: typeof import("./routers").appRouter;
  let appDb: typeof import("./db");
  let vendorA: { id: number; userId: number };
  let vendorB: { id: number; userId: number };
  let categoryId: number;

  beforeAll(async () => {
    if (!testUrl || !new URL(testUrl).pathname.endsWith("_media_test")) throw new Error("Use a dedicated database ending in _media_test.");
    process.env.DATABASE_URL = testUrl;
    process.env.TURNSTILE_SECRET_KEY = "";
    process.env.TURNSTILE_MODE = "disabled";
    pool = mysql.createPool(testUrl);
    db = drizzle(pool);
    await migrate(db, { migrationsFolder: "drizzle" });
    ({ appRouter: router } = await import("./routers"));
    appDb = await import("./db");
    const [category] = await db.insert(categories).values({ name: "Media test", slug: `media-${randomUUID()}` });
    categoryId = category.insertId;
    async function vendor() {
      const [user] = await db.insert(users).values({
        openId: `media-test-${randomUUID()}`, email: `${randomUUID()}@example.test`,
        role: "vendor", emailVerifiedAt: new Date(),
      });
      const [profile] = await db.insert(vendorProfiles).values({
        userId: user.insertId, businessName: "Media Test", approvalStatus: "approved",
      });
      await db.insert(storefronts).values({ vendorId: profile.insertId, displayName: "Media Test", slug: `media-${randomUUID()}` });
      return { id: profile.insertId, userId: user.insertId };
    }
    vendorA = await vendor();
    vendorB = await vendor();
  }, 60_000);
  afterAll(async () => {
    if (pool) await pool.query("DROP TRIGGER IF EXISTS media_test_reject_insert");
    const connection = appDb ? await appDb.getDb() : null;
    if (connection) await connection.$client.end();
    if (pool) await pool.end();
  });

  function caller(vendor: { userId: number }) {
    return router.createCaller({ user: { id: vendor.userId, role: "vendor", emailVerifiedAt: new Date() }, req: {}, res: {} } as any);
  }
  function fields() {
    return { title: "Media listing", description: "A detailed media listing", categoryId, listingType: "product" as const, status: "draft" as const };
  }
  async function upload(vendor: { userId: number }) {
    const bytes = await sharp({ create: { width: 20, height: 20, channels: 3, background: "blue" } }).png().toBuffer();
    return caller(vendor).vendor.uploadImage({ fileBase64: bytes.toString("base64") });
  }

  it("uploads, saves gallery/storefront references and rejects cross-vendor mutations/adoption", async () => {
    const image = await upload(vendorB);
    const saved = await caller(vendorB).vendor.saveListing({ ...fields(), media: [image.url] });
    const before = await db.select().from(listingMedia).where(eq(listingMedia.listingId, saved.id));
    for (const media of [[], [image.url]]) {
      await expect(caller(vendorA).vendor.saveListing({ ...fields(), id: saved.id, media })).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(await db.select().from(listingMedia).where(eq(listingMedia.listingId, saved.id))).toEqual(before);
    }
    await expect(caller(vendorA).vendor.saveListing({ ...fields(), media: [image.url] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await caller(vendorB).vendor.saveStorefrontMedia({ logoUrl: image.url, coverUrl: null });
    await caller(vendorA).vendor.discardImage({ url: image.url });
    expect(objects.has(image.key)).toBe(true);
    await caller(vendorB).vendor.saveListing({ ...fields(), id: saved.id, media: [] });
    expect(objects.has(image.key)).toBe(true); // Still used by the logo.
    await caller(vendorB).vendor.saveStorefrontMedia({ logoUrl: null, coverUrl: null });
    expect(objects.has(image.key)).toBe(false);
  });

  it("rolls back listing fields and deleted gallery rows if replacement insertion fails", async () => {
    const oldImage = await upload(vendorA);
    const newImage = await upload(vendorA);
    const saved = await caller(vendorA).vendor.saveListing({ ...fields(), media: [oldImage.url] });
    const before = await db.select().from(listingMedia).where(eq(listingMedia.listingId, saved.id));
    await pool.query("CREATE TRIGGER media_test_reject_insert BEFORE INSERT ON listingMedia FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'isolated media rollback test'");
    try {
      await expect(caller(vendorA).vendor.saveListing({ ...fields(), id: saved.id, title: "Changed title", media: [newImage.url] })).rejects.toBeDefined();
    } finally { await pool.query("DROP TRIGGER media_test_reject_insert"); }
    expect(await db.select().from(listingMedia).where(eq(listingMedia.listingId, saved.id))).toEqual(before);
    const [row] = await db.select().from(listings).where(eq(listings.id, saved.id));
    expect(row.title).toBe("Media listing");
    expect(objects.has(oldImage.key)).toBe(true);
    await caller(vendorA).vendor.discardImage({ url: newImage.url });
    expect(objects.has(newImage.key)).toBe(false);
  });

  it("persists listing location/remote flags and archives only owned listings without deleting history", async () => {
    const saved = await caller(vendorA).vendor.saveListing({ ...fields(), location: "Houston", remoteAvailable: true });
    let [row] = await db.select().from(listings).where(eq(listings.id, saved.id));
    expect(row).toMatchObject({ location: "Houston", remoteAvailable: true });
    await expect(caller(vendorB).vendor.archiveListing({ id: saved.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await caller(vendorA).vendor.archiveListing({ id: saved.id })).toMatchObject({ status: "archived" });
    expect(await caller(vendorA).vendor.archiveListing({ id: saved.id })).toMatchObject({ status: "archived" });
    [row] = await db.select().from(listings).where(eq(listings.id, saved.id));
    expect(row.status).toBe("archived");
  });

  it("partially updates profile/storefront settings without clearing omitted values", async () => {
    await db.update(vendorProfiles).set({ description: "Existing description", location: "Austin", serviceArea: "Texas", remoteAvailable: true }).where(eq(vendorProfiles.id, vendorB.id));
    await db.update(storefronts).set({ headline: "Old headline", website: "https://old.example.test" }).where(eq(storefronts.vendorId, vendorB.id));
    await caller(vendorB).vendor.saveProfile({ headline: "New headline" });
    const [profile] = await db.select().from(vendorProfiles).where(eq(vendorProfiles.id, vendorB.id));
    const [store] = await db.select().from(storefronts).where(eq(storefronts.vendorId, vendorB.id));
    expect(profile).toMatchObject({ businessName: "Media Test", description: "Existing description", location: "Austin", serviceArea: "Texas", remoteAvailable: true });
    expect(store).toMatchObject({ headline: "New headline", website: "https://old.example.test" });
  });

  it("preserves suspension during media changes", async () => {
    await db.update(vendorProfiles).set({ approvalStatus: "suspended" }).where(eq(vendorProfiles.id, vendorA.id));
    await expect(upload(vendorA)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller(vendorA).vendor.saveStorefrontMedia({ logoUrl: null, coverUrl: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller(vendorA).vendor.saveListing(fields())).rejects.toMatchObject({ code: "FORBIDDEN" });
    const [profile] = await db.select().from(vendorProfiles).where(eq(vendorProfiles.id, vendorA.id));
    expect(profile.approvalStatus).toBe("suspended");
  });
});
