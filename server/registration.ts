import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { parse } from "cookie";
import type { Request } from "express";
import { and, eq, gt, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { pendingRegistrations, users } from "../drizzle/schema";
import { getDb } from "./db";
import { publicProcedure } from "./_core/trpc";
import { accountEmailSchema, enforceAuthRateLimit, isDuplicateEmailError, newPasswordSchema } from "./accountSecurity";
import { getRequestIp, verifyTurnstile } from "./abuseProtection";
import { decryptOtp, encryptOtp, generateOtp, OTP_MAX_ATTEMPTS, OTP_TTL_MS } from "./contactVerification";
import { hashPassword, issueAuthSession, publicUser } from "./jwtAuth";
import { TERMS_VERSION } from "./accountPolicy";
import { screenEmailAddress } from "./emailPolicy";
import { sendAccountEmail } from "./accountFlows";

export const REGISTRATION_TTL_MS = 24 * 60 * 60_000;
const COOKIE = "kwantu_registration";
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
async function database() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Registration database unavailable." });
  return db;
}
function tokenHash(req: Request) {
  const token = parse(req.headers.cookie || "")[COOKIE];
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return createHash("sha256").update(token).digest("hex");
}
function expired(): never {
  throw new TRPCError({ code: "UNAUTHORIZED", message: "Registration expired or unavailable. Start registration again." });
}
async function current(req: Request) {
  const key = tokenHash(req);
  if (!key) return expired();
  const db = await database();
  const [row] = await db.select().from(pendingRegistrations).where(and(
    eq(pendingRegistrations.tokenHash, key), gt(pendingRegistrations.expiresAt, new Date())
  ));
  return row ?? expired();
}
function describe(row: typeof pendingRegistrations.$inferSelect) {
  return { email: row.email, signupIntent: row.signupIntent, expiresAt: row.expiresAt, codeExpiresAt: row.codeExpiresAt };
}

export async function purgeExpiredRegistrations(now = new Date()) {
  const db = await database();
  const [result] = await db.delete(pendingRegistrations).where(lte(pendingRegistrations.expiresAt, now)).limit(500);
  if (result.affectedRows) console.info("[Registration] Expired pending registrations removed", { count: result.affectedRows });
  return result.affectedRows;
}

export const registrationProcedures = {
  register: publicProcedure.input(z.object({
    email: accountEmailSchema, firstName: z.string().trim().max(100).default(""),
    lastName: z.string().trim().max(100).default(""), role: z.enum(["buyer", "vendor"]).default("buyer"),
    termsAccepted: z.literal(true), turnstileToken: z.string().max(2048).optional(),
  }).strict().superRefine((input, ctx) => {
    if (input.role === "buyer") for (const field of ["firstName", "lastName"] as const) {
      if (!input[field]) ctx.addIssue({ code: "custom", path: [field], message: "Name is required." });
    }
  })).mutation(async ({ ctx, input }) => {
    const db = await database();
    if (ctx.user) throw new TRPCError({ code: "CONFLICT", message: "Sign out before starting another registration." });
    await enforceAuthRateLimit(db, "register_ip", getRequestIp(ctx.req), 10, 60 * 60_000);
    await enforceAuthRateLimit(db, "register_email", input.email, 6, 60 * 60_000);
    const challenge = await verifyTurnstile(input.turnstileToken, { remoteIp: getRequestIp(ctx.req), action: "register" });
    if (!challenge.success) throw new TRPCError({ code: "BAD_REQUEST", message: "Complete the human verification challenge." });
    await screenEmailAddress(input.email);
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email));
    if (existing) throw new TRPCError({ code: "CONFLICT", message: "This address has an account. Sign in or use password recovery." });
    const token = randomBytes(32).toString("hex");
    const row = {
      tokenHash: createHash("sha256").update(token).digest("hex"), email: input.email,
      firstName: input.firstName, lastName: input.lastName, signupIntent: input.role, termsVersion: TERMS_VERSION,
      expiresAt: new Date(Math.floor((Date.now() + REGISTRATION_TTL_MS) / 1000) * 1000),
    };
    await db.insert(pendingRegistrations).values(row);
    ctx.res.cookie(COOKIE, token, { ...cookieOptions, maxAge: REGISTRATION_TTL_MS });
    return { email: row.email, signupIntent: row.signupIntent, expiresAt: row.expiresAt };
  }),
  registrationStatus: publicProcedure.query(async ({ ctx }) => {
    if (!tokenHash(ctx.req)) return null;
    const key = tokenHash(ctx.req)!;
    const db = await database();
    const [row] = await db.select().from(pendingRegistrations).where(and(
      eq(pendingRegistrations.tokenHash, key), gt(pendingRegistrations.expiresAt, new Date())
    ));
    return row ? describe(row) : null;
  }),
  requestRegistrationOtp: publicProcedure.mutation(async ({ ctx }) => {
    const row = await current(ctx.req);
    const db = await database();
    await enforceAuthRateLimit(db, "registration_send_ip", getRequestIp(ctx.req), 15, 60 * 60_000);
    await enforceAuthRateLimit(db, "email_send_destination", row.email, 6, 60 * 60_000);
    await screenEmailAddress(row.email);
    return db.transaction(async tx => {
      const [locked] = await tx.select().from(pendingRegistrations)
        .where(eq(pendingRegistrations.tokenHash, row.tokenHash)).for("update");
      if (!locked || locked.expiresAt.getTime() <= Date.now()) return expired();
      if (locked.codeExpiresAt && locked.codeExpiresAt.getTime() > Date.now()) throw new TRPCError({
        code: "TOO_MANY_REQUESTS", message: "A code is still active. Wait until expiry before resending.",
      });
      const code = generateOtp();
      const expiresAt = new Date(Math.min(locked.expiresAt.getTime(), Math.floor(Date.now() / 1000) * 1000 + OTP_TTL_MS));
      await tx.update(pendingRegistrations).set({ codeCiphertext: encryptOtp(code), attempts: 0, codeExpiresAt: expiresAt })
        .where(eq(pendingRegistrations.tokenHash, row.tokenHash));
      await sendAccountEmail(row.email, "Your KwantuHub verification code",
        `Your KwantuHub verification code is ${code}. It expires at ${expiresAt.toISOString()} (within 10 minutes). If you did not request this, ignore this email.`,
        `registration:${row.tokenHash}:${expiresAt.getTime()}`);
      return { expiresAt, message: `Code sent successfully to ${row.email}.` };
    });
  }),
  completeRegistration: publicProcedure.input(z.object({ code: z.string().regex(/^\d{6}$/), password: newPasswordSchema }))
    .mutation(async ({ ctx, input }) => {
      const row = await current(ctx.req);
      const db = await database();
      await enforceAuthRateLimit(db, "registration_verify_ip", getRequestIp(ctx.req), 30, 15 * 60_000);
      await enforceAuthRateLimit(db, "registration_verify_email", row.email, 20, 15 * 60_000);
      await screenEmailAddress(row.email);
      const passwordHash = await hashPassword(input.password);
      let result;
      try {
        result = await db.transaction(async tx => {
          const [locked] = await tx.select().from(pendingRegistrations)
            .where(eq(pendingRegistrations.tokenHash, row.tokenHash)).for("update");
          if (!locked || locked.expiresAt.getTime() <= Date.now()) return { error: "Registration expired. Start again." };
          if (!locked.codeCiphertext || !locked.codeExpiresAt || locked.codeExpiresAt.getTime() <= Date.now() || locked.attempts >= OTP_MAX_ATTEMPTS) {
            return { error: "Code expired or locked. Request a new code after expiry." };
          }
          const expected = Buffer.from(decryptOtp(locked.codeCiphertext));
          const provided = Buffer.from(input.code);
          if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
            await tx.update(pendingRegistrations).set({ attempts: locked.attempts + 1 })
              .where(eq(pendingRegistrations.tokenHash, row.tokenHash));
            return { error: "Incorrect verification code." };
          }
          const now = new Date();
          const [created] = await tx.insert(users).values({
            openId: `jwt-${randomUUID()}`, email: locked.email, emailVerifiedAt: now, passwordHash,
            firstName: locked.firstName || null, lastName: locked.lastName || null,
            name: `${locked.firstName} ${locked.lastName}`.trim() || null,
            signupIntent: locked.signupIntent, role: "buyer", status: "active",
            termsAcceptedAt: now, termsVersion: locked.termsVersion,
          });
          await tx.delete(pendingRegistrations).where(eq(pendingRegistrations.tokenHash, row.tokenHash));
          const [user] = await tx.select().from(users).where(eq(users.id, created.insertId));
          return { user };
        });
      } catch (error) {
        if (isDuplicateEmailError(error)) throw new TRPCError({
          code: "CONFLICT", message: "This email already has an account. Sign in or use password recovery.",
        });
        throw error;
      }
      if (!result.user) throw new TRPCError({ code: "BAD_REQUEST", message: result.error });
      await issueAuthSession(result.user, ctx.res);
      ctx.res.clearCookie(COOKIE, cookieOptions);
      return { user: { ...publicUser(result.user), vendorProfile: null } };
    }),
  cancelRegistration: publicProcedure.mutation(async ({ ctx }) => {
    const key = tokenHash(ctx.req);
    if (key) await (await database()).delete(pendingRegistrations).where(eq(pendingRegistrations.tokenHash, key));
    ctx.res.clearCookie(COOKIE, cookieOptions);
    return { success: true };
  }),
};
