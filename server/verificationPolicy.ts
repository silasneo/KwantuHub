import { TRPCError } from "@trpc/server";
import type {
  vendorVerificationEvidence,
  vendorVerificationSessions,
} from "../drizzle/schema";

export type VerificationCheck = "identity" | "residence";
export type SessionType =
  typeof vendorVerificationSessions.$inferSelect.sessionType;
type Evidence = typeof vendorVerificationEvidence.$inferSelect;

export function sessionChecks(type: SessionType): VerificationCheck[] {
  if (type === "combined_na_vendor") return ["identity", "residence"];
  if (type === "identity_document") return ["identity"];
  if (type === "proof_of_residence") return ["residence"];
  return [];
}

export function assertManualSessionReviewable(
  session: typeof vendorVerificationSessions.$inferSelect,
  now = new Date()
) {
  if (session.provider !== "manual")
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Hosted verification decisions must come from the signed provider result, not manual approval.",
    });
  if (
    !session.expiresAt ||
    session.expiresAt <= now ||
    !["created", "submitted", "in_review"].includes(session.status)
  )
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "This verification session is expired or already decided. Start a new session.",
    });
  if (!sessionChecks(session.sessionType).length)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Manual documents cannot establish a live face match.",
    });
}

export function evidenceSupportsCheck(
  check: VerificationCheck,
  evidence: Evidence[],
  now = new Date()
) {
  const types =
    check === "identity"
      ? ["government_id"]
      : ["utility_bill", "bank_statement", "lease_agreement"];
  return evidence.filter(
    item =>
      !item.deletedAt &&
      item.retentionExpiresAt &&
      item.retentionExpiresAt > now &&
      item.fileStoragePath.startsWith("private/verification/") &&
      types.includes(item.evidenceType)
  );
}
