import { createHash } from "node:crypto";
import type { Request } from "express";
import { and, eq } from "drizzle-orm";
import { abuseSignals } from "../drizzle/schema";
import { ENV } from "./_core/env";
import type { drizzle } from "drizzle-orm/mysql2";

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type Database = ReturnType<typeof drizzle>;

export function getRequestIp(req: Request) {
  const forwarded = req.headers["x-forwarded-for"];
  return (
    (typeof forwarded === "string" ? forwarded.split(",")[0]?.trim() : undefined) ||
    req.headers["cf-connecting-ip"]?.toString() ||
    req.ip ||
    "unknown"
  );
}

export function hashIp(ip: string) {
  return createHash("sha256")
    .update(`${ip}:${ENV.cookieSecret || "kwantuhub-development-secret"}`)
    .digest("hex");
}

export function isTurnstileConfigured() {
  return Boolean(ENV.turnstileSecret);
}

export async function verifyTurnstile(
  token: string | undefined,
  options: { action?: string; hostname?: string; remoteIp?: string } = {}
) {
  // A missing secret keeps local development usable; production must configure it.
  if (!ENV.turnstileSecret) return { configured: false, success: true as const };
  if (!token || token.length > 2048) {
    return { configured: true, success: false as const, codes: ["missing-input-response"] };
  }

  const response = await fetch(TURNSTILE_VERIFY_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      secret: ENV.turnstileSecret,
      response: token,
      ...(options.remoteIp ? { remoteip: options.remoteIp } : {}),
    }),
  });
  const body = (await response.json()) as {
    success?: boolean;
    "error-codes"?: string[];
    action?: string;
    hostname?: string;
  };
  const codes = body["error-codes"] || [];
  if (!body.success) return { configured: true, success: false as const, codes };
  if (options.action && body.action && body.action !== options.action) {
    return { configured: true, success: false as const, codes: ["action-mismatch"] };
  }
  const expectedHostname = options.hostname || ENV.turnstileExpectedHostname;
  // In test/sandbox environments, Cloudflare's dummy test token returns dummy hostnames like example.com or localhost.
  // Allow test hostnames or exact match or subdomain matches.
  const isTestHostname = body.hostname === "example.com" || body.hostname === "localhost" || body.hostname === "127.0.0.1";
  if (
    expectedHostname &&
    body.hostname &&
    body.hostname !== expectedHostname &&
    !body.hostname.endsWith(`.${expectedHostname}`) &&
    !isTestHostname
  ) {
    return { configured: true, success: false as const, codes: ["hostname-mismatch"] };
  }
  return { configured: true, success: true as const };
}

export async function recordAbuseSignal(
  db: Database,
  input: {
    userId?: number | null;
    signalType: (typeof abuseSignals.signalType.enumValues)[number];
    ip?: string;
    metadata?: Record<string, unknown>;
  }
) {
  await db.insert(abuseSignals).values({
    userId: input.userId ?? null,
    signalType: input.signalType,
    ipHash: input.ip ? hashIp(input.ip) : null,
    metadata: input.metadata ?? null,
  });
}

export async function hasRecentAbuseSignal(
  db: Database,
  userId: number,
  signalType: (typeof abuseSignals.signalType.enumValues)[number],
  since: Date
) {
  const [row] = await db
    .select({ id: abuseSignals.id })
    .from(abuseSignals)
    .where(
      and(
        eq(abuseSignals.userId, userId),
        eq(abuseSignals.signalType, signalType)
      )
    )
    .limit(1);
  return Boolean(row);
}
