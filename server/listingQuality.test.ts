import { describe, expect, it } from "vitest";
import {
  evaluateListingQuality,
  evaluateReviewIntegrity,
} from "./listingQuality";

describe("Stage 4F marketplace quality and review integrity policy", () => {
  it("scores comprehensive listings as high quality", () => {
    const result = evaluateListingQuality({
      title: "Handmade Moroccan Berber Wool Rug",
      description: "Authentic vintage tribal rug crafted by artisan weavers in the Atlas Mountains with organic wool.",
      priceIndication: "$450 USD",
      location: "Montreal, QC",
      categoryId: 2,
      mediaCount: 4,
      vendorApproved: true,
    });

    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.level).toBe("high");
    expect(result.factors.hasMultipleImages).toBe(true);
    expect(result.reasons.length).toBe(0);
  });

  it("identifies low-quality listings missing descriptions and images", () => {
    const result = evaluateListingQuality({
      title: "Quick offering",
      description: "",
      mediaCount: 0,
      priceIndication: "",
      location: "",
      categoryId: null,
    });

    expect(result.score).toBeLessThanOrEqual(40);
    expect(result.level).toBe("low");
    expect(result.reasons).toContain("Missing description");
    expect(result.reasons).toContain("No listing images uploaded");
  });

  it("flags burst review patterns and duplicate review text", () => {
    const burstCheck = evaluateReviewIntegrity({
      rating: 5,
      comment: "Great quality!",
      buyerReviewCountRecent: 8,
    });
    expect(burstCheck.isSuspicious).toBe(true);
    expect(burstCheck.flags).toContain("High review frequency from buyer account (burst)");

    const duplicateCheck = evaluateReviewIntegrity({
      rating: 5,
      comment: "A+".repeat(2),
      sameCommentCount: 3,
    });
    expect(duplicateCheck.isSuspicious).toBe(true);
    expect(duplicateCheck.flags).toContain("Duplicate review text detected across submissions");
  });
});
