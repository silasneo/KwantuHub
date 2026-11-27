import {
  and,
  asc,
  eq,
  inArray,
  isNull,
  isNotNull,
  lte,
  lt,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import {
  notificationDeliveries,
  notificationOutbox,
  notificationPreferences,
  notificationSuppressions,
  notifications,
  notificationWebhookEvents,
  accountResetTokens,
  systemSettings,
  verificationChallenges,
  users,
  type NotificationOutbox,
} from "../drizzle/schema";
import { drizzle } from "drizzle-orm/mysql2";
import {
  SendPulseSendError,
  SendPulseTransactionalEmailAdapter,
} from "./sendPulseAdapter";
import { escapeHtml, renderTransactionalEmail } from "./notificationTemplates";
import { decryptOtp, hashVerificationTarget } from "./contactVerification";
import { ENV } from "./_core/env";
import { reportRuntimeError, startSerialLoop } from "./runtime";
import { writeWorkerHeartbeat } from "./runtimeReadiness";

export type NotificationEventType =
  | "INQUIRY_CREATED"
  | "INQUIRY_REPLY_RECEIVED"
  | "INQUIRY_RESOLVED"
  | "VENDOR_APPROVED"
  | "VENDOR_REJECTED"
  | "ACCOUNT_STATUS_CHANGED"
  | "VENDOR_STATUS_CHANGED"
  | "REVIEW_MODERATED"
  | "EMAIL_ADDRESS_ACTION_REQUIRED"
  | "EMAIL_DELIVERY_ALERT"
  | "CONTACT_VERIFICATION_OTP"
  | "SAVED_SEARCH_MATCH"
  | "SAVED_SEARCH_DIGEST";

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
    | "account_status_changed"
    | "vendor_status_changed"
    | "review_moderated"
    | "email_address_action_required"
    | "email_delivery_alert"
    | "contact_verification_otp"
    | "saved_search_match"
    | "saved_search_digest";
}

export function getEmailPreferenceField(eventType: NotificationEventType) {
  switch (eventType) {
    case "INQUIRY_CREATED":
      return "emailInquiries" as const;
    case "INQUIRY_REPLY_RECEIVED":
      return "emailReplies" as const;
    case "INQUIRY_RESOLVED":
      return "emailResolutions" as const;
    case "SAVED_SEARCH_MATCH":
    case "SAVED_SEARCH_DIGEST":
      return "emailSavedSearches" as const;
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
        body: String(
          payload.subject || "You received a reply to your inquiry."
        ),
      };
    case "INQUIRY_RESOLVED":
      return {
        title: "Inquiry resolved",
        body: String(payload.subject || "An inquiry was marked as resolved."),
      };
    case "VENDOR_APPROVED":
      return {
        title: "Vendor application approved",
        body: "Your vendor profile is now approved.",
      };
    case "VENDOR_REJECTED":
      return {
        title: "Vendor application update",
        body: "Your vendor application needs attention.",
      };
    case "ACCOUNT_STATUS_CHANGED":
      return { title: "Account status update", body: payload.status === "suspended"
        ? "Your account has been suspended. Contact support if you need assistance."
        : "Your account has been reactivated. You can sign in again." };
    case "VENDOR_STATUS_CHANGED":
      return { title: "Vendor status update", body: payload.status === "suspended"
        ? "Your vendor profile has been suspended. Contact support for assistance."
        : "Your vendor profile status has changed. Check your vendor dashboard." };
    case "REVIEW_MODERATED":
      return {
        title: "Review moderation update",
        body: "Your review status has changed.",
      };
    case "EMAIL_ADDRESS_ACTION_REQUIRED":
      return {
        title: "Your email address needs attention",
        body: String(
          payload.body ||
            "A transactional email could not be delivered. Update your email address in your profile."
        ),
      };
    case "EMAIL_DELIVERY_ALERT":
      return {
        title: "Email delivery alert",
        body: String(
          payload.body ||
            "SendPulse reported a delivery problem that needs review."
        ),
      };
    case "CONTACT_VERIFICATION_OTP":
      return {
        title: "Verify your KwantuHub email",
        body: "Use the one-time code sent to your email address to complete verification.",
      };
    case "SAVED_SEARCH_MATCH": {
      const searchName = String(payload.searchName || "your saved search");
      return {
        title: `New listing for "${searchName}"`,
        body: `${String(payload.listingTitle || "A new listing")} was published and matches your saved search "${searchName}".`,
      };
    }
    case "SAVED_SEARCH_DIGEST": {
      const searchName = String(payload.searchName || "your saved search");
      const count = Array.isArray(payload.listings)
        ? payload.listings.length
        : Number(payload.matchCount) || 0;
      return {
        title: `${count} new ${count === 1 ? "listing" : "listings"} for "${searchName}"`,
        body: `Your daily summary of new listings matching your saved search "${searchName}".`,
      };
    }
  }
}

export async function enqueueNotificationEvent(
  db: Pick<NotificationDatabase, "insert">,
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

export class DeliveryDeferredError extends Error {
  constructor(
    message: string,
    readonly until: Date
  ) {
    super(message);
    this.name = "DeliveryDeferredError";
  }
}

/** The provider may already have accepted the email; never resend automatically. */
export class ManualReconciliationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManualReconciliationError";
  }
}

export class NonRetryableDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableDeliveryError";
  }
}

export const DELIVERY_DEFER_MS = 60_000;
/** Longer than a full SendPulse token + send round trip (two 10s request timeouts). */
export const SEND_IN_FLIGHT_GRACE_MS = 2 * 60_000;
export const MANUAL_RECONCILIATION_PREFIX = "MANUAL_RECONCILIATION_REQUIRED";
export const SEND_IN_PROGRESS = "send_in_progress";
export const SEND_OUTCOME_UNKNOWN = "send_outcome_unknown";

type SuppressionReason = "hard_bounce" | "complaint" | "unsubscribe" | "manual";

/**
 * Explicit email policy.
 * - Security emails (OTP codes, password resets) are user-initiated account-access messages. They
 *   ignore notification preferences and the admin notification pause (which is an incident switch
 *   for notification traffic), but still honour hard-bounce and manual suppressions and defer while
 *   the provider is unconfigured until the code/link expires. Each queued send gets an email
 *   delivery record so bounces and ambiguous sends are auditable.
 * - Ordinary notifications honour preferences, the pause, and every active suppression.
 * Inline OTP sends made directly during registration/email change (accountFlows) are outside this
 * queue; they still bypass pause/suppression and are not delivery-recorded.
 */
export function emailDeliveryPolicy(eventType: string) {
  if (
    eventType === "CONTACT_VERIFICATION_OTP" ||
    eventType === "PASSWORD_RESET"
  ) {
    return {
      category: "security" as const,
      honorsPause: false,
      honorsPreferences: false,
      blockingSuppressions: ["hard_bounce", "manual"] as SuppressionReason[],
    };
  }
  return {
    category: "notification" as const,
    honorsPause: true,
    honorsPreferences: true,
    blockingSuppressions: [
      "hard_bounce",
      "complaint",
      "unsubscribe",
      "manual",
    ] as SuppressionReason[],
  };
}

function isDuplicateKeyError(error: unknown) {
  const candidate = error as {
    code?: string;
    errno?: number;
    cause?: { code?: string; errno?: number };
  } | null;
  return (
    candidate?.code === "ER_DUP_ENTRY" ||
    candidate?.errno === 1062 ||
    candidate?.cause?.code === "ER_DUP_ENTRY" ||
    candidate?.cause?.errno === 1062
  );
}

function affectedRows(result: unknown) {
  return Number(
    (Array.isArray(result)
      ? result[0]
      : (result as { affectedRows?: number } | undefined)
    )?.affectedRows || 0
  );
}

function truncate(value: string, length: number) {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

async function ensureInAppNotification(
  db: NotificationDatabase,
  row: NotificationOutbox,
  eventType: NotificationEventType,
  copy: { title: string; body: string },
  payload: Record<string, unknown>
) {
  const findExisting = async () => {
    const [existing] = await db
      .select({ notificationId: notificationDeliveries.notificationId })
      .from(notificationDeliveries)
      .where(
        and(
          eq(notificationDeliveries.outboxId, row.id),
          eq(notificationDeliveries.channel, "in_app")
        )
      )
      .limit(1);
    return existing;
  };
  const existing = await findExisting();
  if (existing) return existing.notificationId ?? undefined;
  try {
    // Notification + in-app delivery commit together; the delivery row is the per-outbox
    // idempotency record, so a retried outbox item never creates a second notification.
    return await db.transaction(async tx => {
      const [created] = await tx.insert(notifications).values({
        recipientUserId: row.recipientUserId,
        actorUserId: row.actorUserId,
        notificationType: toNotificationType(eventType),
        entityType: row.entityType,
        entityId: row.entityId,
        inquiryId:
          typeof payload.inquiryId === "number" ? payload.inquiryId : null,
        listingId:
          typeof payload.listingId === "number" ? payload.listingId : null,
        title: truncate(copy.title, 180),
        body: truncate(copy.body, 500),
        actionUrl:
          typeof payload.actionUrl === "string"
            ? payload.actionUrl.slice(0, 512)
            : null,
        metadata: payload,
      });
      const now = new Date();
      await tx.insert(notificationDeliveries).values({
        notificationId: created.insertId,
        outboxId: row.id,
        recipientUserId: row.recipientUserId,
        channel: "in_app",
        provider: "internal",
        status: "delivered",
        attempts: 1,
        sentAt: now,
        deliveredAt: now,
      });
      return created.insertId as number;
    });
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    return (await findExisting())?.notificationId ?? undefined;
  }
}

async function processOutboxRow(
  db: NotificationDatabase,
  row: NotificationOutbox,
  emailAdapter?: SendPulseTransactionalEmailAdapter,
  emailPaused = false
) {
  const adapter = emailAdapter ?? new SendPulseTransactionalEmailAdapter();
  if (row.eventType === "LISTING_PUBLISHED") {
    const { processListingSavedSearchMatches } = await import(
      "./savedSearchService"
    );
    await processListingSavedSearchMatches(row.entityId, { db });
    return;
  }
  if (row.eventType === "PASSWORD_RESET") {
    const prepared = await preparePasswordResetEmail(db, row);
    await deliverEmail(db, row, {
      ...prepared,
      adapter,
      emailPaused,
      notificationId: undefined,
    });
    return;
  }
  const eventType = row.eventType as NotificationEventType;
  const payload = (row.payload || {}) as Record<string, unknown>;
  if (eventType === "CONTACT_VERIFICATION_OTP") {
    const prepared = await prepareContactVerificationEmail(db, row);
    await deliverEmail(db, row, {
      ...prepared,
      adapter,
      emailPaused,
      notificationId: undefined,
    });
    return;
  }
  const preferences = await getOrCreateNotificationPreferences(
    db,
    row.recipientUserId
  );
  const event: NotificationEvent = {
    eventType,
    idempotencyKey: row.idempotencyKey,
    recipientUserId: row.recipientUserId,
    actorUserId: row.actorUserId,
    entityType: row.entityType,
    entityId: row.entityId,
    payload,
  };
  const copy = notificationCopy(event);
  const notificationId = preferences?.inAppEnabled
    ? await ensureInAppNotification(db, row, eventType, copy, payload)
    : undefined;

  const emailPreference = getEmailPreferenceField(eventType);
  if (preferences?.[emailPreference]) {
    const [recipient] = await db
      .select({ email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, row.recipientUserId))
      .limit(1);
    if (recipient?.email) {
      await deliverEmail(db, row, {
        recipient,
        message: renderNotificationEmail(event, copy),
        adapter,
        emailPaused,
        notificationId,
        idempotencyKey: `${row.idempotencyKey}:email`,
      });
    }
  }
}

export function renderNotificationEmail(
  event: NotificationEvent,
  copy = notificationCopy(event)
) {
  const payload = event.payload;
  const items = Array.isArray(payload.listings)
    ? (payload.listings as { title?: unknown; actionUrl?: unknown }[])
        .filter(item => item && typeof item.title === "string")
        .map(item => ({ title: String(item.title), url: item.actionUrl }))
    : undefined;
  return renderTransactionalEmail({
    title: copy.title,
    body: copy.body,
    actionUrl: payload.actionUrl,
    actionLabel:
      typeof payload.actionLabel === "string" ? payload.actionLabel : undefined,
    items,
  });
}

type PreparedEmail = {
  recipient: { email: string | null; name: string | null };
  message: { subject: string; text: string; html: string };
  idempotencyKey: string;
  expiresAt?: Date;
};

async function preparePasswordResetEmail(
  db: NotificationDatabase,
  row: NotificationOutbox
): Promise<PreparedEmail> {
  const payload = row.payload as {
    tokenCiphertext?: string;
    emailHash?: string;
  } | null;
  if (!payload?.tokenCiphertext || !payload.emailHash)
    throw new NonRetryableDeliveryError("Password reset payload is missing.");
  const token = decryptOtp(payload.tokenCiphertext);
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const [reset] = await db
    .select()
    .from(accountResetTokens)
    .where(
      and(
        eq(accountResetTokens.tokenHash, tokenHash),
        eq(accountResetTokens.userId, row.recipientUserId)
      )
    )
    .limit(1);
  const [recipient] = await db
    .select({ email: users.email, status: users.status })
    .from(users)
    .where(eq(users.id, row.recipientUserId))
    .limit(1);
  if (
    !reset ||
    reset.expiresAt.getTime() <= Date.now() ||
    recipient?.status !== "active" ||
    !recipient.email ||
    hashVerificationTarget(recipient.email) !== payload.emailHash
  ) {
    throw new NonRetryableDeliveryError(
      "Password reset request expired, was consumed, or its recipient changed."
    );
  }
  const url = new URL("/reset-password", ENV.appUrl);
  url.hash = `token=${token}`;
  const text = `Reset your password using this link: ${url.toString()} . This single-use link expires in 30 minutes. If you did not request this, ignore this email.`;
  return {
    recipient: { email: recipient.email, name: null },
    message: {
      subject: "Reset your KwantuHub password",
      text,
      html: `<p>${escapeHtml(text)}</p>`,
    },
    idempotencyKey: row.idempotencyKey,
    expiresAt: reset.expiresAt,
  };
}

async function prepareContactVerificationEmail(
  db: NotificationDatabase,
  row: NotificationOutbox
): Promise<PreparedEmail> {
  const challengeId = Number(
    (row.payload as Record<string, unknown> | null)?.challengeId
  );
  if (!Number.isInteger(challengeId) || challengeId <= 0) {
    throw new NonRetryableDeliveryError("OTP challenge is missing");
  }
  const [challenge] = await db
    .select()
    .from(verificationChallenges)
    .where(eq(verificationChallenges.id, challengeId))
    .limit(1);
  if (
    !challenge ||
    challenge.consumedAt ||
    challenge.expiresAt.getTime() <= Date.now()
  ) {
    throw new NonRetryableDeliveryError(
      "OTP challenge is expired or unavailable"
    );
  }
  const [recipient] = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, row.recipientUserId))
    .limit(1);
  if (!recipient?.email)
    throw new NonRetryableDeliveryError("OTP recipient email is missing");
  const code = decryptOtp(challenge.codeCiphertext);
  return {
    recipient,
    message: {
      subject: "Your KwantuHub verification code",
      text: `Your KwantuHub verification code is ${code}. It expires in 10 minutes. If you did not request this, you can ignore this email.`,
      html: `<p>Your KwantuHub verification code is <strong>${code}</strong>.</p><p>It expires in 10 minutes. If you did not request this, you can ignore this email.</p>`,
    },
    idempotencyKey: row.idempotencyKey,
    expiresAt: challenge.expiresAt,
  };
}

/**
 * Durable, retry-safe email delivery for one outbox row.
 * The delivery row is claimed with failureCode=send_in_progress before the provider call. A later
 * attempt that finds that marker either waits (the original send may still be running) or, after
 * the in-flight grace period, records send_outcome_unknown and requires manual reconciliation
 * instead of risking a duplicate email.
 */
async function deliverEmail(
  db: NotificationDatabase,
  row: NotificationOutbox,
  options: PreparedEmail & {
    adapter: SendPulseTransactionalEmailAdapter;
    emailPaused: boolean;
    notificationId: number | undefined;
  }
) {
  const { adapter, recipient } = options;
  if (!recipient.email) return;
  const policy = emailDeliveryPolicy(row.eventType);
  const now = new Date();
  const deferUntil = (reason: string, delayMs = DELIVERY_DEFER_MS) => {
    const until = new Date(now.getTime() + delayMs);
    if (options.expiresAt && options.expiresAt.getTime() <= until.getTime()) {
      return new NonRetryableDeliveryError(
        `${reason}; the message expires before the next attempt.`
      );
    }
    return new DeliveryDeferredError(reason, until);
  };

  const findDelivery = async () => {
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
    return existing;
  };
  let existing = await findDelivery();
  if (
    existing &&
    ["sent", "delivered", "bounced", "complained"].includes(existing.status)
  )
    return;
  if (existing?.failureCode === "suppressed") return;
  if (existing?.failureCode === SEND_OUTCOME_UNKNOWN) {
    throw new ManualReconciliationError(
      `Delivery ${existing.id} has an unknown provider outcome.`
    );
  }
  if (existing?.failureCode === SEND_IN_PROGRESS) {
    const startedAt = existing.lastAttemptAt?.getTime() ?? 0;
    if (now.getTime() - startedAt < SEND_IN_FLIGHT_GRACE_MS) {
      throw new DeliveryDeferredError(
        "Another worker is still sending this email",
        new Date(startedAt + SEND_IN_FLIGHT_GRACE_MS)
      );
    }
    await markOutcomeUnknown(
      db,
      existing.id,
      "Send started but its outcome was never recorded (worker crash or lost lease)."
    );
    throw new ManualReconciliationError(
      `Delivery ${existing.id} has an unknown provider outcome.`
    );
  }

  if (!existing) {
    try {
      await db.insert(notificationDeliveries).values({
        notificationId: options.notificationId ?? null,
        outboxId: row.id,
        recipientUserId: row.recipientUserId,
        channel: "email",
        provider: adapter.provider,
        status: "queued",
        nextAttemptAt: now,
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
    }
    existing = await findDelivery();
    if (!existing)
      throw new Error("Email delivery record could not be created.");
  }
  const deliveryId = existing.id;

  const defer = async (failureCode: string, reason: string) => {
    const error = deferUntil(reason);
    await db
      .update(notificationDeliveries)
      .set({
        provider: adapter.provider,
        status: error instanceof DeliveryDeferredError ? "queued" : "failed",
        failureCode,
        failureReason: reason,
        nextAttemptAt:
          error instanceof DeliveryDeferredError ? error.until : null,
      })
      .where(eq(notificationDeliveries.id, deliveryId));
    throw error;
  };
  if (!adapter.isConfigured())
    await defer(
      "provider_unconfigured",
      "Email provider is not configured; delivery deferred"
    );
  if (options.emailPaused && policy.honorsPause)
    await defer(
      "delivery_paused",
      "Email delivery is paused by an administrator"
    );

  const normalizedEmail = recipient.email.trim().toLowerCase();
  const [suppression] = await db
    .select({ reason: notificationSuppressions.reason })
    .from(notificationSuppressions)
    .where(
      and(
        eq(notificationSuppressions.provider, adapter.provider),
        eq(notificationSuppressions.email, normalizedEmail),
        eq(notificationSuppressions.active, true),
        inArray(notificationSuppressions.reason, policy.blockingSuppressions)
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
        lastAttemptAt: now,
        nextAttemptAt: null,
      })
      .where(eq(notificationDeliveries.id, deliveryId));
    if (policy.category === "security") {
      throw new NonRetryableDeliveryError(
        `Security email blocked by ${suppression.reason} suppression.`
      );
    }
    return;
  }

  const claim = await db
    .update(notificationDeliveries)
    .set({
      provider: adapter.provider,
      status: "queued",
      failureCode: SEND_IN_PROGRESS,
      failureReason: null,
      lastAttemptAt: new Date(),
      nextAttemptAt: null,
      attempts: sql`${notificationDeliveries.attempts} + 1`,
    })
    .where(
      and(
        eq(notificationDeliveries.id, deliveryId),
        inArray(notificationDeliveries.status, ["queued", "failed"]),
        or(
          isNull(notificationDeliveries.failureCode),
          notInArray(notificationDeliveries.failureCode, [
            SEND_IN_PROGRESS,
            SEND_OUTCOME_UNKNOWN,
            "suppressed",
          ])
        )
      )
    );
  if (affectedRows(claim) === 0) {
    throw new DeliveryDeferredError(
      "Email delivery is owned by another attempt",
      new Date(now.getTime() + DELIVERY_DEFER_MS)
    );
  }

  let result: Awaited<ReturnType<SendPulseTransactionalEmailAdapter["send"]>>;
  try {
    result = await adapter.send({
      to: [{ email: recipient.email, name: recipient.name }],
      subject: options.message.subject,
      text: options.message.text,
      html: options.message.html,
      idempotencyKey: options.idempotencyKey,
    });
    if (!result.accepted)
      throw new SendPulseSendError(
        "SendPulse did not accept the email.",
        "rejected"
      );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof SendPulseSendError && error.outcome === "ambiguous") {
      await markOutcomeUnknown(db, deliveryId, message);
      throw new ManualReconciliationError(`Delivery ${deliveryId}: ${message}`);
    }
    await db
      .update(notificationDeliveries)
      .set({
        status: "failed",
        failureCode: "provider_rejected",
        failureReason: message,
        lastAttemptAt: new Date(),
      })
      .where(
        and(
          eq(notificationDeliveries.id, deliveryId),
          eq(notificationDeliveries.failureCode, SEND_IN_PROGRESS)
        )
      );
    throw error;
  }
  const sentAt = new Date();
  await db
    .update(notificationDeliveries)
    .set({
      provider: adapter.provider,
      providerMessageId: result.providerMessageId,
      status: "sent",
      lastAttemptAt: sentAt,
      sentAt,
      failureCode: null,
      failureReason: result.providerMessageId
        ? null
        : "SendPulse returned no message ID; webhook events cannot be correlated.",
    })
    .where(
      and(
        eq(notificationDeliveries.id, deliveryId),
        inArray(notificationDeliveries.status, ["queued", "failed"])
      )
    );
}

async function markOutcomeUnknown(
  db: NotificationDatabase,
  deliveryId: number,
  reason: string
) {
  await db
    .update(notificationDeliveries)
    .set({
      status: "failed",
      failureCode: SEND_OUTCOME_UNKNOWN,
      failureReason: `${reason} The email may have been sent. Check SendPulse logs before any manual resend.`,
      nextAttemptAt: null,
    })
    .where(
      and(
        eq(notificationDeliveries.id, deliveryId),
        inArray(notificationDeliveries.status, ["queued", "failed"])
      )
    );
}

export async function processNotificationOutboxBatch(
  db: NotificationDatabase,
  options: {
    limit?: number;
    now?: Date;
    emailAdapter?: SendPulseTransactionalEmailAdapter;
    leaseMs?: number;
    signal?: AbortSignal;
    maxBatchMs?: number;
  } = {}
) {
  const now = options.now ?? new Date();
  const limit = Math.max(1, Math.min(options.limit ?? 10, 50));
  const leaseMs = Math.max(options.leaseMs ?? 60_000, 15_000);
  const batchStartedAt = Date.now();
  const [reclaimedResult] = await db
    .update(notificationOutbox)
    .set({
      status: "failed",
      availableAt: new Date(Math.floor(now.getTime() / 1_000) * 1_000),
      lockedAt: null,
      lockToken: null,
      leaseExpiresAt: null,
      lastError: "Worker lease expired; item reclaimed",
    })
    .where(
      and(
        eq(notificationOutbox.status, "processing"),
        lte(notificationOutbox.leaseExpiresAt, now)
      )
    );
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
  let deferred = 0;
  let needsReconciliation = 0;
  let leasesLost = 0;
  for (const candidate of candidates) {
    if (
      options.signal?.aborted ||
      Date.now() - batchStartedAt >= (options.maxBatchMs ?? 60_000)
    )
      break;
    const claimedAt = new Date();
    const lockToken = randomUUID();
    const [claimed] = await db
      .update(notificationOutbox)
      .set({
        status: "processing",
        lockedAt: claimedAt,
        lockToken,
        leaseExpiresAt: new Date(claimedAt.getTime() + leaseMs),
        lastAttemptAt: claimedAt,
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

    const owned = and(
      eq(notificationOutbox.id, candidate.id),
      eq(notificationOutbox.lockToken, lockToken)
    );
    let leaseLost = false;
    const renewal = setInterval(
      () => {
        void db
          .update(notificationOutbox)
          .set({ leaseExpiresAt: new Date(Date.now() + leaseMs) })
          .where(and(owned, eq(notificationOutbox.status, "processing")))
          .then(result => {
            if (affectedRows(result) === 0) leaseLost = true;
          })
          .catch(error => {
            leaseLost = true;
            console.error("[NotificationWorker] Lease renewal failed", {
              outboxId: candidate.id,
              error: error instanceof Error ? error.name : "Error",
            });
          });
      },
      Math.max(1_000, Math.floor(leaseMs / 3))
    );
    (renewal as { unref?: () => void }).unref?.();

    const attempt = candidate.attempts + 1;
    try {
      await processOutboxRow(db, candidate, options.emailAdapter, emailPaused);
      clearInterval(renewal);
      const result = await db
        .update(notificationOutbox)
        .set({
          status: "completed",
          processedAt: new Date(),
          lockedAt: null,
          lockToken: null,
          leaseExpiresAt: null,
          lastError: null,
        })
        .where(owned);
      if (affectedRows(result) === 0) leaseLost = true;
      completed += 1;
    } catch (error) {
      clearInterval(renewal);
      const message = error instanceof Error ? error.message : String(error);
      if (error instanceof DeliveryDeferredError) {
        // Deferral is not a failed attempt; the row stays queued and resumes automatically.
        await db
          .update(notificationOutbox)
          .set({
            status: "queued",
            availableAt: error.until,
            attempts: sql`GREATEST(${notificationOutbox.attempts} - 1, 0)`,
            lockedAt: null,
            lockToken: null,
            leaseExpiresAt: null,
            lastError: `Deferred: ${message}`,
          })
          .where(owned);
        deferred += 1;
      } else {
        const manual = error instanceof ManualReconciliationError;
        const terminal =
          manual || error instanceof NonRetryableDeliveryError || attempt >= 6;
        await db
          .update(notificationOutbox)
          .set({
            status: terminal ? "dead" : "failed",
            availableAt: new Date(Date.now() + calculateRetryDelay(attempt)),
            lockedAt: null,
            lockToken: null,
            leaseExpiresAt: null,
            lastError: manual
              ? `${MANUAL_RECONCILIATION_PREFIX}: ${message}`
              : message,
          })
          .where(owned);
        failed += 1;
        if (terminal) dead += 1;
        if (manual) needsReconciliation += 1;
      }
    }
    if (leaseLost) leasesLost += 1;
  }

  return {
    inspected: candidates.length,
    completed,
    failed,
    dead,
    reclaimed,
    skipped,
    deferred,
    needsReconciliation,
    leasesLost,
    providerDisabled: emailPaused,
  };
}

export async function purgeExpiredNotificationData(
  db: NotificationDatabase,
  options: { now?: Date; retentionDays?: number; limit?: number } = {}
) {
  const now = options.now ?? new Date();
  const retentionDays = Math.max(1, Math.min(options.retentionDays ?? 90, 365));
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const limit = Math.max(1, Math.min(options.limit ?? 500, 1000));
  const [notificationsDeleted] = await db
    .delete(notifications)
    .where(
      and(isNotNull(notifications.expiresAt), lt(notifications.expiresAt, now))
    )
    .limit(limit);
  const [webhooksDeleted] = await db
    .delete(notificationWebhookEvents)
    .where(
      and(
        eq(notificationWebhookEvents.provider, "sendpulse"),
        eq(notificationWebhookEvents.processingStatus, "processed"),
        lt(notificationWebhookEvents.receivedAt, cutoff)
      )
    )
    .limit(limit);
  const [outboxDeleted] = await db
    .delete(notificationOutbox)
    .where(
      and(
        eq(notificationOutbox.status, "completed"),
        isNotNull(notificationOutbox.processedAt),
        lt(notificationOutbox.processedAt, cutoff)
      )
    )
    .limit(limit);
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
    savedSearchIntervalMs?: number;
    webhookReconcileIntervalMs?: number;
    onMetrics?: (
      metrics: Awaited<ReturnType<typeof processNotificationOutboxBatch>>
    ) => void;
    onHeartbeat?: () => Promise<void>;
  } = {}
) {
  const intervalMs = Math.max(options.intervalMs ?? 15_000, 5_000);
  const emailAdapter = new SendPulseTransactionalEmailAdapter();
  const delivery = startSerialLoop({
    intervalMs,
    maxRunMs: 90_000,
    task: async signal => {
      const metrics = await processNotificationOutboxBatch(db, {
        limit: options.batchSize ?? 5,
        emailAdapter,
        signal,
        leaseMs: 120_000,
        maxBatchMs: 60_000,
      });
      options.onMetrics?.(metrics);
      if (
        metrics.failed ||
        metrics.reclaimed ||
        metrics.needsReconciliation ||
        metrics.leasesLost
      ) {
        console.warn(
          JSON.stringify({ event: "notification_batch", ...metrics })
        );
      }
      if (!signal.aborted) {
        await (
          options.onHeartbeat ??
          (() =>
            writeWorkerHeartbeat(
              retention.healthy() &&
                registrationCleanup.healthy() &&
                savedSearchAlerts.healthy() &&
                webhookReconciliation.healthy()
            ))
        )();
      }
    },
    onError: error => reportRuntimeError("notification_batch", error),
  });
  const retention = startSerialLoop({
    intervalMs: Math.max(
      options.retentionIntervalMs ?? 24 * 60 * 60 * 1000,
      60 * 60 * 1000
    ),
    maxRunMs: 90_000,
    task: async () => {
      await purgeExpiredNotificationData(db);
    },
    onError: error => reportRuntimeError("notification_retention", error),
  });
  const registrationCleanup = startSerialLoop({
    intervalMs: 5 * 60_000,
    maxRunMs: 90_000,
    task: async signal => {
      if (signal.aborted) return;
      const { purgeExpiredRegistrations } = await import("./registration");
      await purgeExpiredRegistrations();
    },
    onError: error => reportRuntimeError("registration_cleanup", error),
  });
  const savedSearchAlerts = startSerialLoop({
    intervalMs: Math.max(options.savedSearchIntervalMs ?? 5 * 60_000, 60_000),
    maxRunMs: 90_000,
    task: async signal => {
      if (signal.aborted) return;
      const { runSavedSearchAlertSweep } = await import("./savedSearchService");
      await runSavedSearchAlertSweep(db, { signal });
    },
    onError: error => reportRuntimeError("saved_search_alerts", error),
  });
  const webhookReconciliation = startSerialLoop({
    intervalMs: Math.max(
      options.webhookReconcileIntervalMs ?? 2 * 60_000,
      30_000
    ),
    maxRunMs: 90_000,
    task: async signal => {
      if (signal.aborted) return;
      const { reconcilePendingWebhookEvents } = await import(
        "./webhookReconciliation"
      );
      await reconcilePendingWebhookEvents(db, { signal });
    },
    onError: error => reportRuntimeError("webhook_reconciliation", error),
  });
  const loops = [
    delivery,
    retention,
    registrationCleanup,
    savedSearchAlerts,
    webhookReconciliation,
  ];
  const stop = async () => {
    await Promise.all(loops.map(loop => loop.stop()));
    await writeWorkerHeartbeat(false);
  };
  return Object.assign(stop, {
    healthy: () => loops.every(loop => loop.healthy()),
  });
}
