import { and, eq, gt } from "drizzle-orm";
import {
  accountOnboarding,
  vendorProfiles,
  vendorVerificationDecisions,
  vendorVerificationSessions,
} from "../drizzle/schema";
import type { DiditDecisionRecorder } from "./diditWebhook";
import { sessionChecks } from "./verificationPolicy";
import { isNorthAmericaCountry } from "./vendorVerification";

export const recordDiditVerificationDecisions: DiditDecisionRecorder = async (
  tx,
  input
) => {
  const [session] = await tx
    .select()
    .from(vendorVerificationSessions)
    .where(eq(vendorVerificationSessions.id, input.sessionId));
  if (
    !session ||
    session.provider !== "didit" ||
    session.userId !== input.userId ||
    session.vendorId !== input.vendorId
  ) {
    throw new Error("Didit decision does not match its owned session.");
  }
  const [profile] = await tx
    .select()
    .from(vendorProfiles)
    .where(eq(vendorProfiles.id, input.vendorId))
    .for("update");
  if (!profile || profile.userId !== input.userId)
    throw new Error("Didit vendor ownership mismatch.");
  const newer = await tx
    .select()
    .from(vendorVerificationSessions)
    .where(
      and(
        eq(vendorVerificationSessions.vendorId, input.vendorId),
        gt(vendorVerificationSessions.id, input.sessionId)
      )
    )
    .for("update");
  const [onboarding] = await tx
    .select()
    .from(accountOnboarding)
    .where(eq(accountOnboarding.userId, input.userId))
    .for("update");
  const requested = sessionChecks(session.sessionType);
  for (const decision of input.decisions) {
    if (!requested.includes(decision.checkType)) continue;
    if (
      decision.checkType === "identity" &&
      onboarding &&
      (!input.activeOnboarding || !input.identityMatches) &&
      decision.outcome === "verified"
    )
      continue;
    if (
      decision.checkType === "residence" &&
      decision.outcome === "verified" &&
      (!isNorthAmericaCountry(decision.countryCode) ||
        decision.countryCode !== session.countryCode)
    ) {
      throw new Error(
        "Didit residence decision lacks an eligible matching country."
      );
    }
    await tx
      .insert(vendorVerificationDecisions)
      .values({
        sessionId: session.id,
        checkType: decision.checkType,
        outcome: decision.outcome,
        countryCode: decision.countryCode,
        reason: decision.reason,
        providerEventId: input.providerEventId,
        decidedAt: input.eventAt,
      })
      .onDuplicateKeyUpdate({
        set: { providerEventId: input.providerEventId },
      });
    if (
      newer.some(candidate =>
        sessionChecks(candidate.sessionType).includes(decision.checkType)
      )
    )
      continue;
    if (
      decision.checkType === "identity" &&
      onboarding &&
      !input.activeOnboarding
    )
      continue;
    const verified = decision.outcome === "verified";
    await tx
      .update(vendorProfiles)
      .set(
        decision.checkType === "identity"
          ? {
              identityStatus: decision.outcome,
              identityVerifiedAt: verified ? input.eventAt : null,
              identityVerificationSessionId: session.id,
            }
          : {
              residenceStatus: decision.outcome,
              residenceVerifiedAt: verified ? input.eventAt : null,
              residenceVerificationSessionId: session.id,
              ...(verified ? { residenceCountry: decision.countryCode } : {}),
            }
      )
      .where(eq(vendorProfiles.id, profile.id));
  }
};
