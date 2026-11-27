import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import {
  moderationRecords,
  notificationDeliveries,
  notificationOutbox,
} from "../drizzle/schema";
import type { getDb } from "./db";
import { SEND_IN_PROGRESS, SEND_OUTCOME_UNKNOWN } from "./notificationWorker";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export type DeliveryReconciliation = {
  outcome: "sent" | "not_sent";
  notes: string;
  providerMessageId?: string;
};
export async function recoverNotificationDelivery(
  db: Database,
  actorId: number,
  deliveryId: number,
  reconciliation?: DeliveryReconciliation
) {
  const [reference] = await db
    .select()
    .from(notificationDeliveries)
    .where(eq(notificationDeliveries.id, deliveryId));
  if (!reference)
    throw new TRPCError({ code: "NOT_FOUND", message: "Delivery not found." });
  const outboxId = reference.outboxId;
  if (!outboxId)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "This legacy delivery has no recoverable outbox job.",
    });
  return db.transaction(async tx => {
    const [job] = await tx
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.id, outboxId))
      .for("update");
    const [delivery] = await tx
      .select()
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.id, deliveryId))
      .for("update");
    if (!job || !delivery)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Delivery job not found.",
      });
    if (
      (job.status === "processing" &&
        job.leaseExpiresAt &&
        job.leaseExpiresAt > new Date()) ||
      delivery.failureCode === SEND_IN_PROGRESS
    ) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "A provider send may still be running. Wait for its result or reconciliation status; do not resend.",
      });
    }
    if (
      ["sent", "delivered", "bounced", "complained"].includes(delivery.status)
    )
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "This delivery already has a terminal provider outcome and cannot be resent.",
      });
    const unknown = delivery.failureCode === SEND_OUTCOME_UNKNOWN;
    if (unknown && !reconciliation)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "Check SendPulse first, then explicitly reconcile this unknown outcome as sent or not sent.",
      });
    if (reconciliation && !unknown)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Only unknown provider outcomes need reconciliation.",
      });
    const confirmedMessageId = reconciliation?.providerMessageId?.trim();
    if (reconciliation?.outcome === "sent" && !confirmedMessageId)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Record the confirmed SendPulse message ID when marking a delivery as sent.",
      });
    const sent = reconciliation?.outcome === "sent";
    const now = new Date();
    await tx
      .update(notificationDeliveries)
      .set({
        status: sent ? "sent" : "queued",
        nextAttemptAt: sent ? null : now,
        failureCode: null,
        failureReason: null,
        ...(sent ? { providerMessageId: confirmedMessageId, sentAt: now } : {}),
      })
      .where(eq(notificationDeliveries.id, delivery.id));
    await tx
      .update(notificationOutbox)
      .set({
        status: sent ? "completed" : "queued",
        availableAt: now,
        attempts: 0,
        lockedAt: null,
        lockToken: null,
        leaseExpiresAt: null,
        lastError: null,
        processedAt: sent ? now : null,
      })
      .where(eq(notificationOutbox.id, job.id));
    await tx.insert(moderationRecords).values({
      entityType: "notification",
      entityId: String(delivery.id),
      actorId,
      action: sent
        ? "delivery_confirmed_sent"
        : unknown
          ? "delivery_confirmed_not_sent"
          : "delivery_retry_requested",
      reason:
        reconciliation?.notes || "Retry after a definite provider failure.",
    });
    return { success: true, reconciledAs: reconciliation?.outcome ?? null };
  });
}
