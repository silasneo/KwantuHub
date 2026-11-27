import { TRPCError } from "@trpc/server";
import { and, eq, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import {
  moderationRecords,
  vendorVerificationEvidence,
} from "../drizzle/schema";
import { getDb } from "./db";
import { protectedProcedure } from "./_core/trpc";
import { storageDelete } from "./storage";

export const EVIDENCE_DELETION_POLICY = Object.freeze({
  approved: false,
  reason:
    "Physical deletion is disabled pending product-owner approval of retention periods and legal-hold rules.",
});

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export async function runEvidenceRetentionCleanup(
  db: Database,
  actorId: number
) {
  if (!EVIDENCE_DELETION_POLICY.approved)
    return {
      enabled: false,
      deleted: 0,
      failed: 0,
      reason: EVIDENCE_DELETION_POLICY.reason,
    };
  const candidates = await db
    .select({ id: vendorVerificationEvidence.id })
    .from(vendorVerificationEvidence)
    .where(
      and(
        lte(vendorVerificationEvidence.retentionExpiresAt, new Date()),
        isNull(vendorVerificationEvidence.legalHoldAt),
        isNull(vendorVerificationEvidence.deletedAt)
      )
    )
    .orderBy(
      vendorVerificationEvidence.deletionAttempts,
      vendorVerificationEvidence.id
    )
    .limit(25);
  let deleted = 0;
  let failed = 0;
  for (const candidate of candidates) {
    const result = await db.transaction(async tx => {
      const [item] = await tx
        .select()
        .from(vendorVerificationEvidence)
        .where(eq(vendorVerificationEvidence.id, candidate.id))
        .for("update");
      if (
        !item ||
        item.legalHoldAt ||
        item.deletedAt ||
        !item.retentionExpiresAt ||
        item.retentionExpiresAt > new Date()
      )
        return "skipped";
      await tx
        .update(vendorVerificationEvidence)
        .set({ deletionAttempts: item.deletionAttempts + 1 })
        .where(eq(vendorVerificationEvidence.id, item.id));
      try {
        if (!item.fileStoragePath.startsWith("private/verification/"))
          throw new Error("Invalid evidence prefix");
        await storageDelete(item.fileStoragePath);
      } catch (error) {
        console.error("[EvidenceRetention] Object deletion failed", {
          evidenceId: item.id,
          error: error instanceof Error ? error.name : "Error",
        });
        await tx
          .update(vendorVerificationEvidence)
          .set({
            lastDeletionError:
              "Private storage deletion failed; retry required.",
          })
          .where(eq(vendorVerificationEvidence.id, item.id));
        await tx.insert(moderationRecords).values({
          entityType: "vendor",
          entityId: `evidence:${item.id}`,
          actorId,
          action: "evidence_delete_failed",
          reason: "Storage failure; object remains scheduled for retry.",
        });
        return "failed";
      }
      await tx
        .update(vendorVerificationEvidence)
        .set({
          deletedAt: new Date(),
          fileStoragePath: "",
          redactedSummary: null,
          lastDeletionError: null,
        })
        .where(eq(vendorVerificationEvidence.id, item.id));
      await tx.insert(moderationRecords).values({
        entityType: "vendor",
        entityId: `evidence:${item.id}`,
        actorId,
        action: "evidence_deleted",
        reason:
          "Approved retention policy; object and stored reference removed, minimal audit tombstone retained.",
      });
      return "deleted";
    });
    if (result === "deleted") deleted++;
    if (result === "failed") failed++;
  }
  return {
    enabled: true,
    deleted,
    failed,
    reason: "Bounded retention batch completed.",
  };
}

export const adminEvidenceRetentionProcedures = {
  evidenceRetentionStatus: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const expired = await db
      .select({
        id: vendorVerificationEvidence.id,
        sessionId: vendorVerificationEvidence.sessionId,
        expiresAt: vendorVerificationEvidence.retentionExpiresAt,
        legalHoldAt: vendorVerificationEvidence.legalHoldAt,
        legalHoldReason: vendorVerificationEvidence.legalHoldReason,
        deletionAttempts: vendorVerificationEvidence.deletionAttempts,
        lastDeletionError: vendorVerificationEvidence.lastDeletionError,
      })
      .from(vendorVerificationEvidence)
      .where(
        and(
          lte(vendorVerificationEvidence.retentionExpiresAt, new Date()),
          isNull(vendorVerificationEvidence.deletedAt)
        )
      )
      .orderBy(vendorVerificationEvidence.id)
      .limit(100);
    return {
      deletionEnabled: EVIDENCE_DELETION_POLICY.approved,
      reason: EVIDENCE_DELETION_POLICY.reason,
      expired,
    };
  }),
  setEvidenceLegalHold: protectedProcedure
    .input(
      z.object({
        evidenceId: z.number().int().positive(),
        held: z.boolean(),
        reason: z.string().trim().min(3).max(1000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin" || !ctx.user.emailVerifiedAt)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "A verified administrator is required.",
        });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.transaction(async tx => {
        const [item] = await tx
          .select()
          .from(vendorVerificationEvidence)
          .where(eq(vendorVerificationEvidence.id, input.evidenceId))
          .for("update");
        if (!item || item.deletedAt)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Retained evidence not found.",
          });
        await tx
          .update(vendorVerificationEvidence)
          .set({
            legalHoldAt: input.held ? new Date() : null,
            legalHoldReason: input.held ? input.reason : null,
          })
          .where(eq(vendorVerificationEvidence.id, item.id));
        await tx.insert(moderationRecords).values({
          entityType: "vendor",
          entityId: `evidence:${item.id}`,
          actorId: ctx.user.id,
          action: input.held ? "evidence_hold_set" : "evidence_hold_released",
          reason: input.reason,
        });
        return {
          success: true,
          deletionEnabled: EVIDENCE_DELETION_POLICY.approved,
        };
      });
    }),
  runEvidenceCleanup: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user.role !== "admin" || !ctx.user.emailVerifiedAt)
      throw new TRPCError({ code: "FORBIDDEN" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return runEvidenceRetentionCleanup(db, ctx.user.id);
  }),
};
