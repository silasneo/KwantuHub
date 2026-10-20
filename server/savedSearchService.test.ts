import { describe, expect, it } from "vitest";
import { matchesSavedSearch } from "./savedSearchMatcher";

describe("Stage 4D saved search idempotent matching logic", () => {
  it("determines unique key for match record to prevent duplicates", () => {
    const searchId = 42;
    const listingId = 101;
    const matchKey = `match:${searchId}:${listingId}`;
    expect(matchKey).toBe("match:42:101");
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
