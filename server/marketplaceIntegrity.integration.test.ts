import express, { type Request, type Response } from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  accountOnboarding,
  analyticsEvents,
  authSessions,
  categories,
  conversationReports,
  inquiries,
  listings,
  messages,
  moderationRecords,
  notificationOutbox,
  notifications,
  notificationDeliveries,
  reviews,
  savedSearches,
  storefronts,
  users,
  vendorProfiles,
  vendorVerificationSessions,
  wishlists,
  savedSearchMatches,
  vendorVerificationDecisions,
  vendorVerificationEvidence,
  listingMedia,
  listingViews,
  siteHeroSlides,
  systemSettings,
} from "../drizzle/schema";

vi.mock("./storage", async importOriginal => ({
  ...(await importOriginal<typeof import("./storage")>()),
  storagePut: vi.fn(async (key: string) => ({ key, url: "" })),
  storageDelete: vi.fn(async () => undefined),
  storageGetObject: vi.fn(async () => ({
    ContentType: "application/pdf",
    ContentLength: 10,
    Body: { transformToByteArray: async () => Buffer.from("%PDF-test\n") },
  })),
}));
const testUrl = process.env.MARKETPLACE_TEST_DATABASE_URL;
describe.skipIf(!testUrl)(
  "marketplace integrity with isolated MySQL and HTTP",
  () => {
    let pool: mysql.Pool;
    let db: ReturnType<typeof drizzle>;
    let appDb: typeof import("./db");
    let router: typeof import("./routers").appRouter;
    let publicUser: typeof import("./jwtAuth").publicUser;
    let vendor: { userId: number; id: number; sessionId: number; slug: string };
    let buyerId: number;
    let adminId: number;
    let categoryId: number;
    let listingId: number;
    let origin: string;
    let server: Server;
    const slug = `integrity-${randomUUID()}`;
    const now = new Date();

    async function user(role: "buyer" | "vendor" | "admin") {
      const [row] = await db.insert(users).values({
        openId: randomUUID(),
        name: `${role} fixture`,
        email: `${randomUUID()}@example.test`,
        passwordHash: "private-password-sentinel",
        role,
        emailVerifiedAt: now,
        phone: "+14165550123",
        phoneVerifiedAt: now,
        termsAcceptedAt: now,
        termsVersion: "2026-10-25",
      });
      return row.insertId;
    }
    async function caller(id: number) {
      const [account] = await db.select().from(users).where(eq(users.id, id));
      return router.createCaller({
        user: publicUser(account),
        req: { headers: {}, ip: "127.0.0.1" } as Request,
        res: {} as Response,
      });
    }
    async function listing(
      price = "USD 50-100",
      status: "published" | "hidden" | "archived" = "published"
    ) {
      const [row] = await db.insert(listings).values({
        vendorId: vendor.id,
        categoryId,
        title: "Art listing",
        description: "A detailed cultural art listing",
        slug: randomUUID(),
        listingType: "product",
        priceIndication: price,
        status,
        publishedAt: new Date(),
        location: "Toronto",
        remoteAvailable: false,
      });
      return row.insertId;
    }
    beforeAll(async () => {
      if (!testUrl || !new URL(testUrl).pathname.endsWith("_marketplace_test"))
        throw new Error(
          "Use a dedicated database ending in _marketplace_test."
        );
      process.env.DATABASE_URL = testUrl;
      process.env.TURNSTILE_SECRET_KEY = "";
      process.env.TURNSTILE_MODE = "disabled";
      pool = mysql.createPool(testUrl);
      db = drizzle(pool);
      await migrate(db, { migrationsFolder: "drizzle" });
      ({ appRouter: router } = await import("./routers"));
      appDb = await import("./db");
      ({ publicUser } = await import("./jwtAuth"));
      const { encryptOtp } = await import("./contactVerification");
      const { TERMS_VERSION } = await import("./accountPolicy");
      const userId = await user("vendor");
      buyerId = await user("buyer");
      adminId = await user("admin");
      await db
        .update(users)
        .set({ termsVersion: TERMS_VERSION })
        .where(eq(users.id, userId));
      const [profile] = await db.insert(vendorProfiles).values({
        userId,
        businessName: "Eligible art vendor",
        approvalStatus: "approved",
        description: "Original description",
        location: "Toronto",
        identityStatus: "verified",
        identityVerifiedAt: now,
        contactEmail: "business@example.test",
        phone: "+14165550123",
        whatsapp: "+14165550124",
        imessage: "messages@example.test",
        instagram: "@art",
        website: "https://example.test",
      });
      const [kyc] = await db.insert(vendorVerificationSessions).values({
        userId,
        vendorId: profile.insertId,
        provider: "didit",
        status: "approved",
        sessionType: "combined_na_vendor",
        countryCode: "CA",
        expiresAt: new Date(Date.now() + 365 * 86_400_000),
      });
      vendor = {
        userId,
        id: profile.insertId,
        sessionId: kyc.insertId,
        slug: randomUUID(),
      };
      await db.insert(accountOnboarding).values({
        userId,
        countryCode: "CA",
        kycSessionId: kyc.insertId,
        kycVerifiedAt: now,
        completedAt: now,
        identityCiphertext: encryptOtp(
          JSON.stringify({
            firstName: "Owner",
            lastName: "Fixture",
            dateOfBirth: "1990-01-01",
            countryCode: "CA",
            city: "Toronto",
            address: "1 Test Street",
          })
        ),
      });
      const [store] = await db
        .insert(storefronts)
        .values({
          vendorId: vendor.id,
          displayName: "Art vendor",
          slug: vendor.slug,
        });
      const [cat] = await db.insert(categories).values({ name: "Art", slug });
      categoryId = cat.insertId;
      listingId = await listing();
      await db
        .update(listings)
        .set({ storefrontId: store.insertId })
        .where(eq(listings.id, listingId));
      const { apiV1Router } = await import("./apiV1Router");
      const { registerSeoEndpoints } = await import("./seoService");
      const app = express();
      app.use(express.json());
      app.use("/api/v1", apiV1Router);
      registerSeoEndpoints(app);
      const { registerStorageProxy } = await import("./_core/storageProxy");
      registerStorageProxy(app);
      server = createServer(app);
      await new Promise<void>(resolve =>
        server.listen(0, "127.0.0.1", resolve)
      );
      origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    }, 60_000);
    afterAll(async () => {
      if (server)
        await new Promise<void>((resolve, reject) =>
          server.close(error => (error ? reject(error) : resolve()))
        );
      if (pool)
        await pool.query("DROP TRIGGER IF EXISTS integrity_reject_outbox");
      const connection = appDb ? await appDb.getDb() : null;
      if (connection) await connection.$client.end();
      if (pool) await pool.end();
    });

    it("applies the same eligibility to every public collection, detail, contacts, reviews and sitemap", async () => {
      const publicCaller = router.createCaller({
        user: null,
        req: {} as Request,
        res: {} as Response,
      });
      const assertVisible = async (visible: boolean) => {
        expect(
          (await appDb.searchListings({ category: slug })).items.some(
            item => item.id === listingId
          )
        ).toBe(visible);
        const [row] = await db
          .select()
          .from(listings)
          .where(eq(listings.id, listingId));
        expect(Boolean(await appDb.getListingBySlug(row.slug))).toBe(visible);
        expect(Boolean(await appDb.getStorefrontBySlug(vendor.slug))).toBe(
          visible
        );
        expect(
          (await appDb.getAllVendors()).items.some(item => item.id === vendor.id)
        ).toBe(visible);
        const contacts = publicCaller.marketplace.revealContact({ listingId });
        if (visible)
          expect((await contacts).channels.length).toBeGreaterThan(0);
        else
          await expect(contacts).rejects.toMatchObject({ code: "NOT_FOUND" });
        const rest = await (await fetch(`${origin}/api/v1/listings`)).json();
        expect(
          rest.data.items.some(
            (item: { id: number }) => item.id === listingId
          )
        ).toBe(visible);
        const vendors = await (await fetch(`${origin}/api/v1/vendors`)).json();
        expect(
          vendors.data.items.some((item: { id: number }) => item.id === vendor.id)
        ).toBe(visible);
        expect(
          (await (await fetch(`${origin}/sitemap.xml`)).text()).includes(
            `/listings/${row.slug}`
          )
        ).toBe(visible);
      };
      await assertVisible(true);
      for (const status of ["suspended", "rejected"] as const) {
        await db
          .update(vendorProfiles)
          .set({ approvalStatus: status })
          .where(eq(vendorProfiles.id, vendor.id));
        await assertVisible(false);
      }
      await db
        .update(vendorProfiles)
        .set({ approvalStatus: "approved" })
        .where(eq(vendorProfiles.id, vendor.id));
      await db
        .update(users)
        .set({ status: "suspended" })
        .where(eq(users.id, vendor.userId));
      await assertVisible(false);
      await db
        .update(users)
        .set({ status: "active" })
        .where(eq(users.id, vendor.userId));
      await db
        .update(accountOnboarding)
        .set({ completedAt: null })
        .where(eq(accountOnboarding.userId, vendor.userId));
      await assertVisible(false);
      await db
        .update(accountOnboarding)
        .set({ completedAt: now })
        .where(eq(accountOnboarding.userId, vendor.userId));
      await db
        .update(vendorVerificationSessions)
        .set({ status: "declined" })
        .where(eq(vendorVerificationSessions.id, vendor.sessionId));
      await assertVisible(false);
      await db
        .update(vendorVerificationSessions)
        .set({ status: "approved" })
        .where(eq(vendorVerificationSessions.id, vendor.sessionId));
      await assertVisible(true);
    });

    it("hides hidden/archived listings and inactive categories but preserves owner/admin preview", async () => {
      const hiddenId = await listing("USD 20", "hidden");
      const [hidden] = await db
        .select()
        .from(listings)
        .where(eq(listings.id, hiddenId));
      const owner = await caller(vendor.userId);
      const admin = await caller(adminId);
      const buyer = await caller(buyerId);
      await expect(
        owner.marketplace.getListing({ slug: hidden.slug })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(
        (
          await owner.marketplace.getListing({
            slug: hidden.slug,
            preview: true,
          })
        ).id
      ).toBe(hiddenId);
      expect(
        (
          await admin.marketplace.getListing({
            slug: hidden.slug,
            preview: true,
          })
        ).id
      ).toBe(hiddenId);
      await expect(
        buyer.marketplace.getListing({ slug: hidden.slug, preview: true })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await db
        .update(categories)
        .set({ isActive: false })
        .where(eq(categories.id, categoryId));
      expect(await appDb.getListingBySlug(hidden.slug)).toBeNull();
      expect(
        (await appDb.getRelatedListings(hiddenId, categoryId)).length
      ).toBe(0);
      await db
        .update(categories)
        .set({ isActive: true })
        .where(eq(categories.id, categoryId));
      await owner.vendor.archiveListing({ id: hiddenId });
      expect(
        (await owner.vendor.listings()).items.find(item => item.id === hiddenId)
          ?.status
      ).toBe("archived");
      await expect(
        buyer.vendor.archiveListing({ id: hiddenId })
      ).rejects.toBeDefined();
    });

    it("serializes duplicate inquiry retries and atomically writes initial message, outbox and analytics", async () => {
      const buyer = await caller(buyerId);
      const input = {
        listingId,
        subject: "Art inquiry",
        message: "Is this available?",
        clientRequestId: randomUUID(),
      };
      const results = await Promise.all([
        buyer.buyer.createInquiry(input),
        buyer.buyer.createInquiry(input),
      ]);
      expect(results[0].id).toBe(results[1].id);
      expect(
        await db
          .select()
          .from(messages)
          .where(eq(messages.inquiryId, results[0].id))
      ).toHaveLength(1);
      expect(
        await db
          .select()
          .from(notificationOutbox)
          .where(eq(notificationOutbox.entityId, results[0].id))
      ).toHaveLength(1);
      expect(
        await db
          .select()
          .from(analyticsEvents)
          .where(
            and(
              eq(analyticsEvents.eventType, "submit_inquiry"),
              eq(analyticsEvents.listingId, listingId)
            )
          )
      ).toHaveLength(1);
      await expect(
        buyer.buyer.createInquiry({ ...input, message: "Different payload" })
      ).rejects.toMatchObject({ code: "CONFLICT" });
      const owner = await caller(vendor.userId);
      await expect(
        owner.buyer.createInquiry({ ...input, clientRequestId: randomUUID() })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      const unavailable = await listing("USD 99", "hidden");
      await expect(
        buyer.buyer.createInquiry({
          ...input,
          listingId: unavailable,
          clientRequestId: randomUUID(),
        })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("rolls back all inquiry writes on outbox failure", async () => {
      const target = await listing();
      const buyer = await caller(buyerId);
      const beforeMessages = (await db.select().from(messages)).length;
      await pool.query(
        "CREATE TRIGGER integrity_reject_outbox BEFORE INSERT ON notificationOutbox FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'isolated outbox failure'"
      );
      try {
        await expect(
          buyer.buyer.createInquiry({
            listingId: target,
            subject: "Rollback",
            message: "Please test rollback",
          })
        ).rejects.toBeDefined();
      } finally {
        await pool.query("DROP TRIGGER integrity_reject_outbox");
      }
      expect(
        await db.select().from(inquiries).where(eq(inquiries.listingId, target))
      ).toHaveLength(0);
      expect(
        await db
          .select()
          .from(analyticsEvents)
          .where(eq(analyticsEvents.listingId, target))
      ).toHaveLength(0);
      expect((await db.select().from(messages)).length).toBe(beforeMessages);
    });

    it("separates moderation restrictions from participant archive and restores the prior closed state", async () => {
      const buyer = await caller(buyerId);
      const owner = await caller(vendor.userId);
      const admin = await caller(adminId);
      const target = await listing();
      const inquiry = await buyer.buyer.createInquiry({
        listingId: target,
        subject: "Moderation",
        message: "Moderation lifecycle",
      });
      await buyer.buyer.closeInquiry({ inquiryId: inquiry.id });
      await buyer.buyer.archiveInquiry({ inquiryId: inquiry.id });
      await buyer.buyer.unarchiveInquiry({ inquiryId: inquiry.id });
      expect(
        (
          await db.select().from(inquiries).where(eq(inquiries.id, inquiry.id))
        )[0].status
      ).toBe("closed");
      const [report] = await db
        .insert(conversationReports)
        .values({
          inquiryId: inquiry.id,
          reporterId: buyerId,
          reason: "Test report",
        });
      await admin.admin.updateConversationReport({
        reportId: report.insertId,
        status: "actioned",
        suspendConversation: true,
      });
      for (const participant of [buyer.buyer, owner.vendor]) {
        await expect(
          participant.reopenInquiry({ inquiryId: inquiry.id })
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(
          participant.archiveInquiry({ inquiryId: inquiry.id })
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(
          participant.unarchiveInquiry({ inquiryId: inquiry.id })
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(
          participant.replyInquiry({
            inquiryId: inquiry.id,
            message: "Bypass attempt",
          })
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
      }
      await admin.admin.updateConversationReport({
        reportId: report.insertId,
        status: "reviewed",
        resumeConversation: true,
      });
      expect(
        (
          await db.select().from(inquiries).where(eq(inquiries.id, inquiry.id))
        )[0]
      ).toMatchObject({ status: "closed", moderatorSuspendedAt: null });
      await owner.vendor.reopenInquiry({ inquiryId: inquiry.id });
      await buyer.buyer.replyInquiry({
        inquiryId: inquiry.id,
        message: "Allowed again",
      });
    });

    it("serializes wishlist toggles and concurrent review creation with a database uniqueness constraint", async () => {
      const buyer = await caller(buyerId);
      await Promise.all([
        buyer.buyer.toggleWishlist({ listingId }),
        buyer.buyer.toggleWishlist({ listingId }),
      ]);
      expect(
        await db
          .select()
          .from(wishlists)
          .where(
            and(
              eq(wishlists.buyerId, buyerId),
              eq(wishlists.listingId, listingId)
            )
          )
      ).toHaveLength(0);
      const results = await Promise.allSettled([
        buyer.buyer.submitReview({
          listingId,
          rating: 5,
          comment: "Great work",
        }),
        buyer.buyer.submitReview({
          listingId,
          rating: 4,
          comment: "Very nice",
        }),
      ]);
      expect(results.filter(item => item.status === "fulfilled")).toHaveLength(
        1
      );
      const rows = await db
        .select()
        .from(reviews)
        .where(
          and(eq(reviews.buyerId, buyerId), eq(reviews.listingId, listingId))
        );
      expect(rows).toHaveLength(1);
      await expect(
        db
          .insert(reviews)
          .values({ buyerId, listingId, vendorId: vendor.id, rating: 5 })
      ).rejects.toBeDefined();
    });

    it("returns explicit safe projections through real admin/buyer REST responses", async () => {
      const { signToken } = await import("./jwtAuth");
      for (const [userId, role, operations] of [
        [
          adminId,
          "admin",
          [
            "admin/pendingVendors",
            "admin/reviews",
            "admin/conversationReports",
            "admin/verificationSessions",
            "admin/conversationMessages?inquiryId=1",
          ],
        ],
        [buyerId, "buyer", ["buyer/reviews"]],
      ] as const) {
        const [account] = await db
          .select()
          .from(users)
          .where(eq(users.id, userId));
        const sessionId = randomBytes(32).toString("hex");
        await db
          .insert(authSessions)
          .values({
            id: createHash("sha256").update(sessionId).digest("hex"),
            userId,
            expiresAt: new Date(Date.now() + 60_000),
          });
        const token = await signToken({
          userId,
          email: account.email!,
          role,
          sessionId,
        });
        for (const operation of operations) {
          const response = await fetch(`${origin}/api/v1/${operation}`, {
            headers: { cookie: `kwantu_jwt=${token}` },
          });
          expect(response.status).toBe(200);
          const body = await response.text();
          expect(body).not.toMatch(
            /passwordHash|private-password-sentinel|identityCiphertext|codeCiphertext/
          );
          if (role === "buyer")
            expect(body).not.toMatch(
              /contactEmail|reviewerNotes|verificationBadgeSummary/
            );
        }
      }
    });

    it("rejects nonexistent admin mutation IDs without phantom audit records", async () => {
      const admin = await caller(adminId);
      const before = (await db.select().from(moderationRecords)).length;
      await expect(
        admin.admin.updateReviewStatus({
          reviewId: 2_000_000_000,
          status: "approved",
        })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(
        admin.admin.updateListingStatus({
          listingId: 2_000_000_000,
          status: "hidden",
        })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(
        admin.admin.updateDispute({
          disputeId: 2_000_000_000,
          status: "resolved",
        })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(
        admin.admin.saveCategory({
          id: 2_000_000_000,
          name: "Missing",
          slug: "missing",
        })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect((await db.select().from(moderationRecords)).length).toBe(before);
    });

    it("rolls back a moderation decision and audit when its outbox cannot be committed", async () => {
      const admin = await caller(adminId);
      const [review] = await db
        .select()
        .from(reviews)
        .where(eq(reviews.buyerId, buyerId))
        .limit(1);
      const auditCount = (await db.select().from(moderationRecords)).length;
      await pool.query(
        "CREATE TRIGGER integrity_reject_outbox BEFORE INSERT ON notificationOutbox FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'isolated moderation outbox failure'"
      );
      try {
        await expect(
          admin.admin.updateReviewStatus({
            reviewId: review.id,
            status: "approved",
          })
        ).rejects.toBeDefined();
      } finally {
        await pool.query("DROP TRIGGER integrity_reject_outbox");
      }
      expect(
        (await db.select().from(reviews).where(eq(reviews.id, review.id)))[0]
          .status
      ).toBe("pending");
      expect((await db.select().from(moderationRecords)).length).toBe(
        auditCount
      );
    });

    it("clears every vendor contact, reads back nulls and preserves business/onboarding fields", async () => {
      const owner = await caller(vendor.userId);
      await owner.vendor.saveProfile({
        contactEmail: null,
        phone: null,
        whatsapp: null,
        imessage: null,
        instagram: null,
        website: null,
        headline: "New headline",
        businessName: "Renamed business",
        location: "Ottawa",
        description: "Updated business description",
      });
      const profile = await owner.vendor.getProfile();
      expect(profile).toMatchObject({
        businessName: "Renamed business",
        location: "Ottawa",
        approvalStatus: "approved",
        contactEmail: null,
        phone: null,
        whatsapp: null,
        imessage: null,
        instagram: null,
        website: null,
        storefront: {
          headline: "New headline",
          displayName: "Renamed business",
          location: "Ottawa",
        },
      });
      const publicCaller = router.createCaller({
        user: null,
        req: { headers: {}, ip: "127.0.0.2" } as Request,
        res: {} as Response,
      });
      expect(
        (await publicCaller.marketplace.revealContact({ listingId })).channels
      ).toEqual([]);
      expect(
        (await appDb.getStorefrontBySlug(vendor.slug))?.vendor
      ).not.toHaveProperty("contactEmail");
      const contactResponse = await fetch(
        `${origin}/api/v1/marketplace/revealContact`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ listingId }),
        }
      );
      expect(contactResponse.status).toBe(200);
      expect((await contactResponse.json()).data.channels).toEqual([]);
      const storefrontResponse = await fetch(
        `${origin}/api/v1/vendors/${vendor.slug}`
      );
      expect(storefrontResponse.status).toBe(200);
      expect((await storefrontResponse.json()).data.vendor).not.toHaveProperty(
        "contactEmail"
      );
      expect(profile?.onboardingCompletedAt).toBeTruthy();
    });

    it("persists decimal search bounds and rejects reversed bounds or missing categories", async () => {
      const buyer = await caller(buyerId);
      const saved = await buyer.buyer.createSavedSearch({
        name: "Decimal range",
        minPrice: 10.25,
        maxPrice: 20.75,
        currency: "CAD",
      });
      const [row] = await db
        .select()
        .from(savedSearches)
        .where(eq(savedSearches.id, saved.id));
      expect(row).toMatchObject({
        minPrice: "10.25",
        maxPrice: "20.75",
        currency: "CAD",
      });
      await expect(
        buyer.buyer.createSavedSearch({
          name: "Invalid range",
          minPrice: 100,
          maxPrice: 10,
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(
        buyer.marketplace.search({ category: "nonexistent" })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("matches SQL price parsing to discovery semantics and never treats 50-100 as 50100", async () => {
      const { parsePriceIndication } = await import(
        "../shared/discoveryFilters"
      );
      const { numericPriceExpressions } = await import("./discoverySql");
      for (const text of [
        "USD 10",
        "$50-100",
        "USD 50-100",
        "CAD 10.25-20.75",
        "50.25",
        "USD 1,000",
        "USD 100-50",
        "From 50",
        "Negotiable",
        "50/hour",
        "MXN 200",
        "USD NaN",
        "USD 50 CAD",
        "-10",
        "1.234",
        "CAD $30",
        "$10 - $20",
      ]) {
        const id = await listing(text);
        const parsed = parsePriceIndication(text);
        const expr = numericPriceExpressions();
        const [actual] = await db
          .select({ min: expr.min, max: expr.max, currency: expr.currency })
          .from(listings)
          .where(eq(listings.id, id));
        expect(actual.currency, text).toBe(parsed?.currency ?? null);
        expect(actual.min === null ? null : Number(actual.min), text).toBe(
          parsed?.min ?? null
        );
        expect(actual.max === null ? null : Number(actual.max), text).toBe(
          parsed?.max ?? null
        );
        await db
          .update(listings)
          .set({ status: "archived" })
          .where(eq(listings.id, id));
      }
      const low = await listing("USD 10");
      const range = await listing("USD 50-100");
      const cad = await listing("CAD 75");
      const match = await appDb.searchListings({
        category: slug,
        minPrice: 75,
        maxPrice: 80,
        currency: "USD",
      });
      expect(match.items.some(item => item.id === range)).toBe(true);
      expect(match.items.some(item => item.id === low || item.id === cad)).toBe(
        false
      );
      const expensive = await appDb.searchListings({
        category: slug,
        minPrice: 1000,
      });
      expect(
        expensive.items.some(item => item.id === range || item.id === low)
      ).toBe(false);
      const oldest = await appDb.searchListings({
        category: slug,
        sort: "oldest",
        pageSize: 1,
      });
      const next = await appDb.searchListings({
        category: slug,
        sort: "oldest",
        pageSize: 1,
        page: 2,
      });
      expect(oldest.items[0].id).not.toBe(next.items[0].id);
      expect(oldest.items[0].id).toBeLessThan(next.items[0].id);
    });

    it("uses the same numeric bounds for real saved-search match rows as discovery", async () => {
      const buyer = await caller(buyerId);
      const { processListingSavedSearchMatches } = await import(
        "./savedSearchService"
      );
      const excluded = await buyer.buyer.createSavedSearch({
        name: "Expensive only",
        minPrice: 1000,
        currency: "USD",
        alertFrequency: "immediate",
      });
      const included = await buyer.buyer.createSavedSearch({
        name: "Low price",
        minPrice: 5.25,
        maxPrice: 10.75,
        currency: "USD",
        alertFrequency: "immediate",
      });
      const target = await listing("USD 10");
      await processListingSavedSearchMatches(target);
      expect(
        await db
          .select()
          .from(savedSearchMatches)
          .where(
            and(
              eq(savedSearchMatches.savedSearchId, excluded.id),
              eq(savedSearchMatches.listingId, target)
            )
          )
      ).toHaveLength(0);
      expect(
        await db
          .select()
          .from(savedSearchMatches)
          .where(
            and(
              eq(savedSearchMatches.savedSearchId, included.id),
              eq(savedSearchMatches.listingId, target)
            )
          )
      ).toHaveLength(1);
    });

    it("queues daily digests and retries an immediate match atomically after outbox failure", async () => {
      const buyer = await caller(buyerId);
      const { processListingSavedSearchMatches, dispatchDailyDigest, dispatchImmediateMatch } = await import("./savedSearchService");
      const daily = await buyer.buyer.createSavedSearch({ name: "Digest fixture", query: "Art", alertFrequency: "daily" });
      const first = await listing("USD 12");
      const second = await listing("USD 13");
      await processListingSavedSearchMatches(first);
      await processListingSavedSearchMatches(second);
      expect(await dispatchDailyDigest(db, daily.id)).toBe(true);
      expect(await dispatchDailyDigest(db, daily.id)).toBe(false);
      const digest = await db.select().from(notificationOutbox).where(and(
        eq(notificationOutbox.eventType, "SAVED_SEARCH_DIGEST"), eq(notificationOutbox.entityId, daily.id)
      ));
      expect(digest).toHaveLength(1);
      expect(digest[0].payload).toMatchObject({ matchCount: 2, listings: expect.arrayContaining([expect.objectContaining({ listingId: first }), expect.objectContaining({ listingId: second })]) });
      const immediate = await buyer.buyer.createSavedSearch({ name: "Immediate rollback fixture", query: "Art", alertFrequency: "immediate" });
      const target = await listing("USD 15");
      await pool.query("CREATE TRIGGER integrity_reject_outbox BEFORE INSERT ON notificationOutbox FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'isolated alert failure'");
      try {
        await expect(processListingSavedSearchMatches(target)).rejects.toBeDefined();
      } finally { await pool.query("DROP TRIGGER integrity_reject_outbox"); }
      const [match] = await db.select().from(savedSearchMatches).where(and(eq(savedSearchMatches.savedSearchId, immediate.id), eq(savedSearchMatches.listingId, target)));
      expect(match.alertDispatched).toBe(false);
      expect(await dispatchImmediateMatch(db, immediate.id, target)).toBe(true);
      expect(await dispatchImmediateMatch(db, immediate.id, target)).toBe(false);
      expect(await db.select().from(notificationOutbox).where(eq(notificationOutbox.idempotencyKey, `saved_search_match:${immediate.id}:${target}`))).toHaveLength(1);
    });

    it("durably matches administrator publications and exposes opt-in saved-search email settings", async () => {
      const buyer = await caller(buyerId);
      const admin = await caller(adminId);
      expect((await buyer.notifications.updatePreferences({ emailSavedSearches: true })).emailSavedSearches).toBe(true);
      const saved = await buyer.buyer.createSavedSearch({ name: "Publication fixture", query: "Art", alertFrequency: "immediate" });
      const target = await listing("USD 15", "hidden");
      await admin.admin.updateListingStatus({ listingId: target, status: "published" });
      const [job] = await db.select().from(notificationOutbox).where(and(eq(notificationOutbox.eventType, "LISTING_PUBLISHED"), eq(notificationOutbox.entityId, target)));
      expect(job.status).toBe("queued");
      const { processNotificationOutboxBatch } = await import("./notificationWorker");
      await processNotificationOutboxBatch(db, { limit: 500 });
      expect((await db.select().from(notificationOutbox).where(eq(notificationOutbox.id, job.id)))[0].status).toBe("completed");
      expect(await db.select().from(savedSearchMatches).where(and(eq(savedSearchMatches.savedSearchId, saved.id), eq(savedSearchMatches.listingId, target)))).toHaveLength(1);
    });

    it("preserves account identity/country during residence-only starts and accepts multiple private documents", async () => {
      const owner = await caller(vendor.userId);
      const before = (
        await db
          .select()
          .from(vendorProfiles)
          .where(eq(vendorProfiles.id, vendor.id))
      )[0];
      const created = await owner.vendor.startVerificationSession({
        provider: "manual",
        sessionType: "proof_of_residence",
        countryCode: "CA",
        consentGiven: true,
      });
      const profile = (
        await db
          .select()
          .from(vendorProfiles)
          .where(eq(vendorProfiles.id, vendor.id))
      )[0];
      expect(profile.identityStatus).toBe(before.identityStatus);
      expect(profile.identityVerifiedAt).toEqual(before.identityVerifiedAt);
      expect(profile.residenceCountry).toBe(before.residenceCountry);
      await expect(
        owner.vendor.startVerificationSession({
          provider: "manual",
          sessionType: "proof_of_residence",
          countryCode: "US",
          consentGiven: true,
        })
      ).rejects.toMatchObject({ code: "CONFLICT" });
      const upload = {
        sessionId: created.sessionId,
        evidenceType: "utility_bill" as const,
        filename: "fixture.pdf",
        fileBase64: Buffer.from("%PDF-test\n").toString("base64"),
      };
      await owner.vendor.submitManualEvidence(upload);
      await owner.vendor.submitManualEvidence({
        ...upload,
        evidenceType: "bank_statement",
      });
      expect(
        (await owner.vendor.verificationStatus()).sessions.find(
          item => item.id === created.sessionId
        )?.canUpload
      ).toBe(true);
      const admin = await caller(adminId);
      await admin.admin.reviewVerificationSession({
        sessionId: created.sessionId,
        action: "approve",
        reviewerNotes:
          "Both current statements establish the Canadian address.",
      });
      const decided = (
        await db
          .select()
          .from(vendorProfiles)
          .where(eq(vendorProfiles.id, vendor.id))
      )[0];
      expect(decided.identityVerifiedAt).toEqual(before.identityVerifiedAt);
      expect(decided.residenceStatus).toBe("verified");
      expect(
        await db
          .select()
          .from(vendorVerificationDecisions)
          .where(eq(vendorVerificationDecisions.sessionId, created.sessionId))
      ).toMatchObject([{ checkType: "residence", outcome: "verified" }]);
      await expect(
        admin.admin.reviewVerificationSession({
          sessionId: created.sessionId,
          action: "decline",
          declinedReason: "Too late",
        })
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      await expect(
        owner.vendor.submitManualEvidence(upload)
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    });

    it("requires suitable evidence and keeps manual identity decisions independent from residence", async () => {
      const legacyUser = await user("vendor");
      const [legacyProfile] = await db
        .insert(vendorProfiles)
        .values({ userId: legacyUser, businessName: "Manual legacy fixture" });
      const owner = await caller(legacyUser);
      const admin = await caller(adminId);
      const created = await owner.vendor.startVerificationSession({
        provider: "manual",
        sessionType: "combined_na_vendor",
        countryCode: "CA",
        consentGiven: true,
      });
      await expect(
        admin.admin.reviewVerificationSession({
          sessionId: created.sessionId,
          action: "approve",
          reviewerNotes: "No documents yet",
          checkType: "identity",
        })
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      await owner.vendor.submitManualEvidence({
        sessionId: created.sessionId,
        evidenceType: "government_id",
        filename: "id.pdf",
        fileBase64: Buffer.from("%PDF-test\n").toString("base64"),
      });
      await admin.admin.reviewVerificationSession({
        sessionId: created.sessionId,
        action: "approve",
        checkType: "identity",
        reviewerNotes: "Government ID inspected.",
      });
      expect(
        (
          await db
            .select()
            .from(vendorProfiles)
            .where(eq(vendorProfiles.id, legacyProfile.insertId))
        )[0]
      ).toMatchObject({
        identityStatus: "verified",
        residenceStatus: "pending",
      });
      await admin.admin.reviewVerificationSession({
        sessionId: created.sessionId,
        action: "decline",
        checkType: "residence",
        declinedReason: "Provide a residential statement, not just ID.",
      });
      expect(
        (
          await db
            .select()
            .from(vendorProfiles)
            .where(eq(vendorProfiles.id, legacyProfile.insertId))
        )[0]
      ).toMatchObject({
        identityStatus: "verified",
        residenceStatus: "rejected",
      });
      const status = await owner.vendor.verificationStatus();
      expect(status.sessions[0].declinedReason).toContain(
        "residential statement"
      );
      expect(status.badges.identityVerified).toBe(true);
      expect(status.badges.residenceVerified).toBe(false);
      const resubmission = await owner.vendor.startVerificationSession({
        provider: "manual",
        sessionType: "proof_of_residence",
        countryCode: "CA",
        consentGiven: true,
      });
      expect(resubmission.sessionId).not.toBe(created.sessionId);
    });

    it("rejects hosted manual overrides, expired sessions, and rolls back decisions if audit fails", async () => {
      const admin = await caller(adminId);
      await expect(
        admin.admin.reviewVerificationSession({
          sessionId: vendor.sessionId,
          action: "approve",
          reviewerNotes: "Cannot override signed onboarding",
        })
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      const [session] = await db.insert(vendorVerificationSessions).values({
        userId: vendor.userId,
        vendorId: vendor.id,
        provider: "manual",
        sessionType: "proof_of_residence",
        status: "in_review",
        countryCode: "CA",
        expiresAt: new Date(Date.now() + 86_400_000),
      });
      await db.insert(vendorVerificationEvidence).values({
        sessionId: session.insertId,
        evidenceType: "utility_bill",
        fileStoragePath: "private/verification/fixture.pdf",
        retentionExpiresAt: new Date(Date.now() + 86_400_000),
      });
      await pool.query(
        "CREATE TRIGGER integrity_reject_audit BEFORE INSERT ON moderationRecords FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'isolated audit failure'"
      );
      try {
        await expect(
          admin.admin.reviewVerificationSession({
            sessionId: session.insertId,
            action: "approve",
            reviewerNotes: "Canadian residence evidence inspected",
          })
        ).rejects.toBeDefined();
      } finally {
        await pool.query("DROP TRIGGER integrity_reject_audit");
      }
      expect(
        await db
          .select()
          .from(vendorVerificationDecisions)
          .where(eq(vendorVerificationDecisions.sessionId, session.insertId))
      ).toHaveLength(0);
      expect(
        (
          await db
            .select()
            .from(vendorVerificationSessions)
            .where(eq(vendorVerificationSessions.id, session.insertId))
        )[0].status
      ).toBe("in_review");
      await db
        .update(vendorVerificationSessions)
        .set({ expiresAt: new Date("2020-01-01") })
        .where(eq(vendorVerificationSessions.id, session.insertId));
      await expect(
        admin.admin.reviewVerificationSession({
          sessionId: session.insertId,
          action: "decline",
          declinedReason: "Expired",
        })
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    });

    it("serializes concurrent per-check decisions without losing completion or duplicating audit", async () => {
      const legacyUser = await user("vendor");
      const [profile] = await db
        .insert(vendorProfiles)
        .values({
          userId: legacyUser,
          businessName: "Concurrent verification fixture",
        });
      const owner = await caller(legacyUser);
      const admin = await caller(adminId);
      const created = await owner.vendor.startVerificationSession({
        provider: "manual",
        sessionType: "combined_na_vendor",
        countryCode: "CA",
        consentGiven: true,
      });
      for (const evidenceType of ["government_id", "utility_bill"] as const) {
        await owner.vendor.submitManualEvidence({
          sessionId: created.sessionId,
          evidenceType,
          filename: "document.pdf",
          fileBase64: Buffer.from("%PDF-test\n").toString("base64"),
        });
      }
      await Promise.all(
        (["identity", "residence"] as const).map(checkType =>
          admin.admin.reviewVerificationSession({
            sessionId: created.sessionId,
            action: "approve",
            checkType,
            reviewerNotes: `${checkType} evidence inspected.`,
          })
        )
      );
      expect(
        (
          await db
            .select()
            .from(vendorVerificationSessions)
            .where(eq(vendorVerificationSessions.id, created.sessionId))
        )[0].status
      ).toBe("approved");
      expect(
        await db
          .select()
          .from(vendorVerificationDecisions)
          .where(eq(vendorVerificationDecisions.sessionId, created.sessionId))
      ).toHaveLength(2);
      expect(
        (
          await db
            .select()
            .from(vendorProfiles)
            .where(eq(vendorProfiles.id, profile.insertId))
        )[0]
      ).toMatchObject({
        identityStatus: "verified",
        residenceStatus: "verified",
      });
    });

    it("rejects superseded checks without allowing unrelated newer checks to revoke residence", async () => {
      const legacyUser = await user("vendor");
      const [profile] = await db.insert(vendorProfiles).values({ userId: legacyUser, businessName: "Ordered checks fixture" });
      const [older] = await db.insert(vendorVerificationSessions).values({
        userId: legacyUser, vendorId: profile.insertId, provider: "manual", sessionType: "proof_of_residence",
        status: "in_review", countryCode: "CA", expiresAt: new Date(Date.now() + 86_400_000),
      });
      await db.insert(vendorVerificationEvidence).values({
        sessionId: older.insertId, evidenceType: "utility_bill", fileStoragePath: "private/verification/ordered.pdf",
        retentionExpiresAt: new Date(Date.now() + 86_400_000),
      });
      const [newer] = await db.insert(vendorVerificationSessions).values({
        userId: legacyUser, vendorId: profile.insertId, provider: "didit", sessionType: "proof_of_residence",
        status: "approved", countryCode: "CA", expiresAt: new Date(Date.now() + 86_400_000),
      });
      const admin = await caller(adminId);
      await expect(admin.admin.reviewVerificationSession({
        sessionId: older.insertId, action: "approve", reviewerNotes: "Current residential bill reviewed.",
      })).rejects.toMatchObject({ code: "CONFLICT" });
      await db.update(vendorVerificationSessions).set({ sessionType: "identity_document" }).where(eq(vendorVerificationSessions.id, newer.insertId));
      await admin.admin.reviewVerificationSession({
        sessionId: older.insertId, action: "approve", reviewerNotes: "Current residential bill reviewed.",
      });
      expect((await db.select().from(vendorProfiles).where(eq(vendorProfiles.id, profile.insertId)))[0])
        .toMatchObject({ identityStatus: "unverified", residenceStatus: "verified" });
    });

    it("audits legal holds, denies expired private download even when held and never physically purges", async () => {
      const admin = await caller(adminId);
      const [item] = await db.insert(vendorVerificationEvidence).values({
        sessionId: vendor.sessionId,
        evidenceType: "government_id",
        fileStoragePath: "private/verification/retained.pdf",
        retentionExpiresAt: new Date(Date.now() + 86_400_000),
      });
      await admin.admin.setEvidenceLegalHold({
        evidenceId: item.insertId,
        held: true,
        reason: "Preserve pending policy review.",
      });
      const { signToken } = await import("./jwtAuth");
      const { evidenceDownloadUrl } = await import("./privateEvidence");
      const [account] = await db
        .select()
        .from(users)
        .where(eq(users.id, adminId));
      const sessionId = randomBytes(32).toString("hex");
      await db
        .insert(authSessions)
        .values({
          id: createHash("sha256").update(sessionId).digest("hex"),
          userId: adminId,
          expiresAt: new Date(Date.now() + 60_000),
        });
      const token = await signToken({
        userId: adminId,
        email: account.email!,
        role: "admin",
        sessionId,
      });
      const link = await evidenceDownloadUrl(item.insertId, adminId);
      expect(
        (
          await fetch(`${origin}${link}`, {
            headers: { cookie: `kwantu_jwt=${token}` },
          })
        ).status
      ).toBe(200);
      expect((await fetch(`${origin}${link}`)).status).toBe(401);
      await db
        .update(vendorVerificationEvidence)
        .set({ retentionExpiresAt: new Date("2020-01-01") })
        .where(eq(vendorVerificationEvidence.id, item.insertId));
      expect(
        (
          await fetch(`${origin}${link}`, {
            headers: { cookie: `kwantu_jwt=${token}` },
          })
        ).status
      ).toBe(404);
      expect(await admin.admin.runEvidenceCleanup()).toMatchObject({
        enabled: false,
        deleted: 0,
      });
      expect(
        (
          await db
            .select()
            .from(vendorVerificationEvidence)
            .where(eq(vendorVerificationEvidence.id, item.insertId))
        )[0]
      ).toMatchObject({
        fileStoragePath: "private/verification/retained.pdf",
        deletedAt: null,
      });
      await admin.admin.setEvidenceLegalHold({
        evidenceId: item.insertId,
        held: false,
        reason: "Reviewed hold release.",
      });
      expect(
        (
          await db
            .select()
            .from(moderationRecords)
            .where(eq(moderationRecords.entityId, `evidence:${item.insertId}`))
        ).map(row => row.action)
      ).toEqual(["evidence_hold_set", "evidence_hold_released"]);
    });

    it("uses current public-contact ownership and source timestamps for REST and main badges", async () => {
      const { getVendorVerificationBadges } = await import("./vendorTrust");
      const [account] = await db
        .select()
        .from(users)
        .where(eq(users.id, vendor.userId));
      await db
        .update(vendorProfiles)
        .set({ contactEmail: account.email, phone: account.phone })
        .where(eq(vendorProfiles.id, vendor.id));
      expect(
        (await getVendorVerificationBadges(vendor.id)).contactVerified
      ).toBe(true);
      await db
        .update(vendorProfiles)
        .set({ contactEmail: "unverified-business@example.test" })
        .where(eq(vendorProfiles.id, vendor.id));
      expect(
        (await getVendorVerificationBadges(vendor.id)).contactVerified
      ).toBe(false);
      const response = await (await fetch(`${origin}/api/v1/vendors`)).json();
      expect(
        response.data.items.find((row: { id: number }) => row.id === vendor.id).badges
          .contactVerified
      ).toBe(false);
    });

    it("counts distinct first inquiry responses with category and creation-date scope", async () => {
      const { getVendorFunnelAnalytics, getAdminFunnelAnalytics } = await import("./analytics");
      const { getVendorTrustSignals } = await import("./vendorTrust");
      const ownerId = await user("vendor");
      const [profile] = await db.insert(vendorProfiles).values({ userId: ownerId, businessName: "Metrics fixture" });
      const [secondCategory] = await db.insert(categories).values({ name: "Metrics other", slug: randomUUID() });
      const targets: number[] = [];
      for (const category of [categoryId, secondCategory.insertId]) {
        const [target] = await db.insert(listings).values({
          vendorId: profile.insertId, categoryId: category, title: "Metric item", description: "Metrics cohort fixture", slug: randomUUID(), listingType: "product",
        });
        targets.push(target.insertId);
      }
      const insertInquiry = async (target: number, createdAt: string, replyCount: number) => {
        const [item] = await db.insert(inquiries).values({ buyerId, vendorId: profile.insertId, listingId: target, subject: "Private sentinel", createdAt: new Date(createdAt) });
        await db.insert(messages).values({ inquiryId: item.insertId, senderId: buyerId, body: "Private buyer message", createdAt: new Date(createdAt) });
        for (let index = 0; index < replyCount; index++) await db.insert(messages).values({
          inquiryId: item.insertId, senderId: ownerId, body: "Private vendor reply",
          createdAt: new Date(new Date(createdAt).getTime() + (index + 1) * 60_000),
        });
      };
      await insertInquiry(targets[0], "2026-01-15T10:00:00Z", 4);
      await insertInquiry(targets[0], "2026-01-15T11:00:00Z", 0);
      await insertInquiry(targets[1], "2026-01-15T12:00:00Z", 2);
      await insertInquiry(targets[0], "2025-01-15T12:00:00Z", 3);
      const scope = { vendorId: profile.insertId, categoryId, from: new Date("2026-01-15"), to: new Date("2026-01-15") };
      const result = await getVendorFunnelAnalytics(profile.insertId, scope);
      expect(result).toMatchObject({ inquiries: 2, responded: 1, responseRate: 0.5, averageResponseSeconds: 60, unread: 2 });
      expect(result.topListings).toEqual([expect.objectContaining({ listingId: targets[0], inquiries: 2 })]);
      expect(await getAdminFunnelAnalytics(scope)).toMatchObject({ inquiries: 2, replies: 1, responseRate: 0.5 });
      expect(await getVendorTrustSignals(profile.insertId)).toMatchObject({ responseRate: 0.75, responseSampleSize: 4, typicalResponseSeconds: 60 });
    });

    it("bounds owner collections with stable same-second pages, exact totals and no cross-account records", async () => {
      const ownerId = await user("buyer");
      const otherId = await user("buyer");
      const owner = await caller(ownerId);
      const other = await caller(otherId);
      const stamp = new Date("2030-01-01T00:00:00Z");
      const slugs = Array.from({ length: 55 }, () => randomUUID());
      await db.insert(listings).values(slugs.map(slug => ({
        vendorId: vendor.id, categoryId, storefrontId: null, title: "Paged fixture",
        description: "Pagination fixture description", slug, listingType: "product" as const, status: "draft" as const,
        createdAt: stamp,
      })));
      const targets = await db.select({ id: listings.id }).from(listings).where(inArray(listings.slug, slugs));
      await db.insert(wishlists).values(targets.map(row => ({ buyerId: ownerId, listingId: row.id, createdAt: stamp })));
      await db.insert(savedSearches).values(targets.map(row => ({ userId: ownerId, name: `Paged search ${row.id}`, createdAt: stamp })));
      await db.insert(reviews).values(targets.map(row => ({
        buyerId: ownerId, vendorId: vendor.id, listingId: row.id, rating: 4,
        status: "approved" as const, createdAt: stamp,
      })));
      await db.insert(listingViews).values(targets.map(row => ({ viewerId: ownerId, listingId: row.id, createdAt: stamp })));
      await db.insert(inquiries).values(targets.map(row => ({
        buyerId: ownerId, vendorId: vendor.id, listingId: row.id, subject: "Paged inquiry",
        vendorPrivateNotes: "private-paging-sentinel", updatedAt: stamp,
      })));
      const calls = [
        (page: number) => owner.buyer.wishlist({ page }),
        (page: number) => owner.buyer.savedSearches({ page }),
        (page: number) => owner.buyer.reviews({ page }),
        (page: number) => owner.buyer.viewHistory({ page }),
        (page: number) => owner.buyer.inquiries({ page }),
      ];
      for (const collection of calls) {
        const first = await collection(1);
        const second = await collection(2);
        const last = await collection(3);
        expect(first.pagination).toMatchObject({ total: 55, page: 1, pageSize: 20, totalPages: 3 });
        expect([first.items.length, second.items.length, last.items.length]).toEqual([20, 20, 15]);
        expect(new Set([...first.items, ...second.items, ...last.items].map(item => JSON.stringify(item))).size).toBe(55);
        expect((await collection(4)).items).toEqual([]);
        expect((await collection(1)).items).toEqual(first.items);
      }
      expect((await other.buyer.wishlist()).items).toEqual([]);
      expect((await other.buyer.inquiries()).items).toEqual([]);
      expect((await other.buyer.reviews()).items).toEqual([]);
      expect((await other.buyer.savedSearches()).items).toEqual([]);
      expect((await other.buyer.viewHistory()).items).toEqual([]);
      const summaries = await owner.buyer.inquiries();
      expect(JSON.stringify(summaries)).not.toContain("private-paging-sentinel");
      expect(summaries.items[0]).not.toHaveProperty("messages");
      const vendorCaller = await caller(vendor.userId);
      const vendorPage = await vendorCaller.vendor.listings({ pageSize: 50 });
      expect(vendorPage.items).toHaveLength(50);
      expect(vendorPage.pagination.total).toBeGreaterThanOrEqual(55);
      expect((await vendorCaller.vendor.reviews({ pageSize: 50 })).items).toHaveLength(50);
      expect((await vendorCaller.vendor.inquiries({ pageSize: 50 })).items).toHaveLength(50);
      const missingProfile = await caller(otherId);
      expect((await missingProfile.vendor.listings()).items).toEqual([]);
      for (const badInput of [{ page: 0 }, { page: 10001 }, { pageSize: 51 }, { page: 1.5 }]) {
        await expect(owner.buyer.wishlist(badInput)).rejects.toMatchObject({ code: "BAD_REQUEST" });
        await expect(vendorCaller.vendor.inquiries(badInput)).rejects.toMatchObject({ code: "BAD_REQUEST" });
      }
    });

    it("pages long threads on demand, preserves whole-thread summaries and resolves owned deep links", async () => {
      const ownerId = await user("buyer");
      const otherId = await user("buyer");
      const [row] = await db.insert(inquiries).values({
        buyerId: ownerId, vendorId: vendor.id, listingId, subject: "Long conversation",
        vendorPrivateNotes: "never-return-this-note", status: "open",
      });
      const inquiryId = row.insertId;
      const base = Date.parse("2026-01-01T00:00:00Z");
      await db.insert(messages).values(Array.from({ length: 76 }, (_, index) => ({
        inquiryId, senderId: index === 0 ? ownerId : vendor.userId,
        body: index === 75 ? "hidden-message-sentinel" : `Message ${index}`,
        isHidden: index === 75,
        createdAt: new Date(base + index * 60_000),
      })));
      const owner = await caller(ownerId);
      const seller = await caller(vendor.userId);
      const stranger = await caller(otherId);
      const summary = await owner.buyer.inquiries({ inquiryId });
      expect(summary.pagination.total).toBe(1);
      expect(summary.items[0]).toMatchObject({ id: inquiryId, unreadCount: 74, responseTimeSeconds: 60, conversationState: "awaiting_buyer" });
      expect(summary.items[0].lastMessageAt).toEqual(new Date(base + 74 * 60_000));
      expect(summary.items[0]).not.toHaveProperty("vendorPrivateNotes");
      expect((await seller.vendor.inquiries({ inquiryId })).items[0]).toMatchObject({ vendorPrivateNotes: "never-return-this-note", conversationState: "awaiting_vendor" });
      expect((await stranger.buyer.inquiries({ inquiryId })).items).toEqual([]);
      const pages = await Promise.all([1, 2, 3].map(page => owner.buyer.messages({ inquiryId, page, pageSize: 30 })));
      expect(pages[0].pagination).toMatchObject({ total: 75, totalPages: 3 });
      expect(pages.map(page => page.items.length)).toEqual([30, 30, 15]);
      expect(pages[0].items[0].body).toBe("Message 45");
      expect(pages[0].items.at(-1)!.body).toBe("Message 74");
      expect(pages[2].items[0].body).toBe("Message 0");
      expect(new Set(pages.flatMap(page => page.items.map(item => item.id))).size).toBe(75);
      expect(JSON.stringify(pages)).not.toContain("hidden-message-sentinel");
      expect(pages[0].items[0]).not.toHaveProperty("hiddenReason");
      expect((await seller.vendor.messages({ inquiryId })).pagination.total).toBe(75);
      await expect(stranger.buyer.messages({ inquiryId })).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(stranger.vendor.messages({ inquiryId })).rejects.toMatchObject({ code: "NOT_FOUND" });
      await owner.buyer.markInquiryRead({ inquiryId });
      expect((await owner.buyer.inquiries({ inquiryId })).items[0].unreadCount).toBe(0);
    });

    it("pages public directory searches, storefront offerings and reviews without page-local totals", async () => {
      const { TERMS_VERSION } = await import("./accountPolicy");
      const { encryptOtp } = await import("./contactVerification");
      const prefix = randomUUID();
      const ids: number[] = [];
      for (let index = 0; index < 21; index++) {
        const userId = await user("vendor");
        await db.update(users).set({ termsVersion: TERMS_VERSION }).where(eq(users.id, userId));
        const [profile] = await db.insert(vendorProfiles).values({
          userId, businessName: `${prefix} vendor ${index}`, approvalStatus: "approved",
          approvedAt: new Date("2026-01-01T00:00:00Z"),
        });
        const [session] = await db.insert(vendorVerificationSessions).values({
          userId, vendorId: profile.insertId, provider: "didit", status: "approved",
          sessionType: "combined_na_vendor", countryCode: "CA", expiresAt: new Date("2030-01-01T00:00:00Z"),
        });
        await db.insert(accountOnboarding).values({
          userId, kycSessionId: session.insertId, kycVerifiedAt: now, completedAt: now, countryCode: "CA", identityCiphertext: encryptOtp("{}"),
        });
        ids.push(profile.insertId);
      }
      const publicCaller = router.createCaller({ user: null, req: {} as Request, res: {} as Response });
      const first = await publicCaller.vendors.list({ query: prefix });
      const second = await publicCaller.vendors.list({ query: prefix, page: 2 });
      expect(first.pagination.total).toBe(21);
      expect(first.items).toHaveLength(20);
      expect(second.items).toHaveLength(1);
      expect([...first.items, ...second.items].map(row => row.id)).toEqual([...ids].reverse());
      const searched = await publicCaller.vendors.list({ query: `${prefix} vendor 0` });
      expect(searched.items.map(row => row.id)).toEqual([ids[0]]);
      expect(JSON.stringify(first)).not.toContain("passwordHash");
      const [store] = await db.select().from(storefronts).where(eq(storefronts.vendorId, vendor.id));
      const slugs = Array.from({ length: 25 }, () => randomUUID());
      await db.insert(listings).values(slugs.map(slug => ({
        vendorId: vendor.id, storefrontId: store.id, categoryId, slug, title: "Paged public offering",
        description: "Public collection paging fixture", listingType: "product" as const, status: "published" as const,
        publishedAt: new Date("2030-01-01T00:00:00Z"),
      })));
      const before = await appDb.getStorefrontBySlug(vendor.slug, undefined, { page: 1, pageSize: 20 });
      const after = await appDb.getStorefrontBySlug(vendor.slug, undefined, { page: 2, pageSize: 20 });
      expect(before!.listings).toHaveLength(20);
      expect(before!.pagination.total).toBeGreaterThanOrEqual(25);
      expect(new Set([...before!.listings, ...after!.listings].map(row => row.id)).size)
        .toBe(before!.listings.length + after!.listings.length);
      const target = before!.listings[0].id;
      for (let index = 0; index < 25; index++) {
        const reviewer = await user("buyer");
        await db.insert(reviews).values({ buyerId: reviewer, vendorId: vendor.id, listingId: target,
          rating: index === 0 ? 1 : 5, status: "approved" });
      }
      const summary = await publicCaller.marketplace.reviews({ listingId: target, page: 2 });
      expect(summary).toMatchObject({ reviewCount: 25, averageRating: 4.84 });
      expect(summary.reviews).toHaveLength(5);
      const rest = await (await fetch(`${origin}/api/v1/vendors?page=2&query=${prefix}`)).json();
      expect(rest.data.items).toHaveLength(1);
      expect(rest.data.pagination).toMatchObject({ page: 2, total: 21 });
    });

    it("pages sanitized verification history and notification cursors without timestamp gaps or empty trailing pages", async () => {
      await db.insert(vendorVerificationSessions).values(Array.from({ length: 25 }, () => ({
        userId: vendor.userId, vendorId: vendor.id, provider: "manual" as const,
        sessionType: "proof_of_residence" as const, status: "declined" as const,
        metadata: { secret: "private-verification-sentinel" },
      })));
      const seller = await caller(vendor.userId);
      const first = await seller.vendor.verificationStatus({ page: 1 });
      const second = await seller.vendor.verificationStatus({ page: 2 });
      expect(first!.sessions).toHaveLength(20);
      expect(first!.pagination.total).toBeGreaterThanOrEqual(25);
      expect(new Set([...first!.sessions, ...second!.sessions].map(row => row.id)).size)
        .toBe(first!.sessions.length + second!.sessions.length);
      expect(JSON.stringify(first)).not.toContain("private-verification-sentinel");
      const recipient = await user("buyer");
      const buyer = await caller(recipient);
      await db.insert(notifications).values(Array.from({ length: 40 }, (_, index) => ({
        recipientUserId: recipient, notificationType: "saved_search_match" as const,
        entityType: "listing", title: "Pagination notice", body: `Notice ${index}`,
        createdAt: new Date(Date.parse("2026-01-01T00:00:00Z") - index * 60_000),
      })));
      const recent = await buyer.notifications.list({ limit: 20 });
      expect(recent.items).toHaveLength(20);
      expect(recent.items[0].body).toBe("Notice 39");
      expect(recent.unreadCount).toBe(40);
      const older = await buyer.notifications.list({ limit: 20, cursor: recent.nextCursor! });
      expect(older.items).toHaveLength(20);
      expect(older.nextCursor).toBeNull();
      expect(new Set([...recent.items, ...older.items].map(row => row.id)).size).toBe(40);
      const outsider = await caller(await user("buyer"));
      expect((await outsider.notifications.list({ limit: 20 })).items).toEqual([]);
    });

    it("enforces constant SQL round-trip budgets as page size grows and supplies collection indexes", async () => {
      const seller = await caller(vendor.userId);
      const owner = await caller(buyerId);
      const [conversation] = await db.select({ id: inquiries.id }).from(inquiries).where(eq(inquiries.buyerId, buyerId)).limit(1);
      const client = (await appDb.getDb())!.$client as mysql.Pool;
      const spy = vi.spyOn(client, "query");
      try {
        const collections = [
          { call: (size: number) => seller.vendor.listings({ pageSize: size }), max: 4 },
          { call: (size: number) => seller.vendor.inquiries({ pageSize: size }), max: 4 },
          { call: (size: number) => seller.vendor.reviews({ pageSize: size }), max: 3 },
          { call: (size: number) => seller.vendor.verificationStatus({ pageSize: size }), max: 6 },
          { call: (size: number) => owner.buyer.inquiries({ pageSize: size }), max: 3 },
          { call: (size: number) => owner.buyer.wishlist({ pageSize: size }), max: 2 },
          { call: (size: number) => owner.buyer.viewHistory({ pageSize: size }), max: 3 },
          { call: (size: number) => owner.buyer.savedSearches({ pageSize: size }), max: 2 },
          { call: (size: number) => owner.buyer.reviews({ pageSize: size }), max: 2 },
          { call: (size: number) => owner.buyer.messages({ inquiryId: conversation.id, pageSize: size }), max: 3 },
          { call: (size: number) => owner.notifications.list({ limit: size }), max: 2 },
          { call: (size: number) => router.createCaller({ user: null, req: {} as Request, res: {} as Response }).vendors.list({ pageSize: size }), max: 8 },
          { call: (size: number) => appDb.searchListings({ pageSize: size }), max: 3 },
          { call: (size: number) => appDb.getRelatedListings(listingId, categoryId, size), max: 2 },
          { call: (size: number) => appDb.getStorefrontBySlug(vendor.slug, undefined, { page: 1, pageSize: size }), max: 5 },
        ];
        for (const { call, max } of collections) {
          spy.mockClear();
          await call(1);
          const small = spy.mock.calls.length;
          spy.mockClear();
          await call(20);
          const large = spy.mock.calls.length;
          expect(small).toBeGreaterThan(0);
          expect(large).toBeLessThanOrEqual(max);
          expect(large).toBeLessThanOrEqual(small);
        }
      } finally { spy.mockRestore(); }
      const indexes = await db.execute(sql`select index_name from information_schema.statistics where table_schema = database() and index_name in ('inquiry_buyer_updated_idx', 'inquiry_vendor_updated_idx', 'message_inquiry_visible_created_idx', 'listing_vendor_created_idx', 'saved_search_user_created_idx') group by index_name`);
      expect(indexes[0]).toHaveLength(5);
    });

    it("reports the full eligible directory listing count beyond its six samples", async () => {
      for (let index = 0; index < 8; index++) await listing();
      const { getAllVendors } = await import("./db");
      const rows = await getAllVendors({ page: 1, pageSize: 50 });
      const row = rows.items.find(item => item.id === vendor.id);
      expect(row).toBeDefined();
      expect(row!.sampleListings).toHaveLength(6);
      expect(row!.listingCount).toBeGreaterThanOrEqual(8);
    });

    it("uses stored media counts and real burst/duplicate evidence in admin quality checks", async () => {
      const target = await listing();
      for (let index = 0; index < 3; index++) await db.insert(listingMedia).values({ listingId: target, url: `/media/public/fixture-${index}.webp`, sortOrder: index });
      const reviewer = await user("buyer");
      const reviewIds: number[] = [];
      for (let index = 0; index < 6; index++) {
        const reviewTarget = await listing();
        const [review] = await db.insert(reviews).values({ listingId: reviewTarget, vendorId: vendor.id, buyerId: reviewer, rating: 5, comment: "Repeated fixture review", status: "pending" });
        reviewIds.push(review.insertId);
      }
      const admin = await caller(adminId);
      const items = await admin.admin.listings({ query: "Art", page: 1 });
      expect(items.find(item => item.listing.id === target)?.quality.factors.hasMultipleImages).toBe(true);
      const results = await admin.admin.reviews();
      expect(results.find(item => item.review.id === reviewIds[0])?.integrity.flags).toEqual(expect.arrayContaining([
        "High review frequency from buyer account (burst)", "Duplicate review text detected across submissions",
      ]));
    });

    it("paginates admin directories and rejects invalid pages without leaking credential data", async () => {
      const prefix = `paged-${randomUUID()}`;
      for (let index = 0; index < 27; index++) await db.insert(users).values({ openId: randomUUID(), name: `${prefix} ${index}`, role: "buyer", passwordHash: "credential-sentinel" });
      const admin = await caller(adminId);
      const first = await admin.admin.users({ query: prefix, page: 1, role: "buyer" });
      const second = await admin.admin.users({ query: prefix, page: 2, role: "buyer" });
      expect(first).toHaveLength(25);
      expect(second).toHaveLength(2);
      expect(new Set([...first, ...second].map(row => row.id)).size).toBe(27);
      expect(JSON.stringify(first)).not.toContain("credential-sentinel");
      await expect(admin.admin.users({ page: 0 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect((await caller(buyerId)).admin.users()).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("audits aggregate exports and rolls back moderation changes when audit persistence fails", async () => {
      const admin = await caller(adminId);
      const exported = await admin.admin.exportReport({ vendorId: vendor.id });
      expect(exported.csv).toContain('"responded"');
      expect(exported.csv).not.toMatch(/private-password-sentinel|Private buyer message|@example\.test/);
      await expect((await caller(buyerId)).admin.exportReport({})).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await db.select().from(moderationRecords).where(eq(moderationRecords.action, "aggregate_csv_exported"))).toHaveLength(1);
      const flag = `test_flag_${randomUUID()}`;
      await pool.query("CREATE TRIGGER integrity_reject_audit BEFORE INSERT ON moderationRecords FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'isolated audit failure'");
      try {
        await expect(admin.admin.setFeatureFlag({ settingKey: flag, booleanValue: true })).rejects.toBeDefined();
        await expect(admin.admin.saveCategory({ name: flag, slug: flag.replace(/_/g, "-") })).rejects.toBeDefined();
      } finally { await pool.query("DROP TRIGGER integrity_reject_audit"); }
      expect(await db.select().from(systemSettings).where(eq(systemSettings.settingKey, flag))).toHaveLength(0);
      expect(await db.select().from(categories).where(eq(categories.name, flag))).toHaveLength(0);
    });

    it("refuses blind outbox retries for uncertain sends and audits definite-failure recovery", async () => {
      const [job] = await db.insert(notificationOutbox).values({
        eventType: "INQUIRY_CREATED", idempotencyKey: randomUUID(), recipientUserId: buyerId,
        entityType: "inquiry", entityId: listingId, payload: {}, status: "dead",
      });
      const [delivery] = await db.insert(notificationDeliveries).values({
        outboxId: job.insertId, recipientUserId: buyerId, channel: "email",
        provider: "sendpulse", status: "failed", failureCode: "send_outcome_unknown",
      });
      const admin = await caller(adminId);
      await expect(admin.admin.requeueNotificationOutbox({ outboxId: job.insertId })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      expect((await db.select().from(notificationOutbox).where(eq(notificationOutbox.id, job.insertId)))[0].status).toBe("dead");
      await db.update(notificationDeliveries).set({ failureCode: "provider_rejected" }).where(eq(notificationDeliveries.id, delivery.insertId));
      await admin.admin.requeueNotificationOutbox({ outboxId: job.insertId });
      expect((await db.select().from(notificationOutbox).where(eq(notificationOutbox.id, job.insertId)))[0].status).toBe("queued");
      expect(await db.select().from(moderationRecords).where(and(eq(moderationRecords.entityId, String(job.insertId)), eq(moderationRecords.action, "notification_outbox_requeued")))).toHaveLength(1);
    });

    it("edits listing metadata with an audit and a stale-edit guard while preserving publication", async () => {
      const target = await listing();
      const admin = await caller(adminId);
      const [before] = await db.select().from(listings).where(eq(listings.id, target));
      const edit = { listingId: target, title: "Edited listing", description: "Updated descriptive listing text", categoryId,
        location: "Toronto", priceIndication: "USD 20", remoteAvailable: true, reason: "Correct catalog description.", expectedRevision: before.revision };
      await admin.admin.editListing(edit);
      const [after] = await db.select().from(listings).where(eq(listings.id, target));
      expect(after).toMatchObject({ title: edit.title, vendorId: before.vendorId, slug: before.slug, status: before.status, publishedAt: before.publishedAt });
      await expect(admin.admin.editListing(edit)).rejects.toMatchObject({ code: "CONFLICT" });
      await db.update(listings).set({ description: "Concurrent vendor metadata change." }).where(eq(listings.id, target));
      await expect(admin.admin.editListing({ ...edit, expectedRevision: before.revision + 1 })).rejects.toMatchObject({ code: "CONFLICT" });
      expect(await db.select().from(moderationRecords).where(and(eq(moderationRecords.entityId, String(target)), eq(moderationRecords.action, "listing_edited")))).toHaveLength(1);
    });

    it("merges category references atomically and refuses deletion of a referenced category", async () => {
      const admin = await caller(adminId);
      const source = await admin.admin.saveCategory({ name: "Merge source", slug: randomUUID() });
      const target = await admin.admin.saveCategory({ name: "Merge target", slug: randomUUID(), sortOrder: 7 });
      const item = await listing();
      await db.update(listings).set({ categoryId: source.id }).where(eq(listings.id, item));
      const [search] = await db.insert(savedSearches).values({ userId: buyerId, name: "Merge search", categoryId: source.id, alertFrequency: "daily" });
      await expect(admin.admin.removeCategory({ categoryId: source.id!, reason: "Unused category cleanup." })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      await admin.admin.removeCategory({ categoryId: source.id!, mergeIntoId: target.id, reason: "Combine overlapping categories." });
      expect((await db.select().from(listings).where(eq(listings.id, item)))[0].categoryId).toBe(target.id);
      expect((await db.select().from(savedSearches).where(eq(savedSearches.id, search.insertId)))[0].categoryId).toBe(target.id);
      expect(await db.select().from(categories).where(eq(categories.id, source.id!))).toHaveLength(0);
      expect(await db.select().from(moderationRecords).where(and(eq(moderationRecords.entityType, "category"), eq(moderationRecords.entityId, String(source.id)), eq(moderationRecords.action, "category_merged")))).toHaveLength(1);
    });

    it("seeds unchanged homepage slides and enforces schedules, authorization and revision conflicts", async () => {
      const { defaultHeroSlides } = await import("../shared/siteContent");
      const { clearHeroCache } = await import("./siteContent");
      const admin = await caller(adminId);
      const stored = await admin.admin.heroSlides();
      expect(stored).toHaveLength(3);
      expect(stored.map(row => row.content)).toEqual(defaultHeroSlides.map(({ id, ...content }) => content));
      const input = { content: { ...defaultHeroSlides[0], headline: "Scheduled fixture" }, isActive: true,
        sortOrder: 1, startsAt: new Date(Date.now() + 86_400_000), endsAt: null, reason: "Schedule a new campaign." };
      await expect((await caller(buyerId)).admin.saveHeroSlide(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(admin.admin.saveHeroSlide({ ...input, content: { ...input.content, primaryHref: "//evil.example" } })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(admin.admin.uploadHeroImage({ base64: Buffer.from("not-an-image").toString("base64") })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      const created = await admin.admin.saveHeroSlide(input);
      expect((await admin.siteContent.heroSlides()).find(row => row.id === String(created.id))).toBeUndefined();
      await admin.admin.saveHeroSlide({ ...input, id: created.id, revision: 1, startsAt: null });
      expect((await admin.siteContent.heroSlides()).find(row => row.id === String(created.id))).toBeDefined();
      await expect(admin.admin.saveHeroSlide({ ...input, id: created.id, revision: 1 })).rejects.toMatchObject({ code: "CONFLICT" });
      await admin.admin.saveHeroSlide({ ...input, id: created.id, revision: 2, startsAt: null, isActive: false });
      clearHeroCache();
      expect((await admin.siteContent.heroSlides()).find(row => row.id === String(created.id))).toBeUndefined();
    });

    it("keeps administrator role changes CLI-only, audited and session-revoking", async () => {
      const { provisionAdministrator, revokeAdministrator } = await import("./adminProvisioning");
      const accountId = await user("buyer");
      const [account] = await db.select().from(users).where(eq(users.id, accountId));
      await db.insert(authSessions).values({ id: randomUUID(), userId: accountId, expiresAt: new Date(Date.now() + 60_000) });
      await provisionAdministrator(db, account.email!);
      expect(await db.select().from(authSessions).where(eq(authSessions.userId, accountId))).toHaveLength(0);
      expect((await db.select().from(users).where(eq(users.id, accountId)))[0].role).toBe("admin");
      await revokeAdministrator(db, account.email!);
      expect((await db.select().from(users).where(eq(users.id, accountId)))[0].role).toBe("buyer");
      const audits = await db.select().from(moderationRecords).where(and(eq(moderationRecords.entityType, "account"), eq(moderationRecords.entityId, String(accountId))));
      expect(audits.map(row => row.action)).toEqual(["administrator_granted", "administrator_revoked"]);
      const [onlyAdmin] = await db.select().from(users).where(eq(users.id, adminId));
      await expect(revokeAdministrator(db, onlyAdmin.email!)).rejects.toThrow("last active");
      await expect((await caller(adminId)).admin.escalateAccount({ userId: adminId, action: "suspend", reason: "Attempt self suspension." })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    });
  }
);
