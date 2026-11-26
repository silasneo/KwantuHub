import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import type { Request } from "express";
import { and, eq } from "drizzle-orm";
import { abuseSignals } from "../drizzle/schema";
import {
  assertTurnstileConfiguration,
  ENV,
  isTurnstileTestKey,
} from "./_core/env";
import type { drizzle } from "drizzle-orm/mysql2";

const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type Database = ReturnType<typeof drizzle>;

export function getRequestIp(req: Request) {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

export function hashIp(ip: string) {
  return createHash("sha256")
    .update(`${ip}:${ENV.cookieSecret || "kwantuhub-development-secret"}`)
    .digest("hex");
}

export function isTurnstileConfigured() {
  return (
    ENV.turnstileMode !== "disabled" || process.env.NODE_ENV === "production"
  );
}

export async function verifyTurnstile(
  token: string | undefined,
  options: { action?: string; hostname?: string; remoteIp?: string } = {}
) {
  if (
    ENV.turnstileMode === "disabled" &&
    process.env.NODE_ENV !== "production"
  ) {
    return { configured: false, success: true as const };
  }
  try {
    assertTurnstileConfiguration();
  } catch {
    return {
      configured: true,
      success: false as const,
      codes: ["configuration-error"],
    };
  }
  if (!token || token.length > 2048) {
    return {
      configured: true,
      success: false as const,
      codes: ["missing-input-response"],
    };
  }
  if (process.env.NODE_ENV === "production" && !options.action) {
    return {
      configured: true,
      success: false as const,
      codes: ["missing-expected-action"],
    };
  }

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        secret: ENV.turnstileSecret,
        response: token,
        ...(options.remoteIp ? { remoteip: options.remoteIp } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("Turnstile provider unavailable");
    const body = (await response.json()) as {
      success?: boolean;
      "error-codes"?: string[];
      action?: string;
      hostname?: string;
    };
    const codes = body["error-codes"] || [];
    if (body.success !== true)
      return { configured: true, success: false as const, codes };
    if (
      options.action &&
      !isTurnstileTestKey(ENV.turnstileSecret) &&
      body.action !== options.action
    ) {
      return {
        configured: true,
        success: false as const,
        codes: ["action-mismatch"],
      };
    }
    const expectedHostname =
      process.env.NODE_ENV === "production"
        ? ENV.turnstileExpectedHostname
        : options.hostname || ENV.turnstileExpectedHostname;
    if (
      expectedHostname &&
      !isTurnstileTestKey(ENV.turnstileSecret) &&
      body.hostname !== expectedHostname
    ) {
      return {
        configured: true,
        success: false as const,
        codes: ["hostname-mismatch"],
      };
    }
    return { configured: true, success: true as const };
  } catch {
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message:
        "Human verification is temporarily unavailable. Please try again shortly.",
    });
  }
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
