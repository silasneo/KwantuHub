import crypto from "node:crypto";
import express, { type Express, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import {
  notificationDeliveries,
  notificationOutbox,
  notificationSuppressions,
  notificationWebhookEvents,
  users,
} from "../drizzle/schema";
import { getDb } from "./db";
import { enqueueNotificationEvent } from "./notificationWorker";
import { ENV } from "./_core/env";

const WEBHOOK_PATH = "/api/webhooks/email/sendpulse";

type SendPulseEvent = Record<string, unknown>;

type DeliveryMapping = {
  status: "sent" | "delivered" | "failed" | "bounced" | "complained";
  suppressReason?: "hard_bounce" | "complaint" | "unsubscribe";
};

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function mapSendPulseDeliveryEvent(eventType: string): DeliveryMapping | null {
  const normalized = eventType.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["delivered", "delivery", "email_delivered"].includes(normalized)) {
    return { status: "delivered" };
  }
  if (["sent", "accepted", "processed", "email_sent"].includes(normalized)) {
    return { status: "sent" };
  }
  if (["hard_bounce", "hard_bounced", "hard_bounces", "bounce", "bounced"].includes(normalized)) {
    return { status: "bounced", suppressReason: "hard_bounce" };
  }
  if (["complaint", "spam_complaint", "spam_by_user", "complained"].includes(normalized)) {
    return { status: "complained", suppressReason: "complaint" };
  }
  if (["unsubscribe", "unsubscribed"].includes(normalized)) {
    return { status: "complained", suppressReason: "unsubscribe" };
  }
  if (["failed", "rejected", "undelivered", "soft_bounce", "soft_bounces", "temporary_failure"].includes(normalized)) {
    return { status: "failed" };
  }
  return null;
}

export function getSendPulseAlertPolicy(
  mapping: DeliveryMapping,
  recipientRole: string | null | undefined
) {
  if (!["failed", "bounced", "complained"].includes(mapping.status)) return null;
  return {
    notifyRecipient: recipientRole === "vendor",
    notifyAdmins: true,
    requiresAddressUpdate: mapping.status === "bounced" || mapping.status === "complained",
    reason: mapping.suppressReason || "delivery_failure",
  };
}

export function shouldEmitDeliveryAlerts(sourceEventType: string | null | undefined) {
  return !["EMAIL_ADDRESS_ACTION_REQUIRED", "EMAIL_DELIVERY_ALERT"].includes(
    sourceEventType || ""
  );
}

function readString(event: SendPulseEvent, keys: string[]) {
  for (const key of keys) {
    const value = event[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return undefined;
}

function parseProviderDate(event: SendPulseEvent) {
  const raw = event.timestamp ?? event.date ?? event.created_at ?? event.event_time;
  if (typeof raw === "number" || (typeof raw === "string" && /^\d+$/.test(raw))) {
    const numeric = Number(raw);
    const date = new Date(numeric < 1_000_000_000_000 ? numeric * 1000 : numeric);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  if (typeof raw === "string") {
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  return undefined;
}

export function parseSendPulseEvent(event: SendPulseEvent) {
  const eventType = readString(event, ["event", "event_type", "eventType", "type", "status"]) || "unknown";
  const providerMessageId = readString(event, ["message_id", "messageId", "email_id", "emailId", "smtp_id", "task_id"]);
  const providerEventAt = parseProviderDate(event);
  const eventTimeKey = providerEventAt?.toISOString() || "unknown";
  const providerEventId = readString(event, ["event_id", "eventId", "id"]) || `${providerMessageId || "unknown"}:${eventType}:${eventTimeKey}`;
  return {
    event,
    eventType,
    providerMessageId,
    providerEventId,
    providerEventAt,
    email: readString(event, ["email", "recipient", "address", "to"]),
  };
}

export function parseSendPulseEvents(body: Buffer) {
  const parsed = JSON.parse(body.toString("utf8")) as SendPulseEvent | SendPulseEvent[];
  const events = Array.isArray(parsed) ? parsed : [parsed];
  if (!events.every(event => event && typeof event === "object" && !Array.isArray(event))) {
    throw new Error("SendPulse webhook payload must contain event objects");
  }
  return events.map(parseSendPulseEvent);
}

export function isValidSendPulseWebhookToken(provided: string | undefined, expected: string | undefined) {
  if (!provided || !expected) return false;
  const candidate = Buffer.from(provided, "utf8");
  const configured = Buffer.from(expected, "utf8");
  return candidate.length === configured.length && crypto.timingSafeEqual(candidate, configured);
}

function webhookToken(req: Request) {
  const token = req.query.token;
  return typeof token === "string" ? token : undefined;
}

async function applyEvent(db: Awaited<ReturnType<typeof getDb>>, parsed: ReturnType<typeof parseSendPulseEvent>) {
  if (!db) return "ignored" as const;
  const payloadHash = crypto.createHash("sha256").update(JSON.stringify(parsed.event)).digest("hex");
  const [existingEvent] = await db
    .select({ id: notificationWebhookEvents.id })
    .from(notificationWebhookEvents)
    .where(and(eq(notificationWebhookEvents.provider, "sendpulse"), eq(notificationWebhookEvents.providerEventId, parsed.providerEventId)))
    .limit(1);
  if (existingEvent) return "duplicate" as const;

  await db.insert(notificationWebhookEvents).values({
    provider: "sendpulse",
    providerEventId: parsed.providerEventId,
    providerMessageId: parsed.providerMessageId,
    providerEventType: parsed.eventType,
    signatureVerified: false,
    payloadHash,
    payload: parsed.event,
    providerEventAt: parsed.providerEventAt,
  });

  const mapping = mapSendPulseDeliveryEvent(parsed.eventType);
  if (!mapping || !parsed.providerMessageId) {
    await db.update(notificationWebhookEvents).set({ processingStatus: "ignored", processedAt: new Date() }).where(eq(notificationWebhookEvents.providerEventId, parsed.providerEventId));
    return "ignored" as const;
  }

  const [delivery] = await db
    .select()
    .from(notificationDeliveries)
    .where(and(eq(notificationDeliveries.provider, "sendpulse"), eq(notificationDeliveries.providerMessageId, parsed.providerMessageId)))
    .limit(1);
  if (!delivery) {
    await db.update(notificationWebhookEvents).set({ processingStatus: "ignored", processedAt: new Date(), lastError: "Delivery not found" }).where(eq(notificationWebhookEvents.providerEventId, parsed.providerEventId));
    return "ignored" as const;
  }

  if (delivery.providerEventAt && parsed.providerEventAt && parsed.providerEventAt < delivery.providerEventAt) {
    await db.update(notificationWebhookEvents).set({ processingStatus: "ignored", processedAt: new Date(), lastError: "Older provider event" }).where(eq(notificationWebhookEvents.providerEventId, parsed.providerEventId));
    return "ignored" as const;
  }

  const now = new Date();
  await db.update(notificationDeliveries).set({
    status: mapping.status,
    providerEventAt: parsed.providerEventAt || now,
    providerEventType: parsed.eventType,
    lastProviderEventId: parsed.providerEventId,
    providerPayload: parsed.event,
    deliveredAt: mapping.status === "delivered" ? now : delivery.deliveredAt,
    failureCode: mapping.status === "failed" || mapping.status === "bounced" || mapping.status === "complained" ? parsed.eventType : null,
    failureReason: mapping.suppressReason ? `SendPulse ${mapping.suppressReason}` : null,
  }).where(eq(notificationDeliveries.id, delivery.id));

  const [sourceOutbox] = await db
    .select({ eventType: notificationOutbox.eventType })
    .from(notificationOutbox)
    .where(eq(notificationOutbox.id, delivery.outboxId!))
    .limit(1);
  const alertPolicy = shouldEmitDeliveryAlerts(sourceOutbox?.eventType)
    ? getSendPulseAlertPolicy(mapping, undefined)
    : null;
  if (alertPolicy) {
    const [recipient] = await db
      .select({ email: users.email, name: users.name, role: users.role })
      .from(users)
      .where(eq(users.id, delivery.recipientUserId))
      .limit(1);
    const resolvedAlertPolicy = getSendPulseAlertPolicy(mapping, recipient?.role);
    const reason = resolvedAlertPolicy?.reason || "delivery_failure";
    const alertBody = `SendPulse reported ${reason.replaceAll("_", " ")} for ${recipient?.email || parsed.email || "this address"}. ${resolvedAlertPolicy?.requiresAddressUpdate ? "Update the email address in your profile before sending more inquiries." : "Review the address and retry after the provider issue is resolved."}`;

    if (resolvedAlertPolicy?.notifyRecipient) {
      await enqueueNotificationEvent(db, {
        eventType: "EMAIL_ADDRESS_ACTION_REQUIRED",
        idempotencyKey: `sendpulse-vendor-alert:${parsed.providerEventId}`,
        recipientUserId: delivery.recipientUserId,
        entityType: "notification_delivery",
        entityId: delivery.id,
        payload: {
          body: alertBody,
          providerEventType: parsed.eventType,
          deliveryId: delivery.id,
          actionUrl: "/vendor?tab=profile",
        },
      });
    }

    const admins = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, "admin"));
    for (const admin of admins) {
      await enqueueNotificationEvent(db, {
        eventType: "EMAIL_DELIVERY_ALERT",
        idempotencyKey: `sendpulse-admin-alert:${parsed.providerEventId}:${admin.id}`,
        recipientUserId: admin.id,
        entityType: "notification_delivery",
        entityId: delivery.id,
        payload: {
          body: `SendPulse reported ${reason.replaceAll("_", " ")} for ${recipient?.email || parsed.email || "an address"}. Review the delivery in the admin notification operations dashboard.`,
          providerEventType: parsed.eventType,
          deliveryId: delivery.id,
          actionUrl: "/admin?tab=notifications",
        },
      });
    }
  }

  if (mapping.suppressReason) {
    let suppressionEmail = normalizeEmail(parsed.email || "");
    if (!suppressionEmail) {
      const [recipient] = await db.select({ email: users.email }).from(users).where(eq(users.id, delivery.recipientUserId)).limit(1);
      suppressionEmail = recipient?.email ? normalizeEmail(recipient.email) : "";
    }
    if (suppressionEmail) {
      await db.insert(notificationSuppressions).values({
        userId: delivery.recipientUserId,
        email: suppressionEmail,
        provider: "sendpulse",
        reason: mapping.suppressReason,
        sourceEventId: parsed.providerEventId,
        metadata: parsed.event,
      }).onDuplicateKeyUpdate({ set: { active: true, sourceEventId: parsed.providerEventId, suppressedAt: now, releasedAt: null } });
    }
  }

  await db.update(notificationWebhookEvents).set({ processingStatus: "processed", processedAt: now }).where(eq(notificationWebhookEvents.providerEventId, parsed.providerEventId));
  return "processed" as const;
}

async function processWebhook(req: Request, res: Response) {
  const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
  const expectedToken = ENV.sendPulseWebhookToken;
  if (!expectedToken) {
    res.status(503).json({ error: "Webhook token is not configured" });
    return;
  }
  if (!isValidSendPulseWebhookToken(webhookToken(req), expectedToken)) {
    res.status(401).json({ error: "Invalid webhook token" });
    return;
  }

  let events: ReturnType<typeof parseSendPulseEvents>;
  try {
    events = parseSendPulseEvents(body);
  } catch {
    res.status(400).json({ error: "Invalid SendPulse webhook payload" });
    return;
  }
  const db = await getDb();
  if (!db) {
    res.status(503).json({ error: "Database unavailable" });
    return;
  }

  const results = { processed: 0, duplicate: 0, ignored: 0 };
  for (const event of events) {
    const result = await applyEvent(db, event);
    results[result] += 1;
  }
  res.status(200).json({ accepted: true, received: events.length, ...results });
}

export function registerSendPulseWebhook(app: Express) {
  app.post(WEBHOOK_PATH, express.raw({ type: "application/json", limit: "2mb" }), (req, res) => {
    void processWebhook(req, res).catch(error => {
      console.error("[SendPulseWebhook] processing failed", error instanceof Error ? error.message : String(error));
      if (!res.headersSent) res.status(500).json({ error: "Webhook processing failed" });
    });
  });
}

export { WEBHOOK_PATH };
