import { describe, expect, it } from "vitest";
import {
  assertManualSessionReviewable,
  evidenceSupportsCheck,
  sessionChecks,
} from "./verificationPolicy";
import {
  EVIDENCE_DELETION_POLICY,
  runEvidenceRetentionCleanup,
} from "./evidenceRetention";
import type { getDb } from "./db";
import type {
  vendorVerificationEvidence,
  vendorVerificationSessions,
} from "../drizzle/schema";
import { selectVerificationAdapter } from "./vendorVerificationAdapters";

const session: typeof vendorVerificationSessions.$inferSelect = {
  id: 1,
  vendorId: 1,
  userId: 1,
  provider: "manual",
  providerSessionId: null,
  sessionType: "proof_of_residence",
  status: "in_review",
  countryCode: "CA",
  consentGivenAt: new Date(),
  declinedReason: null,
  reviewerNotes: null,
  reviewedBy: null,
  reviewedAt: null,
  expiresAt: new Date("2099-01-01"),
  metadata: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const evidence: typeof vendorVerificationEvidence.$inferSelect = {
  id: 1,
  sessionId: 1,
  evidenceType: "utility_bill",
  fileStoragePath: "private/verification/1/file.pdf",
  redactedSummary: null,
  retentionExpiresAt: new Date("2099-01-01"),
  legalHoldAt: null,
  legalHoldReason: null,
  deletionAttempts: 0,
  lastDeletionError: null,
  deletedAt: null,
  createdAt: new Date(),
};
describe("independent verification policy", () => {
  it("disables incomplete provider integrations rather than fabricating hosted sessions", async () => {
    for (const provider of ["veriff", "sumsub"] as const) {
      const adapter = selectVerificationAdapter(provider);
      expect(adapter.isConfigured()).toBe(false);
      await expect(
        adapter.createSession({
          userId: 1,
          vendorId: 1,
          sessionType: "identity_document",
          countryCode: "CA",
        })
      ).rejects.toThrow(/disabled/);
    }
  });
  it("scopes checks without treating liveness as government identity or residence", () => {
    expect(sessionChecks("proof_of_residence")).toEqual(["residence"]);
    expect(sessionChecks("identity_document")).toEqual(["identity"]);
    expect(sessionChecks("liveness")).toEqual([]);
  });
  it("rejects hosted, terminal, expired and liveness manual decisions/uploads", () => {
    expect(() => assertManualSessionReviewable(session)).not.toThrow();
    for (const state of [
      "approved",
      "declined",
      "expired",
      "abandoned",
    ] as const) {
      expect(() =>
        assertManualSessionReviewable({ ...session, status: state })
      ).toThrow();
    }
    expect(() =>
      assertManualSessionReviewable({ ...session, provider: "didit" })
    ).toThrow();
    expect(() =>
      assertManualSessionReviewable({ ...session, expiresAt: new Date(0) })
    ).toThrow();
    expect(() =>
      assertManualSessionReviewable({ ...session, sessionType: "liveness" })
    ).toThrow();
  });
  it("requires suitable current private documents per check", () => {
    expect(evidenceSupportsCheck("residence", [evidence])).toHaveLength(1);
    expect(evidenceSupportsCheck("identity", [evidence])).toHaveLength(0);
    expect(
      evidenceSupportsCheck("residence", [
        { ...evidence, evidenceType: "business_registration" },
      ])
    ).toHaveLength(0);
    expect(
      evidenceSupportsCheck("residence", [
        { ...evidence, deletedAt: new Date() },
      ])
    ).toHaveLength(0);
    expect(
      evidenceSupportsCheck("residence", [
        { ...evidence, retentionExpiresAt: new Date(0) },
      ])
    ).toHaveLength(0);
  });
  it("keeps physical deletion unconditionally disabled before database or object access", async () => {
    const unavailableDb = new Proxy(
      {},
      {
        get() {
          throw new Error("Deletion must not reach the database");
        },
      }
    ) as NonNullable<Awaited<ReturnType<typeof getDb>>>;
    expect(EVIDENCE_DELETION_POLICY.approved).toBe(false);
    expect(Object.isFrozen(EVIDENCE_DELETION_POLICY)).toBe(true);
    expect(await runEvidenceRetentionCleanup(unavailableDb, 1)).toMatchObject({
      enabled: false,
      deleted: 0,
      failed: 0,
    });
  });
});
