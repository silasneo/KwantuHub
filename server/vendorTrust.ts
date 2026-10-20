import { and, eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import { inquiries, messages, users, vendorProfiles } from "../drizzle/schema";
import { deriveVendorBadges, type VerificationBadgeSummary } from "./vendorVerification";

const MIN_RESPONSE_SAMPLE = 3;

export function getTrustRate(replyCount: number, inquiryCount: number) {
  return inquiryCount >= MIN_RESPONSE_SAMPLE ? replyCount / inquiryCount : null;
}

export function getTypicalResponseSeconds(samples: number[], inquiryCount: number) {
  return inquiryCount >= MIN_RESPONSE_SAMPLE && samples.length
    ? Math.round(samples.reduce((sum, value) => sum + value, 0) / samples.length)
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

export async function getVendorTrustSignals(vendorId: number) {
  const db = await getDb();
  if (!db) {
    return {
      verified: false,
      profileComplete: false,
      responseRate: null,
      recentlyActive: false,
      featuredEligible: false,
      responseSampleSize: 0,
      typicalResponseSeconds: null,
    };
  }
  const [profile] = await db
    .select()
    .from(vendorProfiles)
    .where(eq(vendorProfiles.id, vendorId))
    .limit(1);
  if (!profile) return { verified: false, profileComplete: false, responseRate: null, recentlyActive: false, featuredEligible: false, responseSampleSize: 0, typicalResponseSeconds: null };
  const inquiryRows = await db
    .select({ id: inquiries.id })
    .from(inquiries)
    .where(eq(inquiries.vendorId, vendorId));
  const [replyRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(messages)
    .innerJoin(inquiries, eq(messages.inquiryId, inquiries.id))
    .where(and(eq(inquiries.vendorId, vendorId), eq(messages.senderId, profile.userId)));
  const inquiryCount = inquiryRows.length;
  const replyCount = Number(replyRow?.count || 0);
  const responseRate = getTrustRate(replyCount, inquiryCount);
  const responseMessages = await db
    .select({ inquiryId: messages.inquiryId, senderId: messages.senderId, createdAt: messages.createdAt, buyerId: inquiries.buyerId })
    .from(messages)
    .innerJoin(inquiries, eq(messages.inquiryId, inquiries.id))
    .where(eq(inquiries.vendorId, vendorId))
    .orderBy(messages.createdAt);
  const responseSamples = responseMessages.reduce<number[]>((samples, message, index, all) => {
    if (message.senderId !== message.buyerId) return samples;
    const reply = all.slice(index + 1).find(next => next.inquiryId === message.inquiryId && next.senderId === profile.userId);
    if (reply) samples.push(Math.max(0, (reply.createdAt.getTime() - message.createdAt.getTime()) / 1000));
    return samples;
  }, []);
  const profileComplete = isProfileComplete(profile);
  const recentlyActive = profile.updatedAt.getTime() >= Date.now() - 30 * 24 * 60 * 60 * 1000;
  const verified = profile.approvalStatus === "approved";
  return {
    verified,
    profileComplete,
    responseRate,
    typicalResponseSeconds: getTypicalResponseSeconds(responseSamples, inquiryCount),
    recentlyActive,
    responseSampleSize: inquiryCount,
    featuredEligible: verified && profileComplete && (responseRate === null || responseRate >= 0.6),
  };
}

export async function getVendorVerificationBadges(vendorId: number): Promise<VerificationBadgeSummary> {
  const db = await getDb();
  if (!db) {
    return deriveVendorBadges({
      emailVerified: false,
      phoneVerified: false,
      identityStatus: "unverified",
      residenceStatus: "unverified",
      residenceCountry: null,
      approvalStatus: "pending",
    });
  }
  const [profile] = await db
    .select({
      vendor: vendorProfiles,
      user: users,
    })
    .from(vendorProfiles)
    .innerJoin(users, eq(vendorProfiles.userId, users.id))
    .where(eq(vendorProfiles.id, vendorId))
    .limit(1);

  if (!profile) {
    return deriveVendorBadges({
      emailVerified: false,
      phoneVerified: false,
      identityStatus: "unverified",
      residenceStatus: "unverified",
      residenceCountry: null,
      approvalStatus: "pending",
    });
  }

  return deriveVendorBadges({
    emailVerified: Boolean(profile.user.email && profile.user.emailVerifiedAt),
    phoneVerified: Boolean(profile.user.phone && profile.user.phoneVerifiedAt),
    identityStatus: profile.vendor.identityStatus,
    residenceStatus: profile.vendor.residenceStatus,
    residenceCountry: profile.vendor.residenceCountry,
    approvalStatus: profile.vendor.approvalStatus,
  });
}
