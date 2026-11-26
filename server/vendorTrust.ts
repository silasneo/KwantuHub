import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  accountOnboarding,
  users,
  vendorProfiles,
  vendorVerificationDecisions,
  vendorVerificationSessions,
} from "../drizzle/schema";
import {
  deriveVendorBadges,
  type VerificationBadgeSummary,
} from "./vendorVerification";
import { inquiries, messages } from "../drizzle/schema";

const MIN_RESPONSE_SAMPLE = 3;
type TrustSignals = {
  verified: boolean;
  profileComplete: boolean;
  responseRate: number | null;
  typicalResponseSeconds: number | null;
  recentlyActive: boolean;
  responseSampleSize: number;
  featuredEligible: boolean;
};

export function getTrustRate(replyCount: number, inquiryCount: number) {
  return inquiryCount >= MIN_RESPONSE_SAMPLE
    ? Math.min(replyCount, inquiryCount) / inquiryCount
    : null;
}

export function getTypicalResponseSeconds(
  samples: number[],
  inquiryCount: number
) {
  return inquiryCount >= MIN_RESPONSE_SAMPLE && samples.length
    ? Math.round(
        samples.reduce((sum, value) => sum + value, 0) / samples.length
      )
    : null;
}

export function isProfileComplete(profile: {
  description?: string | null;
  location?: string | null;
  serviceArea?: string | null;
  standardsAcknowledgedAt?: Date | null;
}) {
  return Boolean(
    profile.description?.trim() &&
      profile.location?.trim() &&
      profile.serviceArea?.trim() &&
      profile.standardsAcknowledgedAt
  );
}

export async function getVendorTrustSignalsBatch(
  vendorIds: number[]
): Promise<Map<number, TrustSignals>> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable for vendor trust.");
  if (!vendorIds.length) return new Map<number, TrustSignals>();
  const profiles = await db
    .select()
    .from(vendorProfiles)
    .where(inArray(vendorProfiles.id, vendorIds));
  const replies = db
    .select({
      id: inquiries.id,
      vendorId: inquiries.vendorId,
      createdAt: inquiries.createdAt,
      firstReply: sql<string | null>`min(${messages.createdAt})`.as(
        "first_reply"
      ),
    })
    .from(inquiries)
    .innerJoin(vendorProfiles, eq(vendorProfiles.id, inquiries.vendorId))
    .leftJoin(
      messages,
      and(
        eq(messages.inquiryId, inquiries.id),
        eq(messages.senderId, vendorProfiles.userId),
        gte(messages.createdAt, inquiries.createdAt)
      )
    )
    .where(inArray(inquiries.vendorId, vendorIds))
    .groupBy(inquiries.id)
    .as("replies");
  const metrics = await db
    .select({
      vendorId: replies.vendorId,
      inquiries: sql<number>`count(*)`,
      responded: sql<number>`count(${replies.firstReply})`,
      average: sql<
        number | null
      >`avg(timestampdiff(second, ${replies.createdAt}, ${replies.firstReply}))`,
    })
    .from(replies)
    .groupBy(replies.vendorId);
  const byVendor = new Map(metrics.map(row => [row.vendorId, row]));
  return new Map(
    profiles.map(profile => {
      const metric = byVendor.get(profile.id);
      const inquiryCount = Number(metric?.inquiries ?? 0);
      const responseRate = getTrustRate(
        Number(metric?.responded ?? 0),
        inquiryCount
      );
      const profileComplete = isProfileComplete(profile);
      const recentlyActive =
        profile.updatedAt.getTime() >= Date.now() - 30 * 24 * 60 * 60 * 1000;
      const verified = profile.approvalStatus === "approved";
      return [
        profile.id,
        {
          verified,
          profileComplete,
          responseRate,
          typicalResponseSeconds:
            inquiryCount >= MIN_RESPONSE_SAMPLE && metric?.average != null
              ? Math.round(Number(metric.average))
              : null,
          recentlyActive,
          responseSampleSize: inquiryCount,
          featuredEligible:
            verified &&
            profileComplete &&
            (responseRate === null || responseRate >= 0.6),
        },
      ] as const;
    })
  );
}

export async function getVendorTrustSignals(vendorId: number) {
  return (
    (await getVendorTrustSignalsBatch([vendorId])).get(vendorId) ?? {
      verified: false,
      profileComplete: false,
      responseRate: null,
      recentlyActive: false,
      featuredEligible: false,
      responseSampleSize: 0,
      typicalResponseSeconds: null,
    }
  );
}

export async function getVendorVerificationBadgesBatch(
  vendorIds: number[]
): Promise<Map<number, VerificationBadgeSummary>> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable for verification badges.");
  if (!vendorIds.length) return new Map();
  const profiles = await db
    .select({
      vendor: vendorProfiles,
      user: users,
    })
    .from(vendorProfiles)
    .innerJoin(users, eq(vendorProfiles.userId, users.id))
    .where(inArray(vendorProfiles.id, vendorIds));

  const currentSessionIds = profiles.flatMap(row =>
    [
      row.vendor.identityVerificationSessionId,
      row.vendor.residenceVerificationSessionId,
    ].filter((id): id is number => id !== null)
  );
  const rankedDecisions = db
    .select({
      id: vendorVerificationDecisions.id,
      rank: sql<number>`row_number() over (partition by ${vendorVerificationDecisions.sessionId}, ${vendorVerificationDecisions.checkType} order by ${vendorVerificationDecisions.decidedAt} desc, ${vendorVerificationDecisions.id} desc)`.as(
        "decision_rank"
      ),
    })
    .from(vendorVerificationDecisions)
    .where(
      and(
        currentSessionIds.length
          ? inArray(vendorVerificationDecisions.sessionId, currentSessionIds)
          : sql`false`,
        eq(vendorVerificationDecisions.outcome, "verified")
      )
    )
    .as("ranked_decisions");
  const decisions = await db
    .select({
      decision: vendorVerificationDecisions,
      session: vendorVerificationSessions,
    })
    .from(vendorVerificationDecisions)
    .innerJoin(
      rankedDecisions,
      eq(rankedDecisions.id, vendorVerificationDecisions.id)
    )
    .innerJoin(
      vendorVerificationSessions,
      eq(vendorVerificationSessions.id, vendorVerificationDecisions.sessionId)
    )
    .where(
      and(
        inArray(vendorVerificationSessions.vendorId, vendorIds),
        eq(rankedDecisions.rank, 1),
        currentSessionIds.length
          ? inArray(vendorVerificationSessions.id, currentSessionIds)
          : sql`false`,
        eq(vendorVerificationDecisions.outcome, "verified")
      )
    )
    .orderBy(
      desc(vendorVerificationDecisions.decidedAt),
      desc(vendorVerificationDecisions.id)
    );
  const onboardings = await db
    .select({
      onboarding: accountOnboarding,
      session: vendorVerificationSessions,
    })
    .from(accountOnboarding)
    .innerJoin(
      vendorVerificationSessions,
      eq(vendorVerificationSessions.id, accountOnboarding.kycSessionId)
    )
    .where(
      and(
        inArray(vendorVerificationSessions.vendorId, vendorIds),
        eq(vendorVerificationSessions.userId, accountOnboarding.userId),
        eq(vendorVerificationSessions.provider, "didit"),
        eq(vendorVerificationSessions.status, "approved")
      )
    );
  return new Map(
    profiles.map(profile => {
      const vendorId = profile.vendor.id;
      const ownDecisions = decisions.filter(
        row =>
          row.session.vendorId === vendorId &&
          row.session.userId === profile.user.id
      );
      const identity = ownDecisions.find(
        item =>
          item.decision.checkType === "identity" &&
          item.session.id === profile.vendor.identityVerificationSessionId
      );
      const residence = ownDecisions.find(
        item =>
          item.decision.checkType === "residence" &&
          item.session.id === profile.vendor.residenceVerificationSessionId &&
          item.decision.countryCode === profile.vendor.residenceCountry
      );
      const onboarding = onboardings.find(
        row =>
          row.session.vendorId === vendorId &&
          row.onboarding.userId === profile.user.id
      );
      const metadata = onboarding?.session.metadata;
      const signedOnboarding =
        onboarding?.onboarding.kycVerifiedAt &&
        metadata &&
        typeof metadata === "object" &&
        "identityMatches" in metadata &&
        metadata.identityMatches === true;
      const sameEmail = Boolean(
        profile.vendor.contactEmail &&
          profile.user.email &&
          profile.vendor.contactEmail.trim().toLowerCase() ===
            profile.user.email.trim().toLowerCase()
      );
      const phone = (value: string | null) => value?.replace(/[\s().-]/g, "");
      const samePhone = Boolean(
        profile.vendor.phone &&
          profile.user.phone &&
          phone(profile.vendor.phone) === phone(profile.user.phone)
      );
      return [
        vendorId,
        deriveVendorBadges({
          emailVerified: sameEmail && Boolean(profile.user.emailVerifiedAt),
          phoneVerified: samePhone && Boolean(profile.user.phoneVerifiedAt),
          identityStatus:
            identity || signedOnboarding
              ? profile.vendor.identityStatus
              : "unverified",
          identityVerifiedAt:
            identity?.decision.decidedAt ||
            (signedOnboarding ? onboarding.onboarding.kycVerifiedAt : null),
          identityExpiresAt:
            identity?.session.expiresAt ||
            (signedOnboarding ? onboarding.session.expiresAt : null),
          residenceStatus: residence
            ? profile.vendor.residenceStatus
            : "unverified",
          residenceVerifiedAt: residence?.decision.decidedAt,
          residenceExpiresAt: residence?.session.expiresAt,
          residenceCountry: profile.vendor.residenceCountry,
          approvalStatus: profile.vendor.approvalStatus,
          approvalAt: profile.vendor.approvedAt,
        }),
      ] as const;
    })
  );
}

export async function getVendorVerificationBadges(
  vendorId: number
): Promise<VerificationBadgeSummary> {
  return (
    (await getVendorVerificationBadgesBatch([vendorId])).get(vendorId) ??
    deriveVendorBadges({
      emailVerified: false,
      phoneVerified: false,
      identityStatus: "unverified",
      residenceStatus: "unverified",
      residenceCountry: null,
      approvalStatus: "pending",
    })
  );
}
