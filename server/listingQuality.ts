export type ListingQualityScore = {
  score: number; // 0 to 100
  level: "high" | "moderate" | "low";
  factors: {
    hasDetailedDescription: boolean;
    hasMultipleImages: boolean;
    hasPricingIndication: boolean;
    hasLocation: boolean;
    hasCategory: boolean;
    hasVendorApproval: boolean;
  };
  reasons: string[];
};

export function evaluateListingQuality(listing: {
  title: string;
  description?: string | null;
  priceIndication?: string | null;
  location?: string | null;
  categoryId?: number | null;
  mediaCount?: number;
  vendorApproved?: boolean;
}): ListingQualityScore {
  let score = 20; // baseline for title presence
  const reasons: string[] = [];

  const descLen = listing.description?.trim().length || 0;
  const hasDetailedDescription = descLen >= 60;
  if (hasDetailedDescription) {
    score += 25;
  } else if (descLen > 0) {
    score += 10;
    reasons.push("Brief description (< 60 chars)");
  } else {
    reasons.push("Missing description");
  }

  const mediaCount = listing.mediaCount || 0;
  const hasMultipleImages = mediaCount >= 2;
  if (mediaCount >= 3) {
    score += 20;
  } else if (mediaCount >= 1) {
    score += 10;
    reasons.push("Single image provided (2+ recommended)");
  } else {
    reasons.push("No listing images uploaded");
  }

  const hasPricingIndication = Boolean(listing.priceIndication?.trim());
  if (hasPricingIndication) {
    score += 15;
  } else {
    reasons.push("No pricing or quote indication");
  }

  const hasLocation = Boolean(listing.location?.trim());
  if (hasLocation) {
    score += 10;
  } else {
    reasons.push("Missing location / service area");
  }

  const hasCategory = Boolean(listing.categoryId);
  if (hasCategory) {
    score += 10;
  }

  const level = score >= 75 ? "high" : score >= 50 ? "moderate" : "low";

  return {
    score: Math.min(100, score),
    level,
    factors: {
      hasDetailedDescription,
      hasMultipleImages,
      hasPricingIndication,
      hasLocation,
      hasCategory,
      hasVendorApproval: Boolean(listing.vendorApproved),
    },
    reasons,
  };
}

export type ReviewIntegritySignal = {
  isSuspicious: boolean;
  flags: string[];
};

export function evaluateReviewIntegrity(review: {
  comment?: string | null;
  rating: number;
  buyerReviewCountRecent?: number;
  sameCommentCount?: number;
}): ReviewIntegritySignal {
  const flags: string[] = [];

  if (review.buyerReviewCountRecent && review.buyerReviewCountRecent > 5) {
    flags.push("High review frequency from buyer account (burst)");
  }

  if (review.sameCommentCount && review.sameCommentCount > 1) {
    flags.push("Duplicate review text detected across submissions");
  }

  const commentLen = review.comment?.trim().length || 0;
  if (commentLen > 0 && commentLen < 5) {
    flags.push("Unusually short comment");
  }

  return {
    isSuspicious: flags.length > 0,
    flags,
  };
}
