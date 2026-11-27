import { TRPCError } from "@trpc/server";
import { and, eq, gt, inArray } from "drizzle-orm";
import {
  accountOnboarding,
  moderationRecords,
  users,
  vendorProfiles,
  vendorVerificationDecisions,
  vendorVerificationEvidence,
  vendorVerificationSessions,
} from "../drizzle/schema";
import { getDb } from "./db";
import {
  assertManualSessionReviewable,
  evidenceSupportsCheck,
  sessionChecks,
} from "./verificationPolicy";
import { isNorthAmericaCountry } from "./vendorVerification";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export async function reviewManualVerification(
  db: Database,
  actorId: number,
  input: {
    sessionId: number;
    action: "approve" | "decline";
    reviewerNotes?: string;
    declinedReason?: string;
    countryCode?: "US" | "CA" | "MX";
    checkType?: "identity" | "residence";
  }
) {
  const [reference] = await db
    .select()
    .from(vendorVerificationSessions)
    .where(eq(vendorVerificationSessions.id, input.sessionId));
  if (!reference)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Verification session not found.",
    });
  return db.transaction(async tx => {
    await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, reference.userId))
      .for("update");
    const [profile] = await tx
      .select()
      .from(vendorProfiles)
      .where(eq(vendorProfiles.id, reference.vendorId))
      .for("update");
    const [session] = await tx
      .select()
      .from(vendorVerificationSessions)
      .where(eq(vendorVerificationSessions.id, input.sessionId))
      .for("update");
    if (!session)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Verification session not found.",
      });
    assertManualSessionReviewable(session);
    if (!profile)
      throw new TRPCError({ code: "NOT_FOUND", message: "Vendor not found." });
    const requested = sessionChecks(session.sessionType);
    if (
      (!input.checkType && requested.length > 1) ||
      (input.checkType && !requested.includes(input.checkType))
    )
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Choose one check requested by this session. Combined sessions require separate decisions.",
      });
    const checks = input.checkType ? [input.checkType] : requested;
    const previous = await tx
      .select()
      .from(vendorVerificationDecisions)
      .where(eq(vendorVerificationDecisions.sessionId, session.id));
    if (previous.some(decision => checks.includes(decision.checkType)))
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "This check already has a final decision. Start a new session for resubmission.",
      });
    const newer = await tx
      .select()
      .from(vendorVerificationSessions)
      .where(
        and(
          eq(vendorVerificationSessions.vendorId, session.vendorId),
          gt(vendorVerificationSessions.id, session.id),
          inArray(vendorVerificationSessions.status, [
            "created",
            "submitted",
            "in_review",
            "approved",
          ])
        )
      );
    if (
      newer.some(session =>
        sessionChecks(session.sessionType).some(check => checks.includes(check))
      )
    )
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "A newer verification session supersedes this check. Review the current session.",
      });
    const [onboarding] = await tx
      .select()
      .from(accountOnboarding)
      .where(eq(accountOnboarding.userId, session.userId));
    if (checks.includes("identity") && onboarding?.kycSessionId)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "Account identity is managed through Didit onboarding. Manual review cannot replace that identity.",
      });
    const evidence = await tx
      .select()
      .from(vendorVerificationEvidence)
      .where(eq(vendorVerificationEvidence.sessionId, session.id))
      .for("update");
    const now = new Date();
    const verified = input.action === "approve";
    const reason = (
      verified
        ? input.reviewerNotes
        : input.declinedReason || input.reviewerNotes
    )?.trim();
    if (!reason || reason.length < 3 || reason.length > 1000)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Record a 3-1000 character reason for this per-check decision.",
      });
    const country = input.countryCode || session.countryCode;
    if (
      verified &&
      checks.includes("residence") &&
      (!isNorthAmericaCountry(country) || country !== session.countryCode)
    )
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Residence evidence must establish the session's supported country. Start a new session to correct the country.",
      });
    for (const check of checks) {
      const suitable = evidenceSupportsCheck(check, evidence, now);
      if (verified && !suitable.length)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            check === "identity"
              ? "A current government ID document is required."
              : "A current utility bill, bank statement or residential lease is required.",
        });
      await tx.insert(vendorVerificationDecisions).values({
        sessionId: session.id,
        checkType: check,
        outcome: verified ? "verified" : "rejected",
        evidenceIds: suitable.map(item => item.id),
        countryCode: check === "residence" ? country : null,
        actorId,
        reason,
      });
    }
    const state = verified ? "verified" : "rejected";
    await tx
      .update(vendorProfiles)
      .set({
        ...(checks.includes("identity")
          ? {
              identityStatus: state,
              identityVerifiedAt: verified ? now : null,
              identityVerificationSessionId: session.id,
            }
          : {}),
        ...(checks.includes("residence")
          ? {
              residenceStatus: state,
              residenceVerifiedAt: verified ? now : null,
              residenceCountry: verified ? country : profile.residenceCountry,
              residenceVerificationSessionId: session.id,
            }
          : {}),
      })
      .where(eq(vendorProfiles.id, profile.id));
    const complete = previous.length + checks.length === requested.length;
    const status = complete
      ? verified && previous.every(decision => decision.outcome === "verified")
        ? "approved"
        : "declined"
      : "in_review";
    await tx
      .update(vendorVerificationSessions)
      .set({
        status,
        reviewedBy: actorId,
        reviewedAt: now,
        reviewerNotes: input.reviewerNotes,
        declinedReason: verified ? session.declinedReason : reason,
      })
      .where(eq(vendorVerificationSessions.id, session.id));
    await tx.insert(moderationRecords).values({
      entityType: "vendor",
      entityId: String(profile.id),
      actorId,
      action: verified ? "verification_approved" : "verification_declined",
      reason: JSON.stringify({ sessionId: session.id, checks, reason }),
    });
    return { success: true, status };
  });
}
