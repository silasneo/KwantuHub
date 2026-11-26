import crypto from "node:crypto";
import express, { type Express, type Request, type Response } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  notificationWebhookEvents,
  vendorProfiles,
  vendorVerificationSessions,
  accountOnboarding,
  users,
} from "../drizzle/schema";
import { getDb } from "./db";
import { ENV } from "./_core/env";
import { isAdult, readIdentity } from "./accountPolicy";
import { decryptOtp, encryptOtp } from "./contactVerification";
import { recordDiditVerificationDecisions } from "./diditDecisionPersistence";

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
  const normalized = status?.toLowerCase().replaceAll("_", " ");
  switch (normalized) {
    case "not started":
      return "created" as const;
    case "in progress":
    case "awaiting user":
      return "submitted" as const;
    case "in review":
    case "resubmitted":
      return "in_review" as const;
    case "approved":
      return "approved" as const;
    case "declined":
      return "declined" as const;
    case "expired":
    case "kyc expired":
      return "expired" as const;
    case "abandoned":
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

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export const DIDIT_PROVIDER = "didit";
export const AWAITING_DIDIT_SESSION = "Awaiting Didit session commit";
/** Callbacks for sessions that never commit are abandoned after this window. */
export const DIDIT_EARLY_EVENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type DiditCheckDecision = {
  checkType: "identity" | "residence";
  outcome: "verified" | "rejected";
  countryCode: string | null;
  reason: string;
};

export type DiditDecisionRecorderInput = {
  sessionId: number;
  vendorId: number;
  userId: number;
  decisions: DiditCheckDecision[];
  eventAt: Date;
  activeOnboarding: boolean;
  identityMatches: boolean;
  providerEventId: string;
};

export type DiditDecisionRecorder = (tx: Transaction, input: DiditDecisionRecorderInput) => Promise<void>;

let decisionRecorder: DiditDecisionRecorder | null = null;

/** Optional transactional observer; authoritative decision persistence always runs first. */
export function setDiditDecisionRecorder(recorder: DiditDecisionRecorder | null) {
  decisionRecorder = recorder;
}

type DiditStoredEventPayload = {
  session_id?: string;
  status?: string;
  signatureVersion?: "v2" | "raw";
  encryptedPayload?: string;
};

const ALPHA3_TO_ALPHA2: Record<string, string> = { USA: "US", CAN: "CA", MEX: "MX" };

export function normalizeCountryCode(value: unknown) {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(code)) return code;
  return ALPHA3_TO_ALPHA2[code] ?? null;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function decisionBody(payload: DiditWebhookPayload) {
  return asRecord(payload.decision) ?? payload;
}

function checkEntries(decision: Record<string, unknown>, plural: string[], singular: string[]) {
  for (const key of plural) if (Array.isArray(decision[key])) return (decision[key] as unknown[]).map(asRecord).filter(Boolean) as Record<string, unknown>[];
  for (const key of singular) {
    const entry = asRecord(decision[key]);
    if (entry) return [entry];
  }
  return [];
}

function checkStatus(entry: Record<string, unknown>) {
  return String(entry.status ?? "").trim().toLowerCase();
}

function residenceCountry(entry: Record<string, unknown>) {
  const parsed = asRecord(entry.parsed_address) ?? asRecord(entry.address);
  for (const value of [entry.country_code, entry.country, entry.document_country, parsed?.country_code, parsed?.country]) {
    const code = normalizeCountryCode(value);
    if (code) return code;
  }
  return null;
}

export function diditIdentityMatches(payload: DiditWebhookPayload, expected: { firstName: string; lastName: string; dateOfBirth: string }) {
  const normalizeName = (value: unknown) => String(value ?? "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
  return checkEntries(decisionBody(payload), ["id_verifications"], ["id_verification"]).some(identity =>
    checkStatus(identity) === "approved" &&
    identity.date_of_birth === expected.dateOfBirth && isAdult(expected.dateOfBirth) &&
    normalizeName(identity.first_name) === normalizeName(expected.firstName) &&
    normalizeName(identity.last_name) === normalizeName(expected.lastName));
}

/**
 * Derives per-check outcomes from the checks Didit actually reports. The requested session type
 * is never evidence: residence is certified only by an approved proof-of-address check whose
 * document country is allowed for the session (its countryCode, otherwise US/CA).
 */
export function deriveDiditCheckDecisions(
  payload: DiditWebhookPayload,
  session: { countryCode: string | null },
  options: { activeOnboarding: boolean; identityMatches: boolean }
): DiditCheckDecision[] {
  const decision = decisionBody(payload);
  const decisions: DiditCheckDecision[] = [];
  const identities = checkEntries(decision, ["id_verifications"], ["id_verification"]);
  if (identities.some(entry => checkStatus(entry) === "approved")) {
    if (!options.activeOnboarding || options.identityMatches) {
      decisions.push({ checkType: "identity", outcome: "verified", countryCode: null, reason: "Didit identity document check approved" });
    }
  } else if (identities.length && identities.every(entry => checkStatus(entry) === "declined")) {
    decisions.push({ checkType: "identity", outcome: "rejected", countryCode: null, reason: "Didit identity document check declined" });
  }

  const allowed = session.countryCode ? [session.countryCode.toUpperCase()] : ["US", "CA", "MX"];
  const residences = checkEntries(decision, ["poa_verifications", "proof_of_address_verifications"], ["poa_verification", "proof_of_address"]);
  const approvedResidence = residences.filter(entry => checkStatus(entry) === "approved");
  const allowedResidence = approvedResidence.find(entry => allowed.includes(residenceCountry(entry) ?? ""));
  if (allowedResidence) {
    decisions.push({ checkType: "residence", outcome: "verified", countryCode: residenceCountry(allowedResidence), reason: "Didit proof-of-address check approved" });
  } else if (approvedResidence.some(entry => residenceCountry(entry))) {
    decisions.push({ checkType: "residence", outcome: "rejected", countryCode: residenceCountry(approvedResidence[0]), reason: "Proof-of-address country is not eligible for this session" });
  } else if (residences.length && residences.every(entry => checkStatus(entry) === "declined")) {
    decisions.push({ checkType: "residence", outcome: "rejected", countryCode: null, reason: "Didit proof-of-address check declined" });
  }
  return decisions;
}

function diditEventIdentity(payload: DiditWebhookPayload) {
  return {
    providerEventId: payload.event_id || `${payload.session_id || "unknown"}:${payload.webhook_type || "unknown"}:${payload.timestamp || "unknown"}`,
    payloadHash: crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
  };
}

function diditEventScope(providerEventId: string) {
  return and(eq(notificationWebhookEvents.provider, DIDIT_PROVIDER), eq(notificationWebhookEvents.providerEventId, providerEventId));
}

/** Stores the full callback encrypted so it can be replayed; it is stripped once processed. */
async function persistRetryableDiditEvent(db: Database, payload: DiditWebhookPayload, signatureVersion: "v2" | "raw", lastError: string) {
  const { providerEventId, payloadHash } = diditEventIdentity(payload);
  const stored: DiditStoredEventPayload = {
    session_id: payload.session_id,
    status: payload.status,
    signatureVersion,
    encryptedPayload: encryptOtp(JSON.stringify(payload)),
  };
  await db.insert(notificationWebhookEvents).values({
    provider: DIDIT_PROVIDER, providerEventId, providerMessageId: payload.session_id,
    providerEventType: payload.webhook_type || "status.updated", signatureVerified: true, payloadHash,
    payload: stored, processingStatus: "failed", processingAttempts: 0, lastError,
    providerEventAt: parseDate(payload.timestamp || payload.created_at),
  }).onDuplicateKeyUpdate({ set: { provider: DIDIT_PROVIDER } });
  await db.update(notificationWebhookEvents).set({
    processingStatus: "failed", lastError,
    processingAttempts: sql`${notificationWebhookEvents.processingAttempts} + 1`,
    payload: stored,
  }).where(and(diditEventScope(providerEventId), eq(notificationWebhookEvents.payloadHash, payloadHash), inArray(notificationWebhookEvents.processingStatus, ["received", "failed"])));
  return providerEventId;
}

export function readStoredDiditPayload(stored: unknown) {
  const record = asRecord(stored) as DiditStoredEventPayload | null;
  if (!record?.encryptedPayload) return null;
  return {
    payload: JSON.parse(decryptOtp(record.encryptedPayload)) as DiditWebhookPayload,
    signatureVersion: record.signatureVersion ?? "v2" as const,
  };
}

export async function applyDiditEvent(
  payload: DiditWebhookPayload,
  signatureVersion: "v2" | "raw",
  options: { db?: Database; now?: Date } = {}
) {
  const db = options.db ?? await getDb();
  if (!db) throw new Error("Database unavailable");
  const { providerEventId } = diditEventIdentity(payload);
  const mappedStatus = mapDiditStatus(payload.status);
  if (!payload.session_id || !mappedStatus) return { status: "ignored" as const, providerEventId };
  const [reference] = await db.select().from(vendorVerificationSessions).where(and(
    eq(vendorVerificationSessions.provider, DIDIT_PROVIDER), eq(vendorVerificationSessions.providerSessionId, payload.session_id)
  )).limit(1);
  if (!reference) {
    // Early callback: keep it durably (encrypted) so the reconciler can apply it once the session commits.
    await persistRetryableDiditEvent(db, payload, signatureVersion, AWAITING_DIDIT_SESSION);
    return { status: "deferred" as const, providerEventId };
  }
  try {
    return await applyDiditEventToSession(db, reference.id, reference.userId, payload, signatureVersion, mappedStatus, options.now ?? new Date());
  } catch (error) {
    if (!(error instanceof DiditEventConflictError)) {
      await persistRetryableDiditEvent(db, payload, signatureVersion, error instanceof Error ? error.message.slice(0, 1000) : String(error))
        .catch(() => undefined);
    }
    throw error;
  }
}

export class DiditEventConflictError extends Error {}

async function applyDiditEventToSession(
  db: Database,
  sessionId: number,
  userId: number,
  payload: DiditWebhookPayload,
  signatureVersion: "v2" | "raw",
  mappedStatus: NonNullable<ReturnType<typeof mapDiditStatus>>,
  now: Date
) {
  const { providerEventId, payloadHash } = diditEventIdentity(payload);
  return db.transaction(async tx => {
    // Lock order: user -> session -> event (matches onboarding and admin decision paths).
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const [session] = await tx.select().from(vendorVerificationSessions).where(eq(vendorVerificationSessions.id, sessionId)).for("update");
    const eventWhere = diditEventScope(providerEventId);
    const [existing] = await tx.select().from(notificationWebhookEvents).where(eventWhere).limit(1).for("update");
    if (existing?.processingStatus === "processed" || existing?.processingStatus === "ignored") return { status: "duplicate" as const, providerEventId };
    if (existing && existing.payloadHash !== payloadHash) throw new DiditEventConflictError("Didit event ID reused with different content.");
    // Do not retain identity document details in the general notification log.
    const minimalPayload = { session_id: payload.session_id, status: payload.status };
    if (!existing) await tx.insert(notificationWebhookEvents).values({
      provider: DIDIT_PROVIDER, providerEventId, providerMessageId: payload.session_id,
      providerEventType: payload.webhook_type || "status.updated", signatureVerified: true, payloadHash,
      payload: minimalPayload,
      providerEventAt: parseDate(payload.timestamp || payload.created_at),
    });
    const finish = (lastError: string | null) => tx.update(notificationWebhookEvents).set({
      processingStatus: "processed", processedAt: now, payload: minimalPayload, lastError,
      processingAttempts: sql`${notificationWebhookEvents.processingAttempts} + 1`,
    }).where(eventWhere);

    const metadata = (asRecord(session.metadata) ?? {}) as Record<string, unknown> & { lastEventAt?: number };
    const eventAtDate = parseDate(payload.timestamp || payload.created_at);
    const eventAt = eventAtDate?.getTime() ?? 0;
    // Monotonic: older events and terminal -> non-terminal regressions never change state.
    if (eventAt < (metadata.lastEventAt ?? 0) ||
      (["approved", "declined", "expired", "abandoned"].includes(session.status) && ["created", "submitted", "in_review"].includes(mappedStatus))) {
      await finish("Out-of-order Didit event; session state unchanged");
      return { status: "ignored" as const, providerEventId };
    }
    const [onboarding] = await tx.select().from(accountOnboarding).where(eq(accountOnboarding.userId, session.userId)).for("update");
    const activeOnboardingSession = onboarding?.kycSessionId === session.id;
    const identityMatches = activeOnboardingSession && mappedStatus === "approved"
      ? diditIdentityMatches(payload, readIdentity(onboarding.identityCiphertext))
      : false;
    const status = activeOnboardingSession && mappedStatus === "approved" && !identityMatches ? "in_review" : mappedStatus;
    const decisions = mappedStatus === "approved" || mappedStatus === "declined"
      ? deriveDiditCheckDecisions(payload, session, { activeOnboarding: activeOnboardingSession, identityMatches })
      : [];
    await tx.update(vendorVerificationSessions).set({
      status,
      metadata: {
        ...metadata,
        lastEventAt: eventAt,
        lastProviderEventId: providerEventId,
        providerStatus: mappedStatus,
        signatureVersion,
        identityMatches,
        identityMatchedAt: identityMatches ? now.toISOString() : null,
        activeOnboarding: activeOnboardingSession,
        checkOutcomes: decisions.map(({ checkType, outcome, countryCode }) => ({ checkType, outcome, countryCode })),
      },
      reviewedAt: ["approved", "declined"].includes(status) ? now : session.reviewedAt, updatedAt: now,
    }).where(eq(vendorVerificationSessions.id, session.id));
    if (decisions.length) {
      const input = {
        sessionId: session.id, vendorId: session.vendorId, userId: session.userId, decisions,
        eventAt: eventAtDate ?? now, activeOnboarding: activeOnboardingSession, identityMatches, providerEventId,
      };
      await recordDiditVerificationDecisions(tx, input);
      if (decisionRecorder) await decisionRecorder(tx, input);
    }
    if (activeOnboardingSession) {
      await tx.update(accountOnboarding).set({ kycVerifiedAt: identityMatches ? now : null }).where(eq(accountOnboarding.userId, session.userId));
      await tx.update(vendorProfiles).set({
        identityStatus: identityMatches ? "verified" : status === "declined" ? "rejected" : status === "expired" ? "expired" : "pending",
        identityVerifiedAt: identityMatches ? now : null,
      }).where(eq(vendorProfiles.id, session.vendorId));
    }
    await finish(activeOnboardingSession && mappedStatus === "approved" && !identityMatches ? "Verified name/date of birth missing or mismatched; activation blocked." : null);
    return { status: "processed" as const, providerEventId, mappedStatus: status, decisions };
  });
}

/** Replays a stored retryable Didit event (early callback or failed processing). */
export async function reprocessDiditWebhookEvent(db: Database, event: typeof notificationWebhookEvents.$inferSelect, now = new Date()) {
  const stored = readStoredDiditPayload(event.payload);
  const scope = and(diditEventScope(event.providerEventId), inArray(notificationWebhookEvents.processingStatus, ["received", "failed"]));
  if (!stored) {
    await db.update(notificationWebhookEvents).set({ processingStatus: "ignored", processedAt: now, lastError: "No replayable payload" }).where(scope);
    return "ignored" as const;
  }
  if (now.getTime() - event.receivedAt.getTime() > DIDIT_EARLY_EVENT_WINDOW_MS) {
    await db.update(notificationWebhookEvents).set({
      processingStatus: "ignored", processedAt: now,
      payload: { session_id: stored.payload.session_id, status: stored.payload.status },
      lastError: "Didit event could not be applied within the retry window",
    }).where(scope);
    return "ignored" as const;
  }
  const result = await applyDiditEvent(stored.payload, stored.signatureVersion, { db, now });
  return result.status === "deferred" ? "pending" as const : "processed" as const;
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
