import crypto from "node:crypto";
import express, { type Express, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import {
  notificationWebhookEvents,
  vendorProfiles,
  vendorVerificationSessions,
} from "../drizzle/schema";
import { getDb } from "./db";
import { ENV } from "./_core/env";

export const DIDIT_WEBHOOK_PATH = "/api/webhooks/kyc/didit";
const MAX_WEBHOOK_AGE_SECONDS = 300;

type DiditWebhookPayload = {
  event_id?: string;
  webhook_type?: string;
  timestamp?: number | string;
  created_at?: number | string;
  session_id?: string;
  status?: string;
  vendor_data?: string;
  decision?: unknown;
  [key: string]: unknown;
};

function shortenFloats(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shortenFloats);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, shortenFloats(nested)])
    );
  }
  return typeof value === "number" && !Number.isInteger(value) && value % 1 === 0
    ? Math.trunc(value)
    : value;
}

export function sortDiditKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDiditKeys);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = sortDiditKeys((value as Record<string, unknown>)[key]);
        return result;
      }, {});
  }
  return value;
}

export function canonicalizeDiditPayload(payload: DiditWebhookPayload) {
  return JSON.stringify(sortDiditKeys(shortenFloats(payload)));
}

function safeEqualHex(expected: string, provided: string | undefined) {
  if (!provided) return false;
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");
  return expectedBuffer.length === providedBuffer.length && crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

export function verifyDiditSignature(
  payload: DiditWebhookPayload,
  rawBody: Buffer,
  headers: { signatureV2?: string; signature?: string },
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000)
) {
  if (!secret) return { valid: false, reason: "missing-secret" as const };
  const timestamp = Number(payload.timestamp);
  if (!Number.isFinite(timestamp) || Math.abs(nowSeconds - timestamp) > MAX_WEBHOOK_AGE_SECONDS) {
    return { valid: false, reason: "stale" as const };
  }

  if (headers.signatureV2) {
    const expected = crypto.createHmac("sha256", secret).update(canonicalizeDiditPayload(payload), "utf8").digest("hex");
    if (safeEqualHex(expected, headers.signatureV2)) return { valid: true, version: "v2" as const };
  }

  if (headers.signature) {
    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    if (safeEqualHex(expected, headers.signature)) return { valid: true, version: "raw" as const };
  }

  return { valid: false, reason: "invalid-signature" as const };
}

export function mapDiditStatus(status: string | undefined) {
  switch (status) {
    case "Not Started":
      return "created" as const;
    case "In Progress":
    case "Awaiting User":
      return "submitted" as const;
    case "In Review":
    case "Resubmitted":
      return "in_review" as const;
    case "Approved":
      return "approved" as const;
    case "Declined":
      return "declined" as const;
    case "Expired":
    case "Kyc Expired":
      return "expired" as const;
    case "Abandoned":
      return "abandoned" as const;
    default:
      return null;
  }
}

function parseDate(value: number | string | undefined) {
  if (value === undefined) return undefined;
  const numeric = Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 1_000_000_000_000 ? numeric * 1000 : numeric)
    : new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

async function applyDiditEvent(
  payload: DiditWebhookPayload,
  signatureVersion: "v2" | "raw"
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const providerEventId = payload.event_id || `${payload.session_id || "unknown"}:${payload.webhook_type || "unknown"}:${payload.timestamp || "unknown"}`;
  const payloadHash = crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const [existing] = await db
    .select({ id: notificationWebhookEvents.id })
    .from(notificationWebhookEvents)
    .where(and(eq(notificationWebhookEvents.provider, "didit"), eq(notificationWebhookEvents.providerEventId, providerEventId)))
    .limit(1);
  if (existing) return { status: "duplicate" as const, providerEventId };

  await db.insert(notificationWebhookEvents).values({
    provider: "didit",
    providerEventId,
    providerMessageId: payload.session_id || null,
    providerEventType: payload.webhook_type || "status.updated",
    signatureVerified: true,
    payloadHash,
    payload,
    providerEventAt: parseDate(payload.timestamp || payload.created_at),
  });

  const mappedStatus = mapDiditStatus(payload.status);
  if (!payload.session_id || !mappedStatus) {
    await db.update(notificationWebhookEvents)
      .set({ processingStatus: "ignored", processedAt: new Date(), lastError: "Unsupported or incomplete Didit event" })
      .where(eq(notificationWebhookEvents.providerEventId, providerEventId));
    return { status: "ignored" as const, providerEventId };
  }

  const [session] = await db
    .select()
    .from(vendorVerificationSessions)
    .where(and(eq(vendorVerificationSessions.provider, "didit"), eq(vendorVerificationSessions.providerSessionId, payload.session_id)))
    .limit(1);
  if (!session) {
    await db.update(notificationWebhookEvents)
      .set({ processingStatus: "ignored", processedAt: new Date(), lastError: "Didit session not found" })
      .where(eq(notificationWebhookEvents.providerEventId, providerEventId));
    return { status: "ignored" as const, providerEventId };
  }

  const now = new Date();
  await db.update(vendorVerificationSessions)
    .set({
      status: mappedStatus,
      metadata: { didit: payload, signatureVersion },
      reviewedAt: mappedStatus === "approved" || mappedStatus === "declined" ? now : session.reviewedAt,
      updatedAt: now,
    })
    .where(eq(vendorVerificationSessions.id, session.id));

  const profileUpdate: Record<string, unknown> = {};
  const isIdentity = session.sessionType === "identity_document" || session.sessionType === "liveness" || session.sessionType === "combined_na_vendor";
  const isResidence = session.sessionType === "proof_of_residence" || session.sessionType === "combined_na_vendor";
  const profileStatus = mappedStatus === "approved" ? "verified" : mappedStatus === "declined" ? "rejected" : mappedStatus === "expired" ? "expired" : mappedStatus === "in_review" || mappedStatus === "submitted" ? "pending" : undefined;
  if (profileStatus && isIdentity) {
    profileUpdate.identityStatus = profileStatus;
    if (profileStatus === "verified") profileUpdate.identityVerifiedAt = now;
  }
  if (profileStatus && isResidence) {
    profileUpdate.residenceStatus = profileStatus;
    if (profileStatus === "verified") profileUpdate.residenceVerifiedAt = now;
  }
  if (Object.keys(profileUpdate).length > 0) {
    await db.update(vendorProfiles).set(profileUpdate).where(eq(vendorProfiles.id, session.vendorId));
  }

  await db.update(notificationWebhookEvents)
    .set({ processingStatus: "processed", processedAt: now })
    .where(eq(notificationWebhookEvents.providerEventId, providerEventId));
  return { status: "processed" as const, providerEventId, mappedStatus };
}

async function processDiditWebhook(req: Request, res: Response) {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
  let payload: DiditWebhookPayload;
  try {
    payload = JSON.parse(rawBody.toString("utf8")) as DiditWebhookPayload;
  } catch {
    res.status(400).json({ error: "Invalid Didit webhook JSON" });
    return;
  }

  const verification = verifyDiditSignature(
    payload,
    rawBody,
    {
      signatureV2: req.header("x-signature-v2") || undefined,
      signature: req.header("x-signature") || undefined,
    },
    ENV.diditWebhookSecret
  );
  if (!verification.valid) {
    res.status(ENV.diditWebhookSecret ? 401 : 503).json({ error: verification.reason === "stale" ? "Stale Didit webhook" : "Invalid Didit webhook signature" });
    return;
  }

  try {
    const result = await applyDiditEvent(payload, verification.version || "v2");
    res.status(200).json({ accepted: true, ...result });
  } catch (error) {
    console.error("[DiditWebhook] processing failed", error instanceof Error ? error.message : String(error));
    if (!res.headersSent) res.status(500).json({ error: "Didit webhook processing failed" });
  }
}

export function registerDiditWebhook(app: Express) {
  app.post(DIDIT_WEBHOOK_PATH, express.raw({ type: "application/json", limit: "2mb" }), (req, res) => {
    void processDiditWebhook(req, res);
  });
}
