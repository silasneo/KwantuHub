import { createHash, randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { eq, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { authRateLimits, authSessions, moderationRecords, users } from "../drizzle/schema";
import { normalizeEmail } from "./contactVerification";
import type { getDb } from "./db";
import { enqueueNotificationEvent } from "./notificationWorker";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export const accountEmailSchema = z
  .string()
  .trim()
  .email()
  .max(320)
  .transform(normalizeEmail);
export const newPasswordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .refine(
    value => Buffer.byteLength(value, "utf8") <= 72,
    "Use a password of at most 72 UTF-8 bytes."
  );

export function isDuplicateEmailError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const cause = error.cause ?? error;
  return (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    cause.code === "ER_DUP_ENTRY" &&
    "sqlMessage" in cause &&
    typeof cause.sqlMessage === "string" &&
    cause.sqlMessage.includes("users_email_unique")
  );
}

export async function setAccountStatus(
  db: Database,
  userId: number,
  status: "active" | "suspended",
  audit?: { actorId: number; action: string; reason: string }
) {
  await db.transaction(async tx => {
    const administrators = await tx.select({ id: users.id, status: users.status }).from(users)
      .where(eq(users.role, "admin")).orderBy(users.id).for("update");
    const [user] = await tx
      .select({ id: users.id, status: users.status, role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    if (!user)
      throw new TRPCError({ code: "NOT_FOUND", message: "Account not found." });
    if (status === "suspended" && (audit?.actorId === userId ||
      (user.role === "admin" && !administrators.some(account => account.id !== userId && account.status === "active")))) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Cannot suspend yourself or the last active administrator." });
    }
    if (user.status === status) return;
    await tx
      .update(users)
      .set({ status, updatedAt: new Date() })
      .where(eq(users.id, userId));
    if (status === "suspended")
      await tx.delete(authSessions).where(eq(authSessions.userId, userId));
    if (audit) await tx.insert(moderationRecords).values({
      entityType: "account", entityId: String(userId), ...audit,
    });
    await enqueueNotificationEvent(tx, {
      eventType: "ACCOUNT_STATUS_CHANGED", idempotencyKey: `account_status:${userId}:${randomUUID()}`,
      recipientUserId: userId, actorUserId: audit?.actorId, entityType: "account", entityId: userId,
      payload: { status, actionUrl: status === "suspended" ? "/support" : "/login" },
    });
  });
}

export async function enforceAuthRateLimit(
  db: Database,
  scope: string,
  identity: string,
  limit: number,
  windowMs: number,
  now = Date.now()
) {
  const bucket = Math.floor(now / windowMs);
  const id = createHash("sha256")
    .update(JSON.stringify([scope, identity, bucket]))
    .digest("hex");
  const expiresAt = new Date((bucket + 1) * windowMs);
  // A fixed-window counter is shared across app instances and survives restarts.
  const attempts = await db.transaction(async tx => {
    await tx
      .insert(authRateLimits)
      .values({ id, expiresAt })
      .onDuplicateKeyUpdate({
        set: { attempts: sql`${authRateLimits.attempts} + 1` },
      });
    const [row] = await tx
      .select({ attempts: authRateLimits.attempts })
      .from(authRateLimits)
      .where(eq(authRateLimits.id, id));
    return row.attempts;
  });
  await db
    .delete(authRateLimits)
    .where(lte(authRateLimits.expiresAt, new Date(now)))
    .limit(100);
  if (attempts > limit) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Too many attempts. Try again in ${Math.max(1, Math.ceil((expiresAt.getTime() - now) / 60_000))} minute(s).`,
    });
  }
}

const LOGIN_COOLDOWN_MS = 6 * 60 * 60_000;

export async function checkLoginAttempt(
  db: Database,
  email: string,
  ip: string,
  verify: () => Promise<boolean>,
  clock = Date.now
) {
  const policies = [
    { scope: "email", identity: normalizeEmail(email), limit: 5, warning: 3 },
    { scope: "IP", identity: ip, limit: 15, warning: 9 },
  ]
    .map(policy => ({
      ...policy,
      id: createHash("sha256")
        .update(
          JSON.stringify(["login_failures_v2", policy.scope, policy.identity])
        )
        .digest("hex"),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const result = await db.transaction(async tx => {
    const counters = [];
    // Consistent lock ordering serializes concurrent failures across replicas.
    for (const policy of policies) {
      await tx
        .insert(authRateLimits)
        .values({ id: policy.id, attempts: 0, expiresAt: new Date(clock()) })
        .onDuplicateKeyUpdate({ set: { id: policy.id } });
      const [row] = await tx
        .select()
        .from(authRateLimits)
        .where(eq(authRateLimits.id, policy.id))
        .for("update");
      counters.push({
        ...policy,
        attempts: row.expiresAt.getTime() > clock() ? row.attempts : 0,
        expiresAt: row.expiresAt,
      });
    }
    const blockedUntil = Math.max(
      0,
      ...counters
        .filter(counter => counter.attempts >= counter.limit)
        .map(counter => counter.expiresAt.getTime())
    );
    if (blockedUntil) return { blockedUntil };
    if (await verify()) return { valid: true as const };
    const now = clock();
    const warnings: string[] = [];
    let newBlockedUntil = 0;
    for (const counter of counters) {
      const attempts = counter.attempts + 1;
      const expiresAt =
        attempts >= counter.limit || counter.attempts === 0
          ? new Date(now + LOGIN_COOLDOWN_MS)
          : counter.expiresAt;
      await tx
        .update(authRateLimits)
        .set({ attempts, expiresAt })
        .where(eq(authRateLimits.id, counter.id));
      if (attempts >= counter.limit)
        newBlockedUntil = Math.max(newBlockedUntil, expiresAt.getTime());
      else if (attempts >= counter.warning)
        warnings.push(
          `${counter.limit - attempts} incorrect attempt(s) remaining for this ${counter.scope} before a six-hour sign-in lockout.`
        );
    }
    return newBlockedUntil
      ? { blockedUntil: newBlockedUntil }
      : { warning: warnings.join(" ") };
  });
  if ("blockedUntil" in result && result.blockedUntil)
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Too many incorrect sign-in attempts. Try again in ${Math.max(1, Math.ceil((result.blockedUntil - clock()) / 60_000))} minute(s).`,
    });
  if (!("valid" in result))
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: `Invalid email or password.${"warning" in result && result.warning ? ` Warning: ${result.warning}` : ""}`,
    });
}
