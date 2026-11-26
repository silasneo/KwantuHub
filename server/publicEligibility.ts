import { and, eq, sql } from "drizzle-orm";
import { listings, vendorProfiles } from "../drizzle/schema";
import { TERMS_VERSION } from "./accountPolicy";

export function publicVendorEligibility() {
  return and(
    eq(vendorProfiles.approvalStatus, "approved"),
    sql`EXISTS (
      SELECT 1 FROM users public_user
      INNER JOIN accountOnboarding public_onboarding ON public_onboarding.userId = public_user.id
      INNER JOIN vendorVerificationSessions public_kyc ON public_kyc.id = public_onboarding.kycSessionId
      WHERE public_user.id = ${vendorProfiles.userId}
        AND public_user.status = 'active'
        AND public_user.role IN ('vendor', 'admin')
        AND public_user.emailVerifiedAt IS NOT NULL
        AND public_user.phoneVerifiedAt IS NOT NULL
        AND public_user.termsAcceptedAt IS NOT NULL
        AND public_user.termsVersion = ${TERMS_VERSION}
        AND public_onboarding.completedAt IS NOT NULL
        AND public_onboarding.kycVerifiedAt IS NOT NULL
        AND public_kyc.userId = public_user.id
        AND public_kyc.vendorId = ${vendorProfiles.id}
        AND public_kyc.provider = 'didit'
        AND public_kyc.status = 'approved'
        AND public_kyc.expiresAt > CURRENT_TIMESTAMP
    )`
  )!;
}

export function publicListingEligibility() {
  return and(
    eq(listings.status, "published"),
    sql`EXISTS (SELECT 1 FROM categories public_category
      WHERE public_category.id = ${listings.categoryId} AND public_category.isActive = true)`,
    sql`EXISTS (SELECT 1 FROM vendorProfiles
      WHERE vendorProfiles.id = ${listings.vendorId} AND ${publicVendorEligibility()})`
  )!;
}
