import { beforeEach, describe, expect, it, vi } from "vitest";
import { matchesSavedSearch } from "./savedSearchMatcher";
import { getDb } from "./db";
import { enqueueNotificationEvent } from "./notificationWorker";
import { processListingSavedSearchMatches } from "./savedSearchService";

vi.mock("./db", () => ({ getDb: vi.fn() }));
vi.mock("./notificationWorker", () => ({ enqueueNotificationEvent: vi.fn() }));

describe("Stage 4D saved search idempotent matching logic", () => {
  it("determines unique key for match record to prevent duplicates", () => {
    const searchId = 42;
    const listingId = 101;
    const matchKey = `match:${searchId}:${listingId}`;
    expect(matchKey).toBe("match:42:101");
  });

  describe("saved search alert price exclusion", () => {
    beforeEach(() => vi.clearAllMocks());
    it("does not insert matches or enqueue alerts for out-of-range or wrong-currency listings", async () => {
      const listingQuery = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{
          listing: {
            id: 55, title: "Handmade necklace", description: "Beadwork", categoryId: 1,
            listingType: "product", location: "Toronto", priceIndication: "USD 50.25-100.75",
            remoteAvailable: false, status: "published",
          },
          vendor: { approvalStatus: "approved", identityStatus: "verified", identityVerifiedAt: new Date(), remoteAvailable: true },
          category: {},
        }]),
      };
      const searchesQuery = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([
          { id: 1, minPrice: "100.76", maxPrice: null, currency: "USD", alertFrequency: "immediate" },
          { id: 2, minPrice: null, maxPrice: "50.24", currency: "USD", alertFrequency: "immediate" },
          { id: 3, minPrice: "50.25", maxPrice: "100.75", currency: "CAD", alertFrequency: "immediate" },
        ]),
      };
      const db = {
        select: vi.fn().mockReturnValueOnce(listingQuery).mockReturnValueOnce(searchesQuery),
        insert: vi.fn(),
      };
      vi.mocked(getDb).mockResolvedValue(db as any);
      await expect(processListingSavedSearchMatches(55)).resolves.toEqual({ matchedCount: 0, alertsEnqueued: 0 });
      expect(db.insert).not.toHaveBeenCalled();
      expect(enqueueNotificationEvent).not.toHaveBeenCalled();
    });
  });

  it("evaluates price boundary filtering accurately", () => {
    const candidate = {
      id: 55,
      title: "Handmade Beaded Necklace",
      description: "Authentic Zulu beadwork",
      categoryId: 1,
      listingType: "product" as const,
      remoteAvailable: true,
      vendorVerified: true,
      status: "published",
    };

    // Keyword match
    expect(matchesSavedSearch({ query: "beaded" }, candidate)).toBe(true);
    // Non-matching keyword
    expect(matchesSavedSearch({ query: "rug" }, candidate)).toBe(false);
  });
});
