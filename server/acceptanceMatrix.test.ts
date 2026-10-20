import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

function mockContext(user: User | null): TrpcContext {
  return {
    user,
    req: {
      protocol: "https",
      headers: {},
      ip: "127.0.0.1",
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
      cookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("Stage 4H comprehensive SOW role-based acceptance matrix", () => {
  const buyerUser: User = {
    id: 101,
    openId: "buyer-101",
    email: "buyer101@example.com",
    name: "Kwantu Buyer",
    loginMethod: "jwt",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const adminUser: User = {
    id: 1,
    openId: "admin-1",
    email: "admin@example.com",
    name: "Kwantu Admin",
    loginMethod: "jwt",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  it("Buyer flow: unauthenticated discovery, wishlist gating, inquiry access, and review guards", async () => {
    const anonymous = appRouter.createCaller(mockContext(null));
    const searchResult = await anonymous.marketplace.search({ page: 1, pageSize: 6 });
    expect(searchResult.items.length).toBeGreaterThan(0);
    expect(searchResult.items[0].status).toBe("published");

    await expect(anonymous.buyer.wishlist()).rejects.toThrow();

    const buyer = appRouter.createCaller(mockContext(buyerUser));
    const savedSearches = await buyer.buyer.savedSearches();
    expect(Array.isArray(savedSearches)).toBe(true);

    // Submitting reviews requires verified contact status and valid parameters.
    await expect(
      buyer.buyer.submitReview({
        listingId: 1,
        rating: 5,
        comment: "Excellent craftsmanship and prompt response.",
      })
    ).rejects.toThrow();
  });

  it("Vendor flow: verification status discovery, lead funnel, and admin-only restriction", async () => {
    const anonymous = appRouter.createCaller(mockContext(null));
    await expect(anonymous.vendor.verificationStatus()).rejects.toThrow();
    await expect(anonymous.vendor.leadFunnel()).rejects.toThrow();

    const buyer = appRouter.createCaller(mockContext(buyerUser));
    // Buyers querying vendor verification status receive null (no vendor profile attached)
    const buyerStatus = await buyer.vendor.verificationStatus();
    expect(buyerStatus).toBeNull();

    await expect(buyer.vendor.saveListing({
      title: "Unauthorized Listing",
      description: "Should fail because user is not an approved vendor.",
      categoryId: 1,
      listingType: "product",
    })).rejects.toThrow();
  });

  it("Admin flow: moderation queues, dispute governance, and delivery failure monitoring", async () => {
    const admin = appRouter.createCaller(mockContext(adminUser));
    const [reports, disputesList, summary, flags] = await Promise.all([
      admin.admin.conversationReports(),
      admin.admin.disputes(),
      admin.admin.notificationDeliverySummary(),
      admin.admin.featureFlags(),
    ]);

    expect(Array.isArray(reports)).toBe(true);
    expect(Array.isArray(disputesList)).toBe(true);
    expect(summary).toBeDefined();
    expect(Array.isArray(flags)).toBe(true);
  });
});
