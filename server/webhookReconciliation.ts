import { and, asc, inArray, lt } from "drizzle-orm";
import { notificationWebhookEvents } from "../drizzle/schema";
import type { getDb } from "./db";
import { DIDIT_PROVIDER, reprocessDiditWebhookEvent } from "./diditWebhook";
import {
  processSendPulseWebhookEvent,
  SENDPULSE_PROVIDER,
} from "./sendPulseWebhook";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/** Events that keep failing stop being retried automatically and stay "failed" for operators. */
export const WEBHOOK_MAX_AUTOMATIC_ATTEMPTS = 25;
const MAX_BACKOFF_MS = 60 * 60 * 1000;

export function webhookRetryDelayMs(attempts: number) {
  return Math.min(
    MAX_BACKOFF_MS,
    60_000 * 2 ** Math.max(0, Math.min(attempts, 16) - 1)
  );
}

export function isWebhookEventDue(
  event: { processingAttempts: number; updatedAt: Date },
  now: Date
) {
  return (
    event.processingAttempts < WEBHOOK_MAX_AUTOMATIC_ATTEMPTS &&
    now.getTime() - event.updatedAt.getTime() >=
      webhookRetryDelayMs(event.processingAttempts)
  );
}

/**
 * Re-applies provider webhook events that were received but not applied (early callbacks,
 * crashes, transient database failures). Processing is idempotent per provider+event ID.
 */
export async function reconcilePendingWebhookEvents(
  db: Database,
  options: { now?: Date; limit?: number; signal?: AbortSignal } = {}
) {
  const now = options.now ?? new Date();
  const candidates = await db
    .select()
    .from(notificationWebhookEvents)
    .where(
      and(
        inArray(notificationWebhookEvents.provider, [
          SENDPULSE_PROVIDER,
          DIDIT_PROVIDER,
        ]),
        inArray(notificationWebhookEvents.processingStatus, [
          "received",
          "failed",
        ]),
        lt(
          notificationWebhookEvents.processingAttempts,
          WEBHOOK_MAX_AUTOMATIC_ATTEMPTS
        ),
        lt(
          notificationWebhookEvents.updatedAt,
          new Date(now.getTime() - 60_000)
        )
      )
    )
    .orderBy(asc(notificationWebhookEvents.updatedAt))
    .limit(options.limit ?? 50);
  const result = {
    checked: 0,
    processed: 0,
    pending: 0,
    ignored: 0,
    failed: 0,
  };
  for (const event of candidates) {
    if (options.signal?.aborted) break;
    if (!isWebhookEventDue(event, now)) continue;
    result.checked += 1;
    try {
      const outcome =
        event.provider === SENDPULSE_PROVIDER
          ? await processSendPulseWebhookEvent(db, event.providerEventId, {
              now,
            })
          : await reprocessDiditWebhookEvent(db, event, now);
      if (outcome === "processed" || outcome === "duplicate")
        result.processed += 1;
      else if (outcome === "pending") result.pending += 1;
      else result.ignored += 1;
    } catch (error) {
      result.failed += 1;
      console.error(
        "[WebhookReconciliation] event retry failed",
        event.provider,
        error instanceof Error ? error.name : "UnknownError"
      );
    }
  }
  return result;
}
