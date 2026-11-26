import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import sharp from "sharp";
import { protectedProcedure, publicProcedure } from "./_core/trpc";
import { getDb } from "./db";
import {
  accountOnboarding, accountResetTokens, authSessions, moderationRecords, notificationOutbox, users, verificationChallenges,
  vendorProfiles, vendorVerificationSessions,
} from "../drizzle/schema";
import {
  decryptOtp, encryptOtp, generateOtp, hashVerificationTarget, isOtpExpired,
  maskContact, OTP_MAX_ATTEMPTS, OTP_RESEND_COOLDOWN_MS, OTP_TTL_MS,
} from "./contactVerification";
import { accountEmailSchema, enforceAuthRateLimit, isDuplicateEmailError, newPasswordSchema } from "./accountSecurity";
import { getRequestIp, verifyTurnstile } from "./abuseProtection";
import { SendPulseTransactionalEmailAdapter } from "./sendPulseAdapter";
import { checkPhoneVerification, isTwilioVerifyConfigured, startPhoneVerification } from "./twilioVerify";
import { clearAuthCookie, hashPassword, verifyPassword } from "./jwtAuth";
import { isAdult, personalDetailsSchema, readIdentity, TERMS_VERSION, vendorPhone } from "./accountPolicy";
import { DiditVerificationAdapter } from "./vendorVerificationAdapters";
import { storageDelete, storagePut } from "./storage";
import { ENV } from "./_core/env";
import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { phoneCountryProcedures, phoneCountrySchema, requireEnabledPhoneCountry } from "./phoneCountries";
import { screenEmailAddress } from "./emailPolicy";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const codeSchema = z.object({ code: z.string().regex(/^\d{6}$/) });
const challengeOptions = z.object({ turnstileToken: z.string().max(2048).optional() });

async function database() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Account database unavailable." });
  return db;
}

async function challengeCheck(req: Parameters<typeof getRequestIp>[0], token: string | undefined, action: string) {
  const result = await verifyTurnstile(token, { remoteIp: getRequestIp(req), action });
  if (!result.success) throw new TRPCError({ code: "BAD_REQUEST", message: "Complete the human verification challenge and try again." });
}

function emailAdapter() {
  const adapter = new SendPulseTransactionalEmailAdapter();
  if (!adapter.isConfigured()) throw new TRPCError({
    code: "PRECONDITION_FAILED", message: "Transactional email is not configured. Contact support.",
  });
  return adapter;
}

export async function sendAccountEmail(to: string, subject: string, text: string, id: string) {
  const result = await providerRequest("Email delivery", () => emailAdapter().send({
    to: [{ email: to }], subject, text, html: `<p>${text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</p>`,
    idempotencyKey: id,
  }));
  if (!result.accepted) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Email delivery was not accepted. Please retry." });
}

async function providerRequest<T>(label: string, operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) {
    console.error(`[Account] ${label} failed`, error instanceof Error ? error.message.slice(0, 300) : "UnknownError");
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `${label} is temporarily unavailable. Retry or contact support.`, cause: error });
  }
}

async function lockUser(tx: Transaction, id: number) {
  const [user] = await tx.select().from(users).where(eq(users.id, id)).for("update");
  if (!user || user.status !== "active") throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in again." });
  return user;
}

export async function issueEmailCode(db: Database, userId: number, newEmail?: string, expectedPasswordHash?: string) {
  emailAdapter();
  const [destination] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
  const email = newEmail ?? destination?.email;
  if (!email) throw new TRPCError({ code: "BAD_REQUEST", message: "Add an email address first." });
  await screenEmailAddress(email);
  await enforceAuthRateLimit(db, "email_send_destination", email, 6, 60 * 60_000);
  await enforceAuthRateLimit(db, "email_otp", String(userId), 6, 60 * 60_000);
  return db.transaction(async tx => {
    const user = await lockUser(tx, userId);
    if (expectedPasswordHash && user.passwordHash !== expectedPasswordHash) throw new TRPCError({
      code: "UNAUTHORIZED", message: "Credentials changed. Sign in and try again.",
    });
    const target = newEmail ?? user.email;
    if (!target) throw new TRPCError({ code: "BAD_REQUEST", message: "Add an email address first." });
    if (!newEmail && user.emailVerifiedAt) return { verified: true, destination: maskContact("email", target) };
    const purpose = newEmail ? "email_change" : "email_ownership";
    const [recent] = await tx.select().from(verificationChallenges).where(and(
      eq(verificationChallenges.userId, userId), eq(verificationChallenges.channel, "email"),
      ...(newEmail
        ? [gt(verificationChallenges.lastSentAt, new Date(Date.now() - OTP_RESEND_COOLDOWN_MS))]
        : [eq(verificationChallenges.purpose, purpose), isNull(verificationChallenges.consumedAt), gt(verificationChallenges.expiresAt, new Date())])
    )).limit(1);
    if (recent) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: newEmail
      ? "Wait 60 seconds before requesting another email code." : "An email code is still active. Wait until it expires before resending." });
    const now = new Date(Math.floor(Date.now() / 1000) * 1000);
    await tx.update(verificationChallenges).set({ consumedAt: now }).where(and(
      eq(verificationChallenges.userId, userId), eq(verificationChallenges.channel, "email"), isNull(verificationChallenges.consumedAt)
    ));
    const code = generateOtp();
    const [created] = await tx.insert(verificationChallenges).values({
      userId, purpose, channel: "email", targetHash: hashVerificationTarget(target),
      targetCiphertext: newEmail ? encryptOtp(target) : null, codeCiphertext: encryptOtp(code),
      expiresAt: new Date(now.getTime() + OTP_TTL_MS),
    });
    await sendAccountEmail(target, "Your KwantuHub verification code",
      `Your KwantuHub verification code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`,
      `account-email:${created.insertId}`);
    return { verified: false, destination: maskContact("email", target), expiresInSeconds: OTP_TTL_MS / 1000,
      expiresAt: new Date(now.getTime() + OTP_TTL_MS) };
  });
}

async function verifyCode(userId: number, channel: "email" | "phone", code: string, emailChange = false) {
  const db = await database();
  await enforceAuthRateLimit(db, `verify_${channel}`, String(userId), 20, 15 * 60_000);
  const result = await db.transaction(async tx => {
    const user = await lockUser(tx, userId);
    const purpose = channel === "phone" ? "phone_ownership" : emailChange ? "email_change" : "email_ownership";
    const [challenge] = await tx.select().from(verificationChallenges).where(and(
      eq(verificationChallenges.userId, userId), eq(verificationChallenges.purpose, purpose),
      isNull(verificationChallenges.consumedAt)
    )).orderBy(desc(verificationChallenges.id)).limit(1).for("update");
    if (!challenge || isOtpExpired(challenge.expiresAt) || challenge.attempts >= challenge.maxAttempts) {
      return { error: "This code has expired or is locked. Request a new code." };
    }
    const target = emailChange && challenge.targetCiphertext
      ? decryptOtp(challenge.targetCiphertext) : channel === "email" ? user.email : user.phone;
    if (!target || challenge.targetHash !== hashVerificationTarget(target)) {
      await tx.update(verificationChallenges).set({ consumedAt: new Date() }).where(eq(verificationChallenges.id, challenge.id));
      return { error: "The contact details changed. Request a new code." };
    }
    if (channel === "phone") {
      const country = parsePhoneNumberFromString(target)?.country;
      if (!country) return { error: "Invalid phone country. Request a new code." };
      await requireEnabledPhoneCountry(country);
    }
    let valid: boolean;
    if (channel === "phone" && challenge.provider === "twilio") {
      const response = await providerRequest("SMS verification", () => checkPhoneVerification(target, code));
      valid = response.status === "approved";
    } else {
      const expected = Buffer.from(decryptOtp(challenge.codeCiphertext));
      const provided = Buffer.from(code);
      valid = expected.length === provided.length && timingSafeEqual(expected, provided);
    }
    if (!valid) {
      await tx.update(verificationChallenges).set({ attempts: challenge.attempts + 1 }).where(eq(verificationChallenges.id, challenge.id));
      return { error: "Incorrect verification code." };
    }
    const now = new Date();
    await tx.update(verificationChallenges).set({ consumedAt: now }).where(eq(verificationChallenges.id, challenge.id));
    await tx.update(users).set(channel === "phone"
      ? { phoneVerifiedAt: now }
      : { emailVerifiedAt: now, ...(emailChange ? { email: target } : {}) }
    ).where(eq(users.id, userId));
    if (emailChange) {
      await tx.delete(authSessions).where(eq(authSessions.userId, userId));
      await tx.delete(accountResetTokens).where(eq(accountResetTokens.userId, userId));
    }
    return { verified: true as const };
  });
  if ("error" in result) throw new TRPCError({ code: "BAD_REQUEST", message: result.error });
  return result;
}

export async function vendorReady(tx: Transaction, userId: number) {
  const user = await lockUser(tx, userId);
  const [onboarding] = await tx.select().from(accountOnboarding).where(eq(accountOnboarding.userId, userId)).for("update");
  if (!user.emailVerifiedAt || !user.phoneVerifiedAt || !vendorPhone(user.phone || "") ||
      !user.termsAcceptedAt || user.termsVersion !== TERMS_VERSION ||
      !onboarding?.kycVerifiedAt || !onboarding.kycSessionId) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Complete email, phone, terms and Didit identity verification before activating your storefront." });
  }
  const identity = readIdentity(onboarding.identityCiphertext);
  const [session] = await tx.select().from(vendorVerificationSessions).where(and(
    eq(vendorVerificationSessions.id, onboarding.kycSessionId), eq(vendorVerificationSessions.userId, userId),
    eq(vendorVerificationSessions.provider, "didit"), eq(vendorVerificationSessions.status, "approved"),
    gt(vendorVerificationSessions.expiresAt, new Date())
  )).limit(1);
  if (!session || !isAdult(identity.dateOfBirth)) throw new TRPCError({
    code: "PRECONDITION_FAILED", message: "Valid adult identity verification is required.",
  });
  return { user, onboarding };
}

export async function queuePasswordReset(db: Database, email: string, adminId?: number) {
  emailAdapter();
  const [user] = await db.select().from(users).where(and(eq(users.email, email), eq(users.status, "active")));
  if (!user?.passwordHash) return;
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await db.transaction(async tx => {
    const current = await lockUser(tx, user.id);
    if (current.email !== email) return;
    await tx.delete(accountResetTokens).where(eq(accountResetTokens.userId, user.id));
    await tx.insert(accountResetTokens).values({ userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 30 * 60_000) });
    await tx.insert(notificationOutbox).values({
      eventType: "PASSWORD_RESET", idempotencyKey: `reset:${tokenHash}`, recipientUserId: user.id,
      entityType: "user", entityId: user.id,
      payload: { tokenCiphertext: encryptOtp(token), emailHash: hashVerificationTarget(email) },
    });
    if (adminId) await tx.insert(moderationRecords).values({
      entityType: "conversation", entityId: `user:${user.id}`, actorId: adminId,
      action: "account_password_reset_requested", reason: "Admin requested a recovery link to the existing account email.",
    });
  });
}

export const accountProcedures = {
  ...phoneCountryProcedures,
  contactStatus: protectedProcedure.query(async ({ ctx }) => {
    const db = await database();
    const [user] = await db.select().from(users).where(eq(users.id, ctx.user.id));
    const challenges = await db.select().from(verificationChallenges).where(and(
      eq(verificationChallenges.userId, ctx.user.id), isNull(verificationChallenges.consumedAt),
      gt(verificationChallenges.expiresAt, new Date())
    )).orderBy(desc(verificationChallenges.id));
    const expiry = (purpose: "email_ownership" | "phone_ownership", target: string | null) =>
      challenges.find(challenge => challenge.purpose === purpose && target &&
        challenge.targetHash === hashVerificationTarget(target))?.expiresAt ?? null;
    return {
      email: { value: user.email, verified: Boolean(user.emailVerifiedAt), expiresAt: expiry("email_ownership", user.email) },
      phone: { value: user.phone ? maskContact("phone", user.phone) : null, verified: Boolean(user.phoneVerifiedAt), expiresAt: expiry("phone_ownership", user.phone) },
    };
  }),
  requestEmailOtp: protectedProcedure.input(challengeOptions.optional()).mutation(async ({ ctx, input }) => {
    return issueEmailCode(await database(), ctx.user.id);
  }),
  verifyEmailOtp: protectedProcedure.input(codeSchema).mutation(({ ctx, input }) => verifyCode(ctx.user.id, "email", input.code)),
  requestEmailChange: protectedProcedure.input(challengeOptions.extend({
    email: accountEmailSchema, currentPassword: z.string().min(1).max(1024),
  })).mutation(async ({ ctx, input }) => {
    const db = await database();
    await enforceAuthRateLimit(db, "email_change", String(ctx.user.id), 5, 60 * 60_000);
    await challengeCheck(ctx.req, input.turnstileToken, "email_otp");
    const [user] = await db.select().from(users).where(eq(users.id, ctx.user.id));
    if (!user.passwordHash || !await verifyPassword(input.currentPassword, user.passwordHash)) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Current password is incorrect." });
    }
    if (input.email === user.email) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a different email address." });
    return issueEmailCode(db, ctx.user.id, input.email, user.passwordHash);
  }),
  verifyEmailChange: protectedProcedure.input(codeSchema).mutation(async ({ ctx, input }) => {
    try {
      const result = await verifyCode(ctx.user.id, "email", input.code, true);
      clearAuthCookie(ctx.res);
      return result;
    } catch (error) {
      if (isDuplicateEmailError(error)) throw new TRPCError({ code: "CONFLICT", message: "That email cannot be used. Choose another address." });
      throw error;
    }
  }),
  requestPhoneOtp: protectedProcedure.input(z.object({ phone: z.string().max(32), countryCode: phoneCountrySchema.optional() })).mutation(async ({ ctx, input }) => {
    const db = await database();
    await enforceAuthRateLimit(db, "phone_otp", String(ctx.user.id), 6, 60 * 60_000);
    const phone = vendorPhone(input.phone, input.countryCode);
    const country = phone && parsePhoneNumberFromString(phone)?.country;
    if (!phone || !country) throw new TRPCError({ code: "BAD_REQUEST", message: "Use a valid phone number matching the selected country and international calling code." });
    await requireEnabledPhoneCountry(country);
    return db.transaction(async tx => {
      const user = await lockUser(tx, ctx.user.id);
      if (!user.emailVerifiedAt) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Verify your email first." });
      const now = new Date();
      const [recent] = await tx.select().from(verificationChallenges).where(and(
        eq(verificationChallenges.userId, user.id), eq(verificationChallenges.channel, "phone"),
        isNull(verificationChallenges.consumedAt), gt(verificationChallenges.expiresAt, now)
      )).limit(1);
      if (recent) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "An SMS code is still active. Wait until it expires before resending." });
      const code = generateOtp();
      const provider = process.env.SMS_PROVIDER || "twilio";
      if (provider !== "sendpulse" && provider !== "twilio") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "SMS provider configuration is invalid. Contact support." });
      if (provider === "twilio" ? !isTwilioVerifyConfigured() :
        !process.env.SENDPULSE_CLIENT_ID || !process.env.SENDPULSE_CLIENT_SECRET || !process.env.SENDPULSE_SMS_SENDER) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "SMS verification is not configured. Contact support." });
      }
      await tx.update(verificationChallenges).set({ consumedAt: now }).where(and(
        eq(verificationChallenges.userId, user.id), eq(verificationChallenges.channel, "phone"), isNull(verificationChallenges.consumedAt)
      ));
      const expiresAt = new Date(Math.floor(Date.now() / 1000) * 1000 + OTP_TTL_MS);
      await tx.insert(verificationChallenges).values({
        userId: user.id, channel: "phone", purpose: "phone_ownership", provider,
        targetHash: hashVerificationTarget(phone), codeCiphertext: encryptOtp(code),
        expiresAt,
      });
      await providerRequest("SMS delivery", async () => {
        if (provider === "sendpulse") await new SendPulseTransactionalEmailAdapter().sendSms(phone, code);
        else await startPhoneVerification(phone);
      });
      await tx.update(users).set({ phone, phoneVerifiedAt: null }).where(eq(users.id, user.id));
      return { verified: false, destination: maskContact("phone", phone), expiresInSeconds: OTP_TTL_MS / 1000, expiresAt };
    });
  }),
  verifyPhoneOtp: protectedProcedure.input(codeSchema).mutation(({ ctx, input }) => verifyCode(ctx.user.id, "phone", input.code)),
  requestPasswordReset: publicProcedure.input(challengeOptions.extend({ email: accountEmailSchema })).mutation(async ({ ctx, input }) => {
    const db = await database();
    await enforceAuthRateLimit(db, "reset_ip", getRequestIp(ctx.req), 10, 60 * 60_000);
    await enforceAuthRateLimit(db, "reset_email", input.email, 3, 60 * 60_000);
    await challengeCheck(ctx.req, input.turnstileToken, "password_reset");
    await queuePasswordReset(db, input.email);
    return { message: "If an eligible account exists, a password-reset email has been queued. If it does not arrive, retry or contact support." };
  }),
  resetPassword: publicProcedure.input(z.object({
    token: z.string().regex(/^[a-f0-9]{64}$/), password: newPasswordSchema,
  })).mutation(async ({ ctx, input }) => {
    const db = await database();
    await enforceAuthRateLimit(db, "reset_complete", getRequestIp(ctx.req), 10, 15 * 60_000);
    const tokenHash = createHash("sha256").update(input.token).digest("hex");
    const [token] = await db.select().from(accountResetTokens).where(eq(accountResetTokens.tokenHash, tokenHash));
    if (!token) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or expired reset link. Request a new one." });
    const passwordHash = await hashPassword(input.password);
    await db.transaction(async tx => {
      await lockUser(tx, token.userId);
      const [current] = await tx.select().from(accountResetTokens).where(eq(accountResetTokens.tokenHash, tokenHash)).for("update");
      if (!current || isOtpExpired(current.expiresAt)) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or expired reset link. Request a new one." });
      await tx.update(users).set({ passwordHash }).where(eq(users.id, token.userId));
      await tx.delete(accountResetTokens).where(eq(accountResetTokens.userId, token.userId));
      await tx.delete(authSessions).where(eq(authSessions.userId, token.userId));
      await tx.update(verificationChallenges).set({ consumedAt: new Date() }).where(and(
        eq(verificationChallenges.userId, token.userId), isNull(verificationChallenges.consumedAt)
      ));
    });
    clearAuthCookie(ctx.res);
    return { success: true };
  }),
  onboardingStatus: protectedProcedure.query(async ({ ctx }) => {
    const db = await database();
    const [row] = await db.select().from(accountOnboarding).where(eq(accountOnboarding.userId, ctx.user.id));
    const [session] = row?.kycSessionId ? await db.select().from(vendorVerificationSessions)
      .where(eq(vendorVerificationSessions.id, row.kycSessionId)) : [];
    return {
      details: row ? readIdentity(row.identityCiphertext) : null,
      kycVerified: Boolean(row?.kycVerifiedAt && session?.status === "approved" && session.expiresAt && session.expiresAt > new Date()),
      kycStatus: session?.status ?? "not_started",
      verificationUrl: row?.verificationUrl ?? null,
      completed: Boolean(row?.completedAt),
    };
  }),
  saveVendorIdentity: protectedProcedure.input(personalDetailsSchema.extend({
    consentGiven: z.literal(true), termsAccepted: z.literal(true),
  })).mutation(async ({ ctx, input }) => {
    const db = await database();
    await enforceAuthRateLimit(db, "vendor_identity", String(ctx.user.id), 10, 60 * 60_000);
    if (!isAdult(input.dateOfBirth)) throw new TRPCError({ code: "BAD_REQUEST", message: "Vendors must be at least 18 years old and provide a valid date of birth." });
    await db.transaction(async tx => {
      const user = await lockUser(tx, ctx.user.id);
      if (!user.emailVerifiedAt || !user.phoneVerifiedAt || !vendorPhone(user.phone || "")) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Verify email and a supported phone number first." });
      }
      const [old] = await tx.select().from(accountOnboarding).where(eq(accountOnboarding.userId, user.id));
      if (old?.completedAt) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Contact support to change verified identity details." });
      const details = personalDetailsSchema.parse(input);
      if (!old || readIdentity(old.identityCiphertext).countryCode !== details.countryCode) {
        await requireEnabledPhoneCountry(details.countryCode, "Identity verification");
      }
      const unchanged = old && JSON.stringify(readIdentity(old.identityCiphertext)) === JSON.stringify(details);
      const values = { identityCiphertext: encryptOtp(JSON.stringify(details)), countryCode: details.countryCode,
        ...(!unchanged ? { kycSessionId: null, kycVerifiedAt: null, verificationUrl: null } : {}) };
      await tx.insert(accountOnboarding).values({ userId: user.id, ...values }).onDuplicateKeyUpdate({ set: values });
      await tx.update(users).set({
        firstName: input.firstName, lastName: input.lastName, name: `${input.firstName} ${input.lastName}`,
        signupIntent: "vendor", termsAcceptedAt: new Date(), termsVersion: TERMS_VERSION,
      }).where(eq(users.id, user.id));
      const [profile] = await tx.select().from(vendorProfiles).where(eq(vendorProfiles.userId, user.id));
      if (!profile) await tx.insert(vendorProfiles).values({ userId: user.id, businessName: "Storefront setup", approvalStatus: "pending" });
    });
    return { success: true };
  }),
  startVendorKyc: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await database();
    await enforceAuthRateLimit(db, "start_kyc", String(ctx.user.id), 4, 60 * 60_000);
    const adapter = new DiditVerificationAdapter();
    if (!adapter.isConfigured() || !ENV.diditWebhookSecret) throw new TRPCError({
      code: "PRECONDITION_FAILED", message: "Didit verification is not configured. Contact support.",
    });
    return db.transaction(async tx => {
      const user = await lockUser(tx, ctx.user.id);
      const [row] = await tx.select().from(accountOnboarding).where(eq(accountOnboarding.userId, user.id)).for("update");
      if (!row || !user.emailVerifiedAt || !user.phoneVerifiedAt) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Complete contact verification and personal details first." });
      const details = readIdentity(row.identityCiphertext);
      if (!isAdult(details.dateOfBirth)) throw new TRPCError({ code: "BAD_REQUEST", message: "Adult eligibility is required." });
      if (row.kycSessionId && row.verificationUrl) {
        const [session] = await tx.select().from(vendorVerificationSessions).where(eq(vendorVerificationSessions.id, row.kycSessionId));
        if (session?.expiresAt && session.expiresAt > new Date() && ["created", "submitted", "in_review", "approved"].includes(session.status)) {
          return { verificationUrl: row.verificationUrl };
        }
      }
      const [profile] = await tx.select().from(vendorProfiles).where(eq(vendorProfiles.userId, user.id));
      if (!profile) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Save personal details first." });
      const result = await providerRequest("Identity verification", () => adapter.createSession({
        vendorId: profile.id, userId: user.id, sessionType: "identity_document", countryCode: row.countryCode,
        firstName: details.firstName, lastName: details.lastName, dateOfBirth: details.dateOfBirth,
        callbackPath: "/vendor/onboarding",
      }));
      const [session] = await tx.insert(vendorVerificationSessions).values({
        vendorId: profile.id, userId: user.id, provider: "didit", providerSessionId: result.providerSessionId,
        sessionType: "identity_document", countryCode: row.countryCode, consentGivenAt: new Date(),
        expiresAt: result.expiresAt, status: "created",
      });
      await tx.update(accountOnboarding).set({ kycSessionId: session.insertId, verificationUrl: result.verificationUrl, kycVerifiedAt: null }).where(eq(accountOnboarding.userId, user.id));
      return { verificationUrl: result.verificationUrl! };
    });
  }),
  uploadAvatar: protectedProcedure.input(z.object({
    fileBase64: z.string().max(3_000_000),
  })).mutation(async ({ ctx, input }) => {
    const db = await database();
    await enforceAuthRateLimit(db, "avatar", String(ctx.user.id), 20, 60 * 60_000);
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.fileBase64)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid image encoding." });
    }
    const buffer = Buffer.from(input.fileBase64, "base64");
    if (!buffer.length || buffer.length > 2 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "Avatar must be 2 MB or smaller." });
    let output: Buffer;
    try {
      const image = sharp(buffer, { limitInputPixels: 16_000_000, animated: false });
      const metadata = await image.metadata();
      if (!["jpeg", "png", "webp"].includes(metadata.format || "") || (metadata.pages ?? 1) > 1) throw new Error("Unsupported image");
      output = await image.rotate().resize(256, 256, { fit: "cover" }).webp({ quality: 85 }).toBuffer();
    } catch {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Use a valid, non-animated JPEG, PNG or WebP image under 16 megapixels." });
    }
    const key = `public/avatars/${ctx.user.id}/${randomUUID()}.webp`;
    const uploaded = await storagePut(key, output, "image/webp");
    let oldUrl: string | null = null;
    try {
      await db.transaction(async tx => {
        const user = await lockUser(tx, ctx.user.id);
        oldUrl = user.avatarUrl;
        await tx.update(users).set({ avatarUrl: uploaded.url }).where(eq(users.id, user.id));
      });
    } catch (error) {
      try { await storageDelete(key); } catch (cleanupError) { console.error("[Avatar] Upload rollback cleanup failed", cleanupError); }
      throw error;
    }
    await removeOwnedAvatar(oldUrl, ctx.user.id);
    return { avatarUrl: uploaded.url };
  }),
};

export async function removeOwnedAvatar(url: string | null, userId: number) {
  if (!url) return;
  const match = url.match(/(?:^|\/media\/)(public\/avatars\/\d+\/[a-f0-9-]+\.webp)$/);
  if (match?.[1].startsWith(`public/avatars/${userId}/`)) {
    try { await storageDelete(match[1]); }
    catch (error) { console.error("[Avatar] Replaced object cleanup failed", error); }
  }
}
