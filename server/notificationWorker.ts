import {
  and,
  asc,
  eq,
  inArray,
  isNull,
  isNotNull,
  lte,
  lt,
  sql,
} from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  notificationDeliveries,
  notificationOutbox,
  notificationPreferences,
  notificationSuppressions,
  notifications,
  notificationWebhookEvents,
  systemSettings,
  verificationChallenges,
  users,
  type NotificationOutbox,
} from "../drizzle/schema";
import { drizzle } from "drizzle-orm/mysql2";
import { SendPulseTransactionalEmailAdapter } from "./sendPulseAdapter";
import { decryptOtp } from "./contactVerification";

export type NotificationEventType =
  | "INQUIRY_CREATED"
  | "INQUIRY_REPLY_RECEIVED"
  | "INQUIRY_RESOLVED"
  | "VENDOR_APPROVED"
  | "VENDOR_REJECTED"
  | "REVIEW_MODERATED"
  | "EMAIL_ADDRESS_ACTION_REQUIRED"
  | "EMAIL_DELIVERY_ALERT"
  | "CONTACT_VERIFICATION_OTP";

export type NotificationEvent = {
  eventType: NotificationEventType;
  idempotencyKey: string;
  recipientUserId: number;
  actorUserId?: number | null;
  entityType: string;
  entityId: number;
  payload: Record<string, unknown>;
};

type NotificationDatabase = ReturnType<typeof drizzle>;

export function toNotificationType(eventType: NotificationEventType) {
  return eventType.toLowerCase() as
    | "inquiry_created"
    | "inquiry_reply_received"
    | "inquiry_resolved"
    | "vendor_approved"
    | "vendor_rejected"
    | "review_moderated"
    | "email_address_action_required"
    | "email_delivery_alert"
    | "contact_verification_otp";
}

export function getEmailPreferenceField(eventType: NotificationEventType) {
  switch (eventType) {
    case "INQUIRY_CREATED":
      return "emailInquiries" as const;
    case "INQUIRY_REPLY_RECEIVED":
      return "emailReplies" as const;
    case "INQUIRY_RESOLVED":
      return "emailResolutions" as const;
    default:
      return "emailAccount" as const;
  }
}

export function calculateRetryDelay(attempt: number): number {
  const boundedAttempt = Math.max(1, Math.min(attempt, 6));
  return Math.min(2 * 60 * 60 * 1000, 60 * 1000 * 2 ** (boundedAttempt - 1));
}

export function notificationCopy(event: NotificationEvent) {
  const payload = event.payload;
  switch (event.eventType) {
    case "INQUIRY_CREATED":
      return {
        title: "New inquiry received",
        body: String(payload.subject || "A buyer sent a new inquiry."),
      };
    case "INQUIRY_REPLY_RECEIVED":
      return {
        title: "New inquiry reply",
        body: String(payload.subject || "You received a reply to your inquiry."),
      };
    case "INQUIRY_RESOLVED":
      return {
        title: "Inquiry resolved",
        body: String(payload.subject || "An inquiry was marked as resolved."),
      };
    case "VENDOR_APPROVED":
      return { title: "Vendor application approved", body: "Your vendor profile is now approved." };
    case "VENDOR_REJECTED":
      return { title: "Vendor application update", body: "Your vendor application needs attention." };
    case "REVIEW_MODERATED":
      return { title: "Review moderation update", body: "Your review status has changed." };
    case "EMAIL_ADDRESS_ACTION_REQUIRED":
      return {
        title: "Your email address needs attention",
        body: String(payload.body || "A transactional email could not be delivered. Update your email address in your profile."),
      };
    case "EMAIL_DELIVERY_ALERT":
      return {
        title: "Email delivery alert",
        body: String(payload.body || "SendPulse reported a delivery problem that needs review."),
      };
    case "CONTACT_VERIFICATION_OTP":
      return {
        title: "Verify your KwantuHub email",
        body: "Use the one-time code sent to your email address to complete verification.",
      };
  }
}

export async function enqueueNotificationEvent(
  db: NotificationDatabase,
  event: NotificationEvent
) {
  await db
    .insert(notificationOutbox)
    .values({
      idempotencyKey: event.idempotencyKey,
      eventType: event.eventType,
      recipientUserId: event.recipientUserId,
      actorUserId: event.actorUserId ?? null,
      entityType: event.entityType,
      entityId: event.entityId,
      payload: event.payload,
    })
    .onDuplicateKeyUpdate({ set: { idempotencyKey: event.idempotencyKey } });
}

export async function getOrCreateNotificationPreferences(
  db: NotificationDatabase,
  userId: number
) {
  await db
    .insert(notificationPreferences)
    .values({ userId })
    .onDuplicateKeyUpdate({ set: { userId } });
  const [preferences] = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);
  return preferences;
}

async function processOutboxRow(
  db: NotificationDatabase,
  row: NotificationOutbox,
  emailAdapter?: SendPulseTransactionalEmailAdapter,
  emailPaused = false
) {
  const eventType = row.eventType as NotificationEventType;
  const payload = (row.payload || {}) as Record<string, unknown>;
  if (eventType === "CONTACT_VERIFICATION_OTP") {
    await deliverContactVerificationEmail(db, row, emailAdapter);
    return;
  }
  const preferences = await getOrCreateNotificationPreferences(db, row.recipientUserId);
  const copy = notificationCopy({
    eventType,
    idempotencyKey: row.idempotencyKey,
    recipientUserId: row.recipientUserId,
    actorUserId: row.actorUserId,
    entityType: row.entityType,
    entityId: row.entityId,
    payload,
  });
  let notificationId: number | undefined;

  if (preferences?.inAppEnabled) {
    const [existing] = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientUserId, row.recipientUserId),
          eq(notifications.notificationType, toNotificationType(eventType)),
          eq(notifications.entityType, row.entityType),
          eq(notifications.entityId, row.entityId)
        )
      )
      .limit(1);

    if (existing) {
      notificationId = existing.id;
    } else {
      const [created] = await db.insert(notifications).values({
        recipientUserId: row.recipientUserId,
        actorUserId: row.actorUserId,
        notificationType: toNotificationType(eventType),
        entityType: row.entityType,
        entityId: row.entityId,
        inquiryId: typeof payload.inquiryId === "number" ? payload.inquiryId : null,
        listingId: typeof payload.listingId === "number" ? payload.listingId : null,
        title: copy.title,
        body: copy.body,
        actionUrl: typeof payload.actionUrl === "string" ? payload.actionUrl : null,
        metadata: payload,
      });
      notificationId = created.insertId;
    }

    if (notificationId) {
      await db.insert(notificationDeliveries).values({
        notificationId,
        outboxId: row.id,
        recipientUserId: row.recipientUserId,
        channel: "in_app",
        provider: "internal",
        status: "delivered",
        attempts: 1,
        sentAt: new Date(),
        deliveredAt: new Date(),
      });
    }
  }

  const emailPreference = getEmailPreferenceField(eventType);
  if (preferences?.[emailPreference]) {
    const [recipient] = await db
      .select({ email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, row.recipientUserId))
      .limit(1);
    if (recipient?.email) {
      await deliverEmailNotification(db, row, notificationId, recipient, copy, emailAdapter, emailPaused);
    }
  }
}

async function deliverContactVerificationEmail(
  db: NotificationDatabase,
  row: NotificationOutbox,
  adapter = new SendPulseTransactionalEmailAdapter()
) {
  const challengeId = Number((row.payload as Record<string, unknown> | null)?.challengeId);
  if (!Number.isInteger(challengeId) || challengeId <= 0) {
    throw new Error("OTP challenge is missing");
  }
  const [challenge] = await db
    .select()
    .from(verificationChallenges)
    .where(eq(verificationChallenges.id, challengeId))
    .limit(1);
  if (!challenge || challenge.consumedAt || challenge.expiresAt.getTime() <= Date.now()) {
    throw new Error("OTP challenge is expired or unavailable");
  }
  const [recipient] = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, row.recipientUserId))
    .limit(1);
  if (!recipient?.email) throw new Error("OTP recipient email is missing");
  const code = decryptOtp(challenge.codeCiphertext);
  await adapter.send({
    to: [{ email: recipient.email, name: recipient.name }],
    subject: "Your KwantuHub verification code",
    text: `Your KwantuHub verification code is ${code}. It expires in 10 minutes. If you did not request this, you can ignore this email.`,
    html: `<p>Your KwantuHub verification code is <strong>${code}</strong>.</p><p>It expires in 10 minutes. If you did not request this, you can ignore this email.</p>`,
    idempotencyKey: row.idempotencyKey,
  });
}

async function deliverEmailNotification(
  db: NotificationDatabase,
  row: NotificationOutbox,
  notificationId: number | undefined,
  recipient: { email: string | null; name: string | null },
  copy: { title: string; body: string },
  adapter = new SendPulseTransactionalEmailAdapter(),
  emailPaused = false
) {
  if (!recipient.email) return;
  const [existing] = await db
    .select()
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.outboxId, row.id),
        eq(notificationDeliveries.channel, "email")
      )
    )
    .limit(1);
  if (existing?.status === "sent" || existing?.status === "delivered") return;

  const deliveryId = existing?.id ?? (
    await db.insert(notificationDeliveries).values({
      notificationId: notificationId ?? null,
      outboxId: row.id,
      recipientUserId: row.recipientUserId,
      channel: "email",
      provider: adapter.provider,
      status: "queued",
      nextAttemptAt: new Date(),
    })
  )[0].insertId;

  if (!adapter.isConfigured()) {
    await db
      .update(notificationDeliveries)
      .set({ provider: adapter.provider, status: "queued", nextAttemptAt: new Date() })
      .where(eq(notificationDeliveries.id, deliveryId));
    return;
  }

  if (emailPaused) {
    await db
      .update(notificationDeliveries)
      .set({
        provider: adapter.provider,
        status: "queued",
        nextAttemptAt: new Date(Date.now() + 5 * 60 * 1000),
      })
      .where(eq(notificationDeliveries.id, deliveryId));
    return;
  }

  const normalizedEmail = recipient.email.trim().toLowerCase();
  const [suppression] = await db
    .select({ reason: notificationSuppressions.reason })
    .from(notificationSuppressions)
    .where(
      and(
        eq(notificationSuppressions.provider, adapter.provider),
        eq(notificationSuppressions.email, normalizedEmail),
        eq(notificationSuppressions.active, true)
      )
    )
    .limit(1);
  if (suppression) {
    await db
      .update(notificationDeliveries)
      .set({
        provider: adapter.provider,
        status: "failed",
        failureCode: "suppressed",
        failureReason: `Suppressed by ${suppression.reason}`,
        lastAttemptAt: new Date(),
      })
      .where(eq(notificationDeliveries.id, deliveryId));
    return;
  }

  try {
    const result = await adapter.send({
      to: [{ email: recipient.email, name: recipient.name }],
      subject: copy.title,
      text: copy.body,
      html: `<p>${escapeHtml(copy.body)}</p>${
        typeof row.payload === "object" && row.payload && "actionUrl" in row.payload
          ? `<p><a href="${escapeHtml(String((row.payload as Record<string, unknown>).actionUrl))}">View in KwantuHub</a></p>`
          : ""
      }`,
      idempotencyKey: `${row.idempotencyKey}:email`,
    });
    await db
      .update(notificationDeliveries)
      .set({
        provider: adapter.provider,
        providerMessageId: result.providerMessageId,
        status: "sent",
        attempts: sql`${notificationDeliveries.attempts} + 1`,
        lastAttemptAt: new Date(),
        sentAt: new Date(),
        failureCode: null,
        failureReason: null,
      })
      .where(eq(notificationDeliveries.id, deliveryId));
  } catch (error) {
    await db
      .update(notificationDeliveries)
      .set({
        provider: adapter.provider,
        status: "failed",
        attempts: sql`${notificationDeliveries.attempts} + 1`,
        lastAttemptAt: new Date(),
        failureReason: error instanceof Error ? error.message : String(error),
      })
      .where(eq(notificationDeliveries.id, deliveryId));
    throw error;
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

export async function processNotificationOutboxBatch(
  db: NotificationDatabase,
  options: {
    limit?: number;
    now?: Date;
    emailAdapter?: SendPulseTransactionalEmailAdapter;
    leaseMs?: number;
  } = {}
) {
  const now = options.now ?? new Date();
  const limit = Math.max(1, Math.min(options.limit ?? 10, 50));
  const leaseMs = Math.max(options.leaseMs ?? 60_000, 15_000);
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);
  const [reclaimedResult] = await db
    .update(notificationOutbox)
    .set({
      status: "failed",
      availableAt: now,
      lockedAt: null,
      lockToken: null,
      leaseExpiresAt: null,
      lastError: "Worker lease expired; item reclaimed",
    })
    .where(and(eq(notificationOutbox.status, "processing"), lte(notificationOutbox.leaseExpiresAt, now)));
  const reclaimed = Number(reclaimedResult?.affectedRows || 0);
  const [pauseSetting] = await db
    .select({ booleanValue: systemSettings.booleanValue })
    .from(systemSettings)
    .where(eq(systemSettings.settingKey, "email_delivery_paused"))
    .limit(1);
  const emailPaused = pauseSetting?.booleanValue === true;
  const candidates = await db
    .select()
    .from(notificationOutbox)
    .where(
      and(
        inArray(notificationOutbox.status, ["queued", "failed"]),
        lte(notificationOutbox.availableAt, now)
      )
    )
    .orderBy(asc(notificationOutbox.availableAt))
    .limit(limit);

  let completed = 0;
  let failed = 0;
  let dead = 0;
  let skipped = 0;
  for (const candidate of candidates) {
    const lockToken = randomUUID();
    const [claimed] = await db
      .update(notificationOutbox)
      .set({
        status: "processing",
        lockedAt: now,
        lockToken,
        leaseExpiresAt,
        lastAttemptAt: now,
        attempts: sql`${notificationOutbox.attempts} + 1`,
      })
      .where(
        and(
          eq(notificationOutbox.id, candidate.id),
          inArray(notificationOutbox.status, ["queued", "failed"]),
          lte(notificationOutbox.availableAt, now)
        )
      );
    if (!claimed || claimed.affectedRows === 0) {
      skipped += 1;
      continue;
    }

    const attempt = candidate.attempts + 1;
    try {
      await processOutboxRow(db, candidate, options.emailAdapter, emailPaused);
      await db
        .update(notificationOutbox)
        .set({ status: "completed", processedAt: new Date(), lockedAt: null, lockToken: null, leaseExpiresAt: null })
        .where(and(eq(notificationOutbox.id, candidate.id), eq(notificationOutbox.lockToken, lockToken)));
      completed += 1;
    } catch (error) {
      const terminal = attempt >= 6;
      await db
        .update(notificationOutbox)
        .set({
          status: terminal ? "dead" : "failed",
          availableAt: new Date(Date.now() + calculateRetryDelay(attempt)),
          lockedAt: null,
          lockToken: null,
          leaseExpiresAt: null,
          lastError: error instanceof Error ? error.message : String(error),
        })
        .where(and(eq(notificationOutbox.id, candidate.id), eq(notificationOutbox.lockToken, lockToken)));
      failed += 1;
      if (terminal) dead += 1;
    }
  }

  return { inspected: candidates.length, completed, failed, dead, reclaimed, skipped, providerDisabled: emailPaused };
}

export async function purgeExpiredNotificationData(
  db: NotificationDatabase,
  options: { now?: Date; retentionDays?: number } = {}
) {
  const now = options.now ?? new Date();
  const retentionDays = Math.max(1, Math.min(options.retentionDays ?? 90, 365));
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const [notificationsDeleted] = await db.delete(notifications).where(
    and(isNotNull(notifications.expiresAt), lt(notifications.expiresAt, now))
  );
  const [webhooksDeleted] = await db.delete(notificationWebhookEvents).where(
    and(eq(notificationWebhookEvents.processingStatus, "processed"), lt(notificationWebhookEvents.receivedAt, cutoff))
  );
  const [outboxDeleted] = await db.delete(notificationOutbox).where(
    and(eq(notificationOutbox.status, "completed"), isNotNull(notificationOutbox.processedAt), lt(notificationOutbox.processedAt, cutoff))
  );
  return {
    notificationsDeleted: Number(notificationsDeleted?.affectedRows || 0),
    webhooksDeleted: Number(webhooksDeleted?.affectedRows || 0),
    outboxDeleted: Number(outboxDeleted?.affectedRows || 0),
  };
}

export function startNotificationOutboxWorker(
  db: NotificationDatabase,
  options: {
    intervalMs?: number;
    batchSize?: number;
    retentionIntervalMs?: number;
    onMetrics?: (metrics: Awaited<ReturnType<typeof processNotificationOutboxBatch>>) => void;
  } = {}
) {
  const intervalMs = Math.max(options.intervalMs ?? 15_000, 5_000);
  const emailAdapter = new SendPulseTransactionalEmailAdapter();
  const timer = setInterval(() => {
    void processNotificationOutboxBatch(db, {
      limit: options.batchSize ?? 10,
      emailAdapter,
    }).then(metrics => options.onMetrics?.(metrics));
  }, intervalMs);
  const retentionTimer = setInterval(() => {
    void purgeExpiredNotificationData(db);
  }, Math.max(options.retentionIntervalMs ?? 24 * 60 * 60 * 1000, 60 * 60 * 1000));
  timer.unref?.();
  retentionTimer.unref?.();
  return () => {
    clearInterval(timer);
    clearInterval(retentionTimer);
  };
}
