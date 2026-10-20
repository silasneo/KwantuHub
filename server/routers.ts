import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  getAllVendors,
  getAllListingsForAdmin,
  getAllDisputesForAdmin,
  getAllUsersForAdmin,
  getCategories,
  getFeatureFlags,
  getDb,
  getListingBySlug,
  getViewHistory,
  removeViewHistoryItem,
  clearViewHistory,
  getBuyerReviews,
  getListingReviews,
  getRelatedListings,
  getStorefrontBySlug,
  getUserByEmail,
  getPublicVendorContacts,
  getVendorProfileByUserId,
  getVendorReviews,
  recordAnalyticsEvent,
  searchListings,
  toPublicVendorProfile,
} from "./db";
import { getAdminFunnelAnalytics, getVendorFunnelAnalytics, resolveAnalyticsScope } from "./analytics";
import { getVendorTrustSignals, getVendorVerificationBadges } from "./vendorTrust";
import {
  analyticsEvents,
  categories,
  inquiries,
  listingMedia,
  listings,
  messages,
  moderationRecords,
  reviews,
  storefronts,
  systemSettings,
  users,
  vendorProfiles,
  disputes,
  conversationReports,
  wishlists,
  notificationPreferences,
  notifications,
  notificationDeliveries,
  notificationOutbox,
  notificationSuppressions,
  notificationWebhookEvents,
  vendorVerificationEvidence,
  vendorVerificationSessions,
  savedSearches,
  savedSearchMatches,
  inquiryLeadHistory,
  verificationChallenges,
} from "../drizzle/schema";
import { and, desc, eq, gt, gte, inArray, isNull, lt, lte, ne, sql } from "drizzle-orm";
import {
  clearAuthCookie,
  hashPassword,
  publicUser,
  setAuthCookie,
  signToken,
  verifyPassword,
} from "./jwtAuth";
import {
  countUnreadMessages,
  getConversationMetrics,
  getConversationState,
  isInquiryOpen,
} from "./inquiryWorkflow";
import {
  enqueueNotificationEvent,
  getOrCreateNotificationPreferences,
} from "./notificationWorker";
import {
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_TTL_MS,
  decryptOtp,
  encryptOtp,
  generateOtp,
  hashOtp,
  hashVerificationTarget,
  isOtpExpired,
  maskContact,
  normalizeEmail,
  normalizePhone,
} from "./contactVerification";
import { getRequestIp, recordAbuseSignal, verifyTurnstile } from "./abuseProtection";
import { checkPhoneVerification, startPhoneVerification } from "./twilioVerify";
import {
  deriveVendorBadges,
  isNorthAmericaCountry,
  sanitizeEvidenceSummary,
} from "./vendorVerification";
import {
  canTransitionLead,
  computeLeadFunnel,
  type LeadStage,
} from "./leadWorkflow";
import {
  evaluateListingQuality,
  evaluateReviewIntegrity,
} from "./listingQuality";
import { matchesSavedSearch } from "./savedSearchMatcher";
import { processListingSavedSearchMatches } from "./savedSearchService";
import { selectVerificationAdapter } from "./vendorVerificationAdapters";

const contactRevealAttempts = new Map<string, number[]>();
const CONTACT_REVEAL_WINDOW_MS = 60_000;
const CONTACT_REVEAL_LIMIT = 5;
const INQUIRY_CREATE_WINDOW_MS = 10 * 60_000;
const INQUIRY_CREATE_LIMIT = 8;
const INQUIRY_DUPLICATE_COOLDOWN_MS = 24 * 60 * 60_000;
const inquiryCreateAttempts = new Map<number, number[]>();

function allowContactReveal(key: string) {
  const now = Date.now();
  const recent = (contactRevealAttempts.get(key) || []).filter(
    timestamp => now - timestamp < CONTACT_REVEAL_WINDOW_MS
  );
  if (recent.length >= CONTACT_REVEAL_LIMIT) return false;
  recent.push(now);
  contactRevealAttempts.set(key, recent);
  return true;
}

function allowInquiryCreate(userId: number) {
  const now = Date.now();
  const recent = (inquiryCreateAttempts.get(userId) || []).filter(
    timestamp => now - timestamp < INQUIRY_CREATE_WINDOW_MS
  );
  if (recent.length >= INQUIRY_CREATE_LIMIT) return false;
  recent.push(now);
  inquiryCreateAttempts.set(userId, recent);
  return true;
}

async function requireTurnstile(
  db: Awaited<ReturnType<typeof getDb>>,
  req: Parameters<typeof getRequestIp>[0],
  userId: number | null,
  token: string | undefined,
  action: string
) {
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  const result = await verifyTurnstile(token, {
    action,
    remoteIp: getRequestIp(req),
  });
  if (!result.success) {
    await recordAbuseSignal(db, {
      userId,
      signalType: "turnstile_failed",
      ip: getRequestIp(req),
      metadata: { action, codes: result.codes || [] },
    });
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Please complete the human verification challenge and try again.",
    });
  }
}

async function requireVerifiedContacts(
  db: Awaited<ReturnType<typeof getDb>>,
  userId: number,
  options: { email?: boolean; phone?: boolean }
) {
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  const [user] = await db
    .select({ email: users.email, phone: users.phone, emailVerifiedAt: users.emailVerifiedAt, phoneVerifiedAt: users.phoneVerifiedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Account not found" });
  if (options.email && (!user.email || !user.emailVerifiedAt)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Verify your email address before continuing." });
  }
  if (options.phone && (!user.phone || !user.phoneVerifiedAt)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Verify your phone number before continuing." });
  }
  return user;
}

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(async ({ ctx }) => {
      if (!ctx.user) return null;
      const vendorProfile = await getVendorProfileByUserId(ctx.user.id);
      return {
        ...publicUser(ctx.user),
        vendorProfile: vendorProfile || null,
      };
    }),

    // Scoped JWT Login per SOW
    login: publicProcedure
      .input(
        z.object({
          email: z.string().email(),
          password: z.string().min(6),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const user = await getUserByEmail(input.email);
        if (!user || !user.passwordHash) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid email or password",
          });
        }

        const valid = await verifyPassword(input.password, user.passwordHash);
        if (!valid) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid email or password",
          });
        }

        const token = await signToken({
          userId: user.id,
          email: user.email!,
          role: user.role,
        });

        setAuthCookie(ctx.res, token);

        const vendorProfile = await getVendorProfileByUserId(user.id);
        return {
          user: {
            ...publicUser(user),
            vendorProfile: vendorProfile || null,
          },
        };
      }),

    // Scoped JWT Registration per SOW
    register: publicProcedure
      .input(
        z.object({
          name: z.string().min(2),
          email: z.string().email(),
          password: z.string().min(6),
          role: z.enum(["buyer", "vendor"]).default("buyer"),
          turnstileToken: z.string().max(2048).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await requireTurnstile(db, ctx.req, null, input.turnstileToken, "register");

        const existing = await getUserByEmail(input.email);
        if (existing) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "An account with this email already exists",
          });
        }

        const passwordHash = await hashPassword(input.password);
        const openId = `jwt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const avatarUrl = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
          input.name
        )}&backgroundColor=0a0a0a,d71466,fe8129`;

        const [res] = await db.insert(users).values({
          openId,
          name: input.name,
          email: input.email,
          passwordHash,
          avatarUrl,
          role: input.role,
          status: "active",
        });

        const token = await signToken({
          userId: res.insertId,
          email: input.email,
          role: input.role,
        });

        setAuthCookie(ctx.res, token);

        const newUser = await db
          .select()
          .from(users)
          .where(eq(users.id, res.insertId))
          .limit(1);
        return {
          user: {
            ...publicUser(newUser[0]),
            vendorProfile: null,
          },
        };
      }),

    updateProfile: protectedProcedure
      .input(
        z.object({
          name: z.string().min(2).optional(),
          avatarUrl: z.string().url().optional(),
          notificationPreferences: z
            .object({
              emailInquiries: z.boolean().optional(),
              emailReplies: z.boolean().optional(),
              productUpdates: z.boolean().optional(),
            })
            .optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await db
          .update(users)
          .set({
            ...(input.name ? { name: input.name } : {}),
            ...(input.avatarUrl ? { avatarUrl: input.avatarUrl } : {}),
            ...(input.notificationPreferences
              ? { notificationPreferences: input.notificationPreferences }
              : {}),
            updatedAt: new Date(),
          })
          .where(eq(users.id, ctx.user.id));

        const updated = await db
          .select()
          .from(users)
          .where(eq(users.id, ctx.user.id))
          .limit(1);
        return updated[0] ? publicUser(updated[0]) : null;
      }),

    logout: publicProcedure.mutation(({ ctx }) => {
      // Clear JWT cookie
      clearAuthCookie(ctx.res);

      return { success: true } as const;
    }),

    changePassword: protectedProcedure
      .input(
        z.object({
          currentPassword: z.string().min(6),
          newPassword: z.string().min(8),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        const user = await getUserByEmail(ctx.user.email || "");
        if (!db || !user?.passwordHash) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Password unavailable",
          });
        }
        if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Current password is incorrect",
          });
        }
        await db
          .update(users)
          .set({
            passwordHash: await hashPassword(input.newPassword),
            updatedAt: new Date(),
          })
          .where(eq(users.id, ctx.user.id));
        return { success: true };
      }),

    contactStatus: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      const user = await requireVerifiedContacts(db, ctx.user.id, {});
      return {
        email: {
          value: user.email,
          verified: Boolean(user.email && user.emailVerifiedAt),
        },
        phone: {
          value: user.phone ? maskContact("phone", user.phone) : null,
          verified: Boolean(user.phone && user.phoneVerifiedAt),
        },
      };
    }),

    requestEmailOtp: protectedProcedure
      .input(z.object({ turnstileToken: z.string().max(2048).optional() }).optional())
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        await requireTurnstile(db, ctx.req, ctx.user.id, input?.turnstileToken, "email_otp");
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const [user] = await db!
          .select({ id: users.id, email: users.email, emailVerifiedAt: users.emailVerifiedAt })
          .from(users)
          .where(eq(users.id, ctx.user.id))
          .limit(1);
        if (!user?.email) throw new TRPCError({ code: "BAD_REQUEST", message: "Add an email address first." });
        if (user.emailVerifiedAt) return { verified: true, destination: maskContact("email", user.email) };
        const now = new Date();
        const [recent] = await db
          .select({ lastSentAt: verificationChallenges.lastSentAt })
          .from(verificationChallenges)
          .where(
            and(
              eq(verificationChallenges.userId, ctx.user.id),
              eq(verificationChallenges.channel, "email"),
              isNull(verificationChallenges.consumedAt),
              gt(verificationChallenges.lastSentAt, new Date(now.getTime() - OTP_RESEND_COOLDOWN_MS))
            )
          )
          .orderBy(desc(verificationChallenges.createdAt))
          .limit(1);
        if (recent) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Wait a moment before requesting another code." });
        const code = generateOtp();
        const target = normalizeEmail(user.email);
        const [created] = await db.insert(verificationChallenges).values({
          userId: ctx.user.id,
          channel: "email",
          purpose: "email_ownership",
          targetHash: hashVerificationTarget(target),
          codeCiphertext: encryptOtp(code),
          attempts: 0,
          maxAttempts: OTP_MAX_ATTEMPTS,
          lastSentAt: now,
          expiresAt: new Date(now.getTime() + OTP_TTL_MS),
        });
        await enqueueNotificationEvent(db, {
          eventType: "CONTACT_VERIFICATION_OTP",
          idempotencyKey: `contact_otp:${created.insertId}`,
          recipientUserId: ctx.user.id,
          entityType: "verification_challenge",
          entityId: created.insertId,
          payload: { challengeId: created.insertId },
        });
        return { verified: false, destination: maskContact("email", user.email), expiresInSeconds: OTP_TTL_MS / 1000 };
      }),

    verifyEmailOtp: protectedProcedure
      .input(z.object({ code: z.string().regex(/^\d{6}$/) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const [challenge] = await db
          .select()
          .from(verificationChallenges)
          .where(
            and(
              eq(verificationChallenges.userId, ctx.user.id),
              eq(verificationChallenges.channel, "email"),
              eq(verificationChallenges.purpose, "email_ownership"),
              isNull(verificationChallenges.consumedAt)
            )
          )
          .orderBy(desc(verificationChallenges.createdAt))
          .limit(1);
        if (!challenge || isOtpExpired(challenge.expiresAt) || challenge.attempts >= challenge.maxAttempts) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This email code has expired. Request a new code." });
        }
        const valid = hashOtp("email_ownership", input.code) === hashOtp("email_ownership", (() => {
          try { return decryptOtp(challenge.codeCiphertext); } catch { return "invalid"; }
        })());
        if (!valid) {
          await db.update(verificationChallenges).set({ attempts: challenge.attempts + 1, updatedAt: new Date() }).where(eq(verificationChallenges.id, challenge.id));
          await recordAbuseSignal(db, { userId: ctx.user.id, signalType: "otp_failed", ip: getRequestIp(ctx.req), metadata: { channel: "email" } });
          throw new TRPCError({ code: "BAD_REQUEST", message: "Incorrect verification code." });
        }
        const verifiedAt = new Date();
        await db.update(verificationChallenges).set({ consumedAt: verifiedAt, updatedAt: verifiedAt }).where(eq(verificationChallenges.id, challenge.id));
        await db.update(users).set({ emailVerifiedAt: verifiedAt, updatedAt: verifiedAt }).where(eq(users.id, ctx.user.id));
        return { verified: true };
      }),

    requestPhoneOtp: protectedProcedure
      .input(z.object({ phone: z.string().min(10).max(30), turnstileToken: z.string().max(2048).optional() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        await requireTurnstile(db, ctx.req, ctx.user.id, input.turnstileToken, "phone_otp");
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const phone = normalizePhone(input.phone);
        if (!phone) throw new TRPCError({ code: "BAD_REQUEST", message: "Use an international phone number, for example +1 713 555 0148." });
        const now = new Date();
        const [recent] = await db!
          .select({ lastSentAt: verificationChallenges.lastSentAt })
          .from(verificationChallenges)
          .where(and(eq(verificationChallenges.userId, ctx.user.id), eq(verificationChallenges.channel, "phone"), isNull(verificationChallenges.consumedAt), gt(verificationChallenges.lastSentAt, new Date(now.getTime() - OTP_RESEND_COOLDOWN_MS))))
          .orderBy(desc(verificationChallenges.createdAt))
          .limit(1);
        if (recent) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Wait a moment before requesting another code." });
        try {
          await startPhoneVerification(phone);
        } catch (error) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: error instanceof Error ? error.message : "Phone verification is unavailable." });
        }
        await db!.update(users).set({ phone, phoneVerifiedAt: null, updatedAt: now }).where(eq(users.id, ctx.user.id));
        const [created] = await db!.insert(verificationChallenges).values({
          userId: ctx.user.id,
          channel: "phone",
          purpose: "phone_ownership",
          targetHash: hashVerificationTarget(phone),
          codeCiphertext: encryptOtp(generateOtp()),
          attempts: 0,
          maxAttempts: OTP_MAX_ATTEMPTS,
          lastSentAt: now,
          expiresAt: new Date(now.getTime() + OTP_TTL_MS),
        });
        return { verified: false, destination: maskContact("phone", phone), challengeId: created.insertId, expiresInSeconds: OTP_TTL_MS / 1000 };
      }),

    verifyPhoneOtp: protectedProcedure
      .input(z.object({ code: z.string().regex(/^\d{6}$/) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const [challenge] = await db.select().from(verificationChallenges).where(and(eq(verificationChallenges.userId, ctx.user.id), eq(verificationChallenges.channel, "phone"), eq(verificationChallenges.purpose, "phone_ownership"), isNull(verificationChallenges.consumedAt))).orderBy(desc(verificationChallenges.createdAt)).limit(1);
        if (!challenge || isOtpExpired(challenge.expiresAt) || challenge.attempts >= challenge.maxAttempts) throw new TRPCError({ code: "BAD_REQUEST", message: "This phone code has expired. Request a new code." });
        const [user] = await db.select({ phone: users.phone }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
        if (!user?.phone) throw new TRPCError({ code: "BAD_REQUEST", message: "Phone number is missing." });
        let approved = false;
        try {
          const result = await checkPhoneVerification(user.phone, input.code);
          approved = result.status === "approved";
        } catch {
          approved = false;
        }
        if (!approved) {
          await db.update(verificationChallenges).set({ attempts: challenge.attempts + 1, updatedAt: new Date() }).where(eq(verificationChallenges.id, challenge.id));
          await recordAbuseSignal(db, { userId: ctx.user.id, signalType: "otp_failed", ip: getRequestIp(ctx.req), metadata: { channel: "phone" } });
          throw new TRPCError({ code: "BAD_REQUEST", message: "Incorrect verification code." });
        }
        const verifiedAt = new Date();
        await db.update(verificationChallenges).set({ consumedAt: verifiedAt, updatedAt: verifiedAt }).where(eq(verificationChallenges.id, challenge.id));
        await db.update(users).set({ phoneVerifiedAt: verifiedAt, updatedAt: verifiedAt }).where(eq(users.id, ctx.user.id));
        return { verified: true };
      }),
  }),

  notifications: router({
    list: protectedProcedure
      .input(
        z.object({
          unreadOnly: z.boolean().default(false),
          limit: z.number().int().min(1).max(50).default(20),
          cursor: z.number().int().positive().optional(),
          notificationType: z.string().max(80).optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return { items: [], unreadCount: 0 };
        const filters = [eq(notifications.recipientUserId, ctx.user.id)];
        if (input.unreadOnly) filters.push(isNull(notifications.readAt));
        if (input.cursor) filters.push(lt(notifications.id, input.cursor));
        if (input.notificationType) {
          filters.push(eq(notifications.notificationType, input.notificationType as typeof notifications.notificationType.enumValues[number]));
        }
        const items = await db
          .select()
          .from(notifications)
          .where(and(...filters))
          .orderBy(desc(notifications.createdAt))
          .limit(input.limit);
        const [countRow] = await db
          .select({ count: sql<number>`count(*)` })
          .from(notifications)
          .where(
            and(
              eq(notifications.recipientUserId, ctx.user.id),
              isNull(notifications.readAt)
            )
          );
        return {
          items,
          unreadCount: Number(countRow?.count || 0),
          nextCursor: items.length === input.limit ? items[items.length - 1]?.id ?? null : null,
        };
      }),

    unreadCount: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return { unreadCount: 0 };
      const [countRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(notifications)
        .where(
          and(
            eq(notifications.recipientUserId, ctx.user.id),
            isNull(notifications.readAt)
          )
        );
      return { unreadCount: Number(countRow?.count || 0) };
    }),

    markRead: protectedProcedure
      .input(z.object({ notificationId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const [updated] = await db
          .update(notifications)
          .set({ readAt: new Date() })
          .where(
            and(
              eq(notifications.id, input.notificationId),
              eq(notifications.recipientUserId, ctx.user.id)
            )
          );
        if (!updated || updated.affectedRows === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Notification not found" });
        }
        return { success: true };
      }),

    markAllRead: protectedProcedure
      .input(z.object({ notificationType: z.string().max(80).optional() }).optional())
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const filters = [
          eq(notifications.recipientUserId, ctx.user.id),
          isNull(notifications.readAt),
        ];
        if (input?.notificationType) {
          filters.push(eq(notifications.notificationType, input.notificationType as typeof notifications.notificationType.enumValues[number]));
        }
        const [updated] = await db
          .update(notifications)
          .set({ readAt: new Date() })
          .where(and(...filters));
        return { updated: updated?.affectedRows || 0 };
      }),

    getPreferences: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return getOrCreateNotificationPreferences(db, ctx.user.id);
    }),

    updatePreferences: protectedProcedure
      .input(
        z.object({
          inAppEnabled: z.boolean().optional(),
          emailInquiries: z.boolean().optional(),
          emailReplies: z.boolean().optional(),
          emailResolutions: z.boolean().optional(),
          emailAccount: z.boolean().optional(),
          quietHoursStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
          quietHoursEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
          timezone: z.string().min(1).max(64).nullable().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await getOrCreateNotificationPreferences(db, ctx.user.id);
        await db
          .update(notificationPreferences)
          .set({ ...input, updatedAt: new Date() })
          .where(eq(notificationPreferences.userId, ctx.user.id));
        return getOrCreateNotificationPreferences(db, ctx.user.id);
      }),
  }),

  categories: router({
    list: publicProcedure.query(async () => {
      return getCategories();
    }),
  }),

  vendors: router({
    list: publicProcedure.query(async () => {
      const vendors = await getAllVendors();
      return Promise.all(vendors.map(async vendor => ({
        ...vendor,
        trust: await getVendorTrustSignals(vendor.id),
        badges: await getVendorVerificationBadges(vendor.id),
      })));
    }),
  }),

  marketplace: router({
    megaMenu: publicProcedure.query(async () => {
      const flags = await getFeatureFlags();
      const enabled = flags.some(
        flag => flag.settingKey === "mega_menu_enabled" && flag.booleanValue
      );
      return { enabled, categories: enabled ? await getCategories() : [] };
    }),

    search: publicProcedure
      .input(
        z.object({
          q: z.string().optional(),
          category: z.string().optional(),
          type: z.enum(["product", "service"]).optional(),
          location: z.string().optional(),
          price: z.string().optional(),
          minPrice: z.number().nonnegative().optional(),
          maxPrice: z.number().nonnegative().optional(),
          remote: z.boolean().optional(),
          verified: z.boolean().optional(),
          sort: z.enum(["newest", "oldest", "title"]).optional(),
          page: z.number().int().min(1).default(1),
          pageSize: z.number().int().min(1).max(48).default(12),
        })
      )
      .query(async ({ input }) => {
        return searchListings(input);
      }),

    getListing: publicProcedure
      .input(z.object({ slug: z.string() }))
      .query(async ({ ctx, input }) => {
        const item = await getListingBySlug(input.slug, ctx.user?.id);
        if (!item)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Listing not found",
          });
        return item;
      }),

    reviews: publicProcedure
      .input(z.object({ listingId: z.number().int().positive() }))
      .query(async ({ input }) => getListingReviews(input.listingId)),

    revealContact: protectedProcedure
      .input(
        z.object({
          listingId: z.number().int().positive(),
          turnstileToken: z.string().max(2048).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const forwarded = ctx.req.headers["x-forwarded-for"];
        const ip =
          (typeof forwarded === "string"
            ? forwarded.split(",")[0]
            : undefined) ||
          ctx.req.ip ||
          "unknown";
        if (!allowContactReveal(`${ip}:${input.listingId}`)) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Please wait before revealing another contact record.",
          });
        }

        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await requireVerifiedContacts(db, ctx.user.id, { email: true, phone: true });
        await requireTurnstile(db, ctx.req, ctx.user.id, input.turnstileToken, "reveal_contact");
        const [listing] = await db
          .select({ id: listings.id, vendorId: listings.vendorId })
          .from(listings)
          .innerJoin(vendorProfiles, eq(listings.vendorId, vendorProfiles.id))
          .where(
            and(
              eq(listings.id, input.listingId),
              eq(listings.status, "published")
            )
          )
          .limit(1);
        if (!listing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Listing not found",
          });
        }

        const contacts = await getPublicVendorContacts(listing.vendorId);
        await recordAnalyticsEvent({
          eventType: "reveal_contact",
          userId: ctx.user.id,
          vendorId: listing.vendorId,
          listingId: listing.id,
        });
        return {
          channels: contacts
            ? Object.entries(contacts)
                .filter(([, value]) => Boolean(value))
                .map(([type, value]) => ({ type, value }))
            : [],
        };
      }),

    getRelated: publicProcedure
      .input(
        z.object({
          listingId: z.number(),
          categoryId: z.number(),
          limit: z.number().optional().default(4),
        })
      )
      .query(async ({ input }) => {
        return getRelatedListings(
          input.listingId,
          input.categoryId,
          input.limit
        );
      }),
    getStorefront: publicProcedure
      .input(z.object({ slug: z.string() }))
      .query(async ({ input }) => {
        const item = await getStorefrontBySlug(input.slug);
        if (!item)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Storefront not found",
          });
        return {
          ...item,
          trust: item.vendor ? await getVendorTrustSignals(item.vendor.id) : null,
          badges: item.vendor ? await getVendorVerificationBadges(item.vendor.id) : null,
        };
      }),
  }),

  buyer: router({
    wishlist: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select({
          wishlist: wishlists,
          listing: listings,
        })
        .from(wishlists)
        .innerJoin(listings, eq(wishlists.listingId, listings.id))
        .where(eq(wishlists.buyerId, ctx.user.id))
        .orderBy(desc(wishlists.createdAt));
    }),

    toggleWishlist: protectedProcedure
      .input(z.object({ listingId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const existing = await db
          .select()
          .from(wishlists)
          .where(
            and(
              eq(wishlists.buyerId, ctx.user.id),
              eq(wishlists.listingId, input.listingId)
            )
          )
          .limit(1);

        if (existing.length > 0) {
          await db
            .delete(wishlists)
            .where(
              and(
                eq(wishlists.buyerId, ctx.user.id),
                eq(wishlists.listingId, input.listingId)
              )
            );
          return { saved: false };
        } else {
          await db.insert(wishlists).values({
            buyerId: ctx.user.id,
            listingId: input.listingId,
          });
          const [listing] = await db
            .select({ vendorId: listings.vendorId })
            .from(listings)
            .where(eq(listings.id, input.listingId))
            .limit(1);
          await recordAnalyticsEvent({
            eventType: "save_listing",
            userId: ctx.user.id,
            vendorId: listing?.vendorId,
            listingId: input.listingId,
          });
          return { saved: true };
        }
      }),

    viewHistory: protectedProcedure.query(async ({ ctx }) =>
      getViewHistory(ctx.user.id)
    ),

    removeViewHistory: protectedProcedure
      .input(z.object({ listingId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        await removeViewHistoryItem(ctx.user.id, input.listingId);
        return { success: true };
      }),

    clearViewHistory: protectedProcedure.mutation(async ({ ctx }) => {
      await clearViewHistory(ctx.user.id);
      return { success: true };
    }),

    reviews: protectedProcedure.query(async ({ ctx }) => getBuyerReviews(ctx.user.id)),

    submitReview: protectedProcedure
      .input(
        z.object({
          listingId: z.number().int().positive(),
          rating: z.number().int().min(1).max(5),
          comment: z.string().trim().min(2).max(2000).optional(),
          turnstileToken: z.string().max(2048).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await requireVerifiedContacts(db, ctx.user.id, { email: true, phone: true });
        await requireTurnstile(db, ctx.req, ctx.user.id, input.turnstileToken, "submit_review");
        const [listing] = await db
          .select({ id: listings.id, vendorId: listings.vendorId, status: listings.status })
          .from(listings)
          .where(eq(listings.id, input.listingId))
          .limit(1);
        if (!listing || listing.status !== "published") {
          throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" });
        }
        const existing = await db
          .select({ id: reviews.id })
          .from(reviews)
          .where(and(eq(reviews.listingId, input.listingId), eq(reviews.buyerId, ctx.user.id)))
          .limit(1);
        if (existing.length) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "You have already reviewed this listing" });
        }
        const [created] = await db.insert(reviews).values({
          listingId: listing.id,
          vendorId: listing.vendorId,
          buyerId: ctx.user.id,
          rating: input.rating,
          comment: input.comment || null,
          status: "pending",
        });
        await recordAnalyticsEvent({
          eventType: "submit_review",
          userId: ctx.user.id,
          vendorId: listing.vendorId,
          listingId: listing.id,
          metadata: { rating: input.rating },
        });
        return { reviewId: created.insertId, status: "pending" as const };
      }),

    inquiries: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const userInquiries = await db
        .select({
          inquiry: inquiries,
          listing: listings,
          vendor: vendorProfiles,
        })
        .from(inquiries)
        .innerJoin(listings, eq(inquiries.listingId, listings.id))
        .innerJoin(vendorProfiles, eq(inquiries.vendorId, vendorProfiles.id))
        .where(eq(inquiries.buyerId, ctx.user.id))
        .orderBy(desc(inquiries.updatedAt));

      return Promise.all(
        userInquiries.map(async ({ inquiry, listing, vendor }) => {
          const msgs = await db
            .select()
            .from(messages)
            .where(eq(messages.inquiryId, inquiry.id))
            .orderBy(messages.createdAt);
          const visibleMsgs = msgs.filter(message => !message.isHidden);
          const { vendorPrivateNotes: _privateNotes, ...buyerSafeInquiry } = inquiry;
          return {
            ...buyerSafeInquiry,
            listing,
            vendor: toPublicVendorProfile(vendor),
            messages: visibleMsgs,
            unreadCount: countUnreadMessages(visibleMsgs, ctx.user.id),
            conversationState: getConversationState(
              inquiry.status,
              visibleMsgs,
              inquiry.buyerId,
              ctx.user.id
            ),
            ...getConversationMetrics(visibleMsgs, inquiry.buyerId),
          };
        })
      );
    }),

    createInquiry: protectedProcedure
      .input(
        z.object({
          listingId: z.number(),
          subject: z.string().min(2).max(255),
          message: z.string().min(2),
          turnstileToken: z.string().max(2048).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await requireVerifiedContacts(db, ctx.user.id, { email: true });
        await requireTurnstile(db, ctx.req, ctx.user.id, input.turnstileToken, "create_inquiry");
        if (!allowInquiryCreate(ctx.user.id)) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Too many inquiries. Please try again later.",
          });
        }

        const listingRows = await db
          .select()
          .from(listings)
          .where(eq(listings.id, input.listingId))
          .limit(1);
        if (!listingRows[0])
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Listing not found",
          });

        const duplicateSince = new Date(Date.now() - INQUIRY_DUPLICATE_COOLDOWN_MS);
        const [recentInquiry] = await db
          .select({ id: inquiries.id })
          .from(inquiries)
          .where(
            and(
              eq(inquiries.listingId, input.listingId),
              eq(inquiries.buyerId, ctx.user.id),
              gt(inquiries.createdAt, duplicateSince)
            )
          )
          .limit(1);
        if (recentInquiry) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "You already have a recent inquiry for this listing.",
          });
        }

        const [inqRes] = await db.insert(inquiries).values({
          listingId: input.listingId,
          buyerId: ctx.user.id,
          vendorId: listingRows[0].vendorId,
          subject: input.subject,
          status: "open",
        });

        await db.insert(messages).values({
          inquiryId: inqRes.insertId,
          senderId: ctx.user.id,
          body: input.message,
        });

        const [vendorUser] = await db
          .select({ userId: vendorProfiles.userId })
          .from(vendorProfiles)
          .where(eq(vendorProfiles.id, listingRows[0].vendorId))
          .limit(1);
        if (vendorUser) {
          await enqueueNotificationEvent(db, {
            eventType: "INQUIRY_CREATED",
            idempotencyKey: `inquiry_created:${inqRes.insertId}:${vendorUser.userId}`,
            recipientUserId: vendorUser.userId,
            actorUserId: ctx.user.id,
            entityType: "inquiry",
            entityId: inqRes.insertId,
            payload: {
              inquiryId: inqRes.insertId,
              listingId: input.listingId,
              subject: input.subject,
              actionUrl: `/account?tab=inquiries&inquiry=${inqRes.insertId}`,
            },
          });
        }

        await recordAnalyticsEvent({
          eventType: "submit_inquiry",
          userId: ctx.user.id,
          vendorId: listingRows[0].vendorId,
          listingId: input.listingId,
        });

        return { id: inqRes.insertId, success: true };
      }),

    markInquiryRead: protectedProcedure
      .input(z.object({ inquiryId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const [inquiry] = await db
          .select({ id: inquiries.id })
          .from(inquiries)
          .where(and(eq(inquiries.id, input.inquiryId), eq(inquiries.buyerId, ctx.user.id)))
          .limit(1);
        if (!inquiry) throw new TRPCError({ code: "NOT_FOUND", message: "Inquiry not found" });
        await db
          .update(messages)
          .set({ readAt: new Date() })
          .where(
            and(
              eq(messages.inquiryId, inquiry.id),
              ne(messages.senderId, ctx.user.id),
              isNull(messages.readAt)
            )
          );
        return { success: true };
      }),

    replyInquiry: protectedProcedure
      .input(
        z.object({
          inquiryId: z.number().int().positive(),
          message: z.string().trim().min(2).max(4000),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const [inquiry] = await db
          .select()
          .from(inquiries)
          .where(
            and(eq(inquiries.id, input.inquiryId), eq(inquiries.buyerId, ctx.user.id))
          )
          .limit(1);
        if (!inquiry) throw new TRPCError({ code: "NOT_FOUND", message: "Inquiry not found" });
        if (!isInquiryOpen(inquiry.status)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This inquiry is closed" });
        }

        const [msg] = await db.insert(messages).values({
          inquiryId: inquiry.id,
          senderId: ctx.user.id,
          body: input.message,
        });
        await db.update(inquiries).set({ updatedAt: new Date() }).where(eq(inquiries.id, inquiry.id));
        const [vendorUser] = await db
          .select({ userId: vendorProfiles.userId })
          .from(vendorProfiles)
          .where(eq(vendorProfiles.id, inquiry.vendorId))
          .limit(1);
        if (vendorUser) {
          await enqueueNotificationEvent(db, {
            eventType: "INQUIRY_REPLY_RECEIVED",
            idempotencyKey: `inquiry_reply_received:${msg.insertId}:${vendorUser.userId}`,
            recipientUserId: vendorUser.userId,
            actorUserId: ctx.user.id,
            entityType: "message",
            entityId: msg.insertId,
            payload: {
              inquiryId: inquiry.id,
              listingId: inquiry.listingId,
              subject: `Reply to: ${inquiry.subject}`,
              actionUrl: `/vendor?tab=inquiries&inquiry=${inquiry.id}`,
            },
          });
        }
        return { id: msg.insertId, success: true };
      }),

    closeInquiry: protectedProcedure
      .input(z.object({ inquiryId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const [inquiry] = await db
          .select()
          .from(inquiries)
          .where(and(eq(inquiries.id, input.inquiryId), eq(inquiries.buyerId, ctx.user.id)))
          .limit(1);
        if (!inquiry) throw new TRPCError({ code: "NOT_FOUND", message: "Inquiry not found" });
        const [updated] = await db
          .update(inquiries)
          .set({ status: "closed", updatedAt: new Date() })
          .where(and(eq(inquiries.id, input.inquiryId), eq(inquiries.buyerId, ctx.user.id)));
        if (!updated || updated.affectedRows === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Inquiry not found" });
        }
        const [vendorUser] = await db
          .select({ userId: vendorProfiles.userId })
          .from(vendorProfiles)
          .where(eq(vendorProfiles.id, inquiry.vendorId))
          .limit(1);
        if (vendorUser) {
          await enqueueNotificationEvent(db, {
            eventType: "INQUIRY_RESOLVED",
            idempotencyKey: `inquiry_resolved:${inquiry.id}:${vendorUser.userId}`,
            recipientUserId: vendorUser.userId,
            actorUserId: ctx.user.id,
            entityType: "inquiry",
            entityId: inquiry.id,
            payload: {
              inquiryId: inquiry.id,
              listingId: inquiry.listingId,
              subject: inquiry.subject,
              actionUrl: `/vendor?tab=inquiries&inquiry=${inquiry.id}`,
            },
          });
        }
        return { success: true };
      }),

    reopenInquiry: protectedProcedure
      .input(z.object({ inquiryId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const [updated] = await db
          .update(inquiries)
          .set({ status: "open", updatedAt: new Date() })
          .where(
            and(
              eq(inquiries.id, input.inquiryId),
              eq(inquiries.buyerId, ctx.user.id),
              eq(inquiries.status, "closed")
            )
          );
        if (!updated || updated.affectedRows === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Resolved inquiry not found" });
        }
        return { success: true };
      }),

    archiveInquiry: protectedProcedure
      .input(z.object({ inquiryId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const [updated] = await db
          .update(inquiries)
          .set({ status: "archived", updatedAt: new Date() })
          .where(
            and(
              eq(inquiries.id, input.inquiryId),
              eq(inquiries.buyerId, ctx.user.id),
              ne(inquiries.status, "archived")
            )
          );
        if (!updated || updated.affectedRows === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Inquiry not found" });
        }
        return { success: true };
      }),

    unarchiveInquiry: protectedProcedure
      .input(z.object({ inquiryId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const [updated] = await db
          .update(inquiries)
          .set({ status: "open", updatedAt: new Date() })
          .where(
            and(
              eq(inquiries.id, input.inquiryId),
              eq(inquiries.buyerId, ctx.user.id),
              eq(inquiries.status, "archived")
            )
          );
        if (!updated || updated.affectedRows === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Archived inquiry not found" });
        }
        return { success: true };
      }),

    reportConversation: protectedProcedure
      .input(
        z.object({
          inquiryId: z.number().int().positive(),
          reason: z.string().trim().min(3).max(120),
          details: z.string().trim().max(2000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const [inquiry] = await db
          .select({ id: inquiries.id })
          .from(inquiries)
          .where(and(eq(inquiries.id, input.inquiryId), eq(inquiries.buyerId, ctx.user.id)))
          .limit(1);
        if (!inquiry) throw new TRPCError({ code: "NOT_FOUND", message: "Inquiry not found" });
        const [existing] = await db
          .select({ id: conversationReports.id })
          .from(conversationReports)
          .where(
            and(
              eq(conversationReports.inquiryId, input.inquiryId),
              eq(conversationReports.reporterId, ctx.user.id),
              eq(conversationReports.status, "open")
            )
          )
          .limit(1);
        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: "You already reported this conversation." });
        }
        const [created] = await db.insert(conversationReports).values({
          inquiryId: input.inquiryId,
          reporterId: ctx.user.id,
          reason: input.reason,
          details: input.details || null,
        });
        await db.insert(moderationRecords).values({
          entityType: "conversation",
          entityId: String(input.inquiryId),
          actorId: ctx.user.id,
          action: "conversation_reported",
          reason: input.reason,
        });
        return { id: created.insertId, status: "open" as const };
      }),

    savedSearches: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(savedSearches)
        .where(eq(savedSearches.userId, ctx.user.id))
        .orderBy(desc(savedSearches.createdAt));
    }),

    createSavedSearch: protectedProcedure
      .input(
        z.object({
          name: z.string().trim().min(2).max(140),
          query: z.string().trim().max(255).optional(),
          categoryId: z.number().int().positive().optional(),
          listingType: z.enum(["product", "service"]).optional(),
          location: z.string().trim().max(160).optional(),
          minPrice: z.number().nonnegative().optional(),
          maxPrice: z.number().nonnegative().optional(),
          remoteOnly: z.boolean().default(false),
          verifiedVendorOnly: z.boolean().default(false),
          alertFrequency: z.enum(["immediate", "daily", "off"]).default("off"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const [res] = await db.insert(savedSearches).values({
          userId: ctx.user.id,
          name: input.name,
          query: input.query || null,
          categoryId: input.categoryId || null,
          listingType: input.listingType || null,
          location: input.location || null,
          minPrice: input.minPrice !== undefined ? Math.round(input.minPrice) : null,
          maxPrice: input.maxPrice !== undefined ? Math.round(input.maxPrice) : null,
          remoteOnly: input.remoteOnly,
          verifiedVendorOnly: input.verifiedVendorOnly,
          alertFrequency: input.alertFrequency,
        });
        return { id: res.insertId, success: true };
      }),

    updateSavedSearch: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          name: z.string().trim().min(2).max(140).optional(),
          alertFrequency: z.enum(["immediate", "daily", "off"]).optional(),
          isActive: z.boolean().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const updateData: Record<string, any> = { updatedAt: new Date() };
        if (input.name !== undefined) updateData.name = input.name;
        if (input.alertFrequency !== undefined) updateData.alertFrequency = input.alertFrequency;
        if (input.isActive !== undefined) updateData.isActive = input.isActive;
        const [updated] = await db
          .update(savedSearches)
          .set(updateData)
          .where(and(eq(savedSearches.id, input.id), eq(savedSearches.userId, ctx.user.id)));
        if (!updated || updated.affectedRows === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Saved search not found" });
        }
        return { success: true };
      }),

    deleteSavedSearch: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const [deleted] = await db
          .delete(savedSearches)
          .where(and(eq(savedSearches.id, input.id), eq(savedSearches.userId, ctx.user.id)));
        if (!deleted || deleted.affectedRows === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Saved search not found" });
        }
        return { success: true };
      }),
  }),

  vendor: router({
    getProfile: protectedProcedure.query(async ({ ctx }) => {
      return getVendorProfileByUserId(ctx.user.id);
    }),

    saveProfile: protectedProcedure
      .input(
        z.object({
          businessName: z.string().min(2).max(180),
          description: z.string().optional(),
          location: z.string().optional(),
          serviceArea: z.string().optional(),
          remoteAvailable: z.boolean().default(false),
          contactEmail: z.string().email().optional(),
          phone: z.string().max(80).optional(),
          whatsapp: z.string().max(80).optional(),
          imessage: z.string().max(120).optional(),
          instagram: z.string().max(120).optional(),
          website: z.string().url().optional(),
          standardsAcknowledged: z.boolean().default(false),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const existing = await db
          .select()
          .from(vendorProfiles)
          .where(eq(vendorProfiles.userId, ctx.user.id))
          .limit(1);

        const { standardsAcknowledged, ...profileInput } = input;
        let vendorProfileId: number;
        if (existing.length > 0) {
          vendorProfileId = existing[0].id;
          await db
            .update(vendorProfiles)
            .set({
              ...profileInput,
              standardsAcknowledgedAt: standardsAcknowledged
                ? new Date()
                : existing[0].standardsAcknowledgedAt,
              approvalStatus: "pending",
            })
            .where(eq(vendorProfiles.id, vendorProfileId));
        } else {
          const [res] = await db.insert(vendorProfiles).values({
            userId: ctx.user.id,
            ...profileInput,
            standardsAcknowledgedAt: standardsAcknowledged ? new Date() : null,
            approvalStatus: "pending",
          });
          vendorProfileId = res.insertId;
        }

        const [accountUser] = await db
          .select({ phone: users.phone })
          .from(users)
          .where(eq(users.id, ctx.user.id))
          .limit(1);
        // Update user role to vendor and invalidate phone ownership when the number changes.
        await db
          .update(users)
          .set({
            role: "vendor",
            ...(profileInput.phone && profileInput.phone !== accountUser?.phone
              ? { phone: profileInput.phone, phoneVerifiedAt: null }
              : {}),
          })
          .where(eq(users.id, ctx.user.id));

        // Create or update storefront
        const slug = input.businessName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");
        const existingSf = await db
          .select()
          .from(storefronts)
          .where(eq(storefronts.vendorId, vendorProfileId))
          .limit(1);

        if (existingSf.length > 0) {
          await db
            .update(storefronts)
            .set({
              displayName: input.businessName,
              description: input.description,
              location: input.location,
              serviceArea: input.serviceArea,
              remoteAvailable: input.remoteAvailable,
              website: input.website,
            })
            .where(eq(storefronts.id, existingSf[0].id));
        } else {
          await db.insert(storefronts).values({
            vendorId: vendorProfileId,
            slug: `${slug}-${vendorProfileId}`,
            displayName: input.businessName,
            description: input.description,
            location: input.location,
            serviceArea: input.serviceArea,
            remoteAvailable: input.remoteAvailable,
            website: input.website,
          });
        }

        return getVendorProfileByUserId(ctx.user.id);
      }),

    listings: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const profile = await getVendorProfileByUserId(ctx.user.id);
      if (!profile) return [];

      return db
        .select()
        .from(listings)
        .where(eq(listings.vendorId, profile.id))
        .orderBy(desc(listings.createdAt));
    }),

    analytics: protectedProcedure
      .input(
        z
          .object({
            from: z.coerce.date().optional(),
            to: z.coerce.date().optional(),
            categoryId: z.number().int().positive().optional(),
          })
          .optional()
      )
      .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "vendor") throw new TRPCError({ code: "FORBIDDEN" });
      const profile = await getVendorProfileByUserId(ctx.user.id);
      if (!profile) {
        return {
          views: 0,
          saves: 0,
          contactReveals: 0,
          inquiries: 0,
          listings: 0,
          unread: 0,
          resolved: 0,
          responseRate: 0,
          averageResponseSeconds: null,
          topListings: [],
        };
      }
      const scope = resolveAnalyticsScope(ctx.user.role, profile.id);
      return getVendorFunnelAnalytics(profile.id, { ...scope, ...(input || {}) });
    }),

    reviews: protectedProcedure.query(async ({ ctx }) => {
      const profile = await getVendorProfileByUserId(ctx.user.id);
      if (!profile) return [];
      return getVendorReviews(profile.id);
    }),

    saveListing: protectedProcedure
      .input(
        z.object({
          id: z.number().optional(),
          title: z.string().min(2).max(220),
          description: z.string().min(10),
          categoryId: z.number(),
          listingType: z.enum(["product", "service"]),
          priceIndication: z.string().optional(),
          location: z.string().optional(),
          remoteAvailable: z.boolean().default(false),
          status: z
            .enum(["draft", "published", "hidden", "archived"])
            .default("draft"),
          media: z
            .array(
              z.string().url().or(z.string().startsWith("/manus-storage/"))
            )
            .max(5)
            .optional(),
          turnstileToken: z.string().max(2048).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const profile = await getVendorProfileByUserId(ctx.user.id);
        if (!profile || profile.approvalStatus !== "approved") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Approved vendor profile required",
          });
        }
        if (input.status === "published") {
          await requireVerifiedContacts(db, ctx.user.id, { email: true, phone: true });
          await requireTurnstile(db, ctx.req, ctx.user.id, input.turnstileToken, "publish_listing");
        }

        const slug = input.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");

        if (input.id) {
          const { media: mediaUrls, turnstileToken: _turnstileToken, ...listingFields } = input;
          await db
            .update(listings)
            .set({
              ...listingFields,
              storefrontId: profile.storefront?.id || null,
              publishedAt: input.status === "published" ? new Date() : null,
            })
            .where(
              and(eq(listings.id, input.id), eq(listings.vendorId, profile.id))
            );

          if (mediaUrls !== undefined) {
            await db
              .delete(listingMedia)
              .where(eq(listingMedia.listingId, input.id));
            if (mediaUrls.length > 0) {
              await db.insert(listingMedia).values(
                mediaUrls.slice(0, 5).map((url, sortOrder) => ({
                  listingId: input.id!,
                  url,
                  sortOrder,
                }))
              );
            }
          }
          if (input.status === "published") {
            processListingSavedSearchMatches(input.id).catch(err => {
              console.warn("[SavedSearch] Match processing error:", err);
            });
          }
          return { id: input.id, success: true };
        } else {
          const uniqueSlug = `${slug}-${Date.now().toString().slice(-6)}`;
          const [res] = await db.insert(listings).values({
            slug: uniqueSlug,
            vendorId: profile.id,
            storefrontId: profile.storefront?.id || null,
            categoryId: input.categoryId,
            title: input.title,
            description: input.description,
            listingType: input.listingType,
            priceIndication: input.priceIndication,
            location: input.location,
            remoteAvailable: input.remoteAvailable,
            status: input.status,
            publishedAt: input.status === "published" ? new Date() : null,
          });
          if (input.status === "published") {
            processListingSavedSearchMatches(res.insertId).catch(err => {
              console.warn("[SavedSearch] Match processing error:", err);
            });
          }
          return { id: res.insertId, slug: uniqueSlug, success: true };
        }
      }),

    inquiries: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const profile = await getVendorProfileByUserId(ctx.user.id);
      if (!profile) return [];

      const vendorInquiries = await db
        .select({
          inquiry: inquiries,
          listing: listings,
          buyer: users,
        })
        .from(inquiries)
        .innerJoin(listings, eq(inquiries.listingId, listings.id))
        .innerJoin(users, eq(inquiries.buyerId, users.id))
        .where(eq(inquiries.vendorId, profile.id))
        .orderBy(desc(inquiries.updatedAt));

      return Promise.all(
        vendorInquiries.map(async ({ inquiry, listing, buyer }) => {
          const msgs = await db
            .select()
            .from(messages)
            .where(eq(messages.inquiryId, inquiry.id))
            .orderBy(messages.createdAt);
          const visibleMsgs = msgs.filter(message => !message.isHidden);
          return {
            ...inquiry,
            listing,
            buyer,
            messages: visibleMsgs,
            unreadCount: countUnreadMessages(visibleMsgs, ctx.user.id),
            conversationState: getConversationState(
              inquiry.status,
              visibleMsgs,
              inquiry.buyerId,
              ctx.user.id
            ),
            ...getConversationMetrics(visibleMsgs, inquiry.buyerId),
          };
        })
      );
    }),

    markInquiryRead: protectedProcedure
      .input(z.object({ inquiryId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const profile = await getVendorProfileByUserId(ctx.user.id);
        if (!profile) throw new TRPCError({ code: "FORBIDDEN", message: "Vendor profile required" });
        const [inquiry] = await db
          .select({ id: inquiries.id })
          .from(inquiries)
          .where(and(eq(inquiries.id, input.inquiryId), eq(inquiries.vendorId, profile.id)))
          .limit(1);
        if (!inquiry) throw new TRPCError({ code: "NOT_FOUND", message: "Inquiry not found" });
        await db
          .update(messages)
          .set({ readAt: new Date() })
          .where(
            and(
              eq(messages.inquiryId, inquiry.id),
              ne(messages.senderId, ctx.user.id),
              isNull(messages.readAt)
            )
          );
        return { success: true };
      }),

    replyInquiry: protectedProcedure
      .input(
        z.object({
          inquiryId: z.number().int().positive(),
          message: z.string().trim().min(2).max(4000),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const profile = await getVendorProfileByUserId(ctx.user.id);
        if (!profile) throw new TRPCError({ code: "FORBIDDEN", message: "Vendor profile required" });
        const [inquiry] = await db
          .select()
          .from(inquiries)
          .where(
            and(eq(inquiries.id, input.inquiryId), eq(inquiries.vendorId, profile.id))
          )
          .limit(1);
        if (!inquiry) throw new TRPCError({ code: "NOT_FOUND", message: "Inquiry not found" });
        if (!isInquiryOpen(inquiry.status)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This inquiry is closed" });
        }

        const [msgRes] = await db.insert(messages).values({
          inquiryId: input.inquiryId,
          senderId: ctx.user.id,
          body: input.message,
        });

        await db
          .update(inquiries)
          .set({ updatedAt: new Date() })
          .where(eq(inquiries.id, input.inquiryId));

        await enqueueNotificationEvent(db, {
          eventType: "INQUIRY_REPLY_RECEIVED",
          idempotencyKey: `inquiry_reply_received:${msgRes.insertId}:${inquiry.buyerId}`,
          recipientUserId: inquiry.buyerId,
          actorUserId: ctx.user.id,
          entityType: "message",
          entityId: msgRes.insertId,
          payload: {
            inquiryId: inquiry.id,
            listingId: inquiry.listingId,
            subject: `Reply to: ${inquiry.subject}`,
            actionUrl: `/account?tab=inquiries&inquiry=${inquiry.id}`,
          },
        });

        return { id: msgRes.insertId, success: true };
      }),

    closeInquiry: protectedProcedure
      .input(z.object({ inquiryId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const profile = await getVendorProfileByUserId(ctx.user.id);
        if (!profile) throw new TRPCError({ code: "FORBIDDEN", message: "Vendor profile required" });
        const [inquiry] = await db
          .select()
          .from(inquiries)
          .where(and(eq(inquiries.id, input.inquiryId), eq(inquiries.vendorId, profile.id)))
          .limit(1);
        if (!inquiry) throw new TRPCError({ code: "NOT_FOUND", message: "Inquiry not found" });
        const [updated] = await db
          .update(inquiries)
          .set({ status: "closed", updatedAt: new Date() })
          .where(and(eq(inquiries.id, input.inquiryId), eq(inquiries.vendorId, profile.id)));
        if (!updated || updated.affectedRows === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Inquiry not found" });
        }
        await enqueueNotificationEvent(db, {
          eventType: "INQUIRY_RESOLVED",
          idempotencyKey: `inquiry_resolved:${inquiry.id}:${inquiry.buyerId}`,
          recipientUserId: inquiry.buyerId,
          actorUserId: ctx.user.id,
          entityType: "inquiry",
          entityId: inquiry.id,
          payload: {
            inquiryId: inquiry.id,
            listingId: inquiry.listingId,
            subject: inquiry.subject,
            actionUrl: `/account?tab=inquiries&inquiry=${inquiry.id}`,
          },
        });
        return { success: true };
      }),

    reopenInquiry: protectedProcedure
      .input(z.object({ inquiryId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const profile = await getVendorProfileByUserId(ctx.user.id);
        if (!profile) throw new TRPCError({ code: "FORBIDDEN", message: "Vendor profile required" });
        const [updated] = await db
          .update(inquiries)
          .set({ status: "open", updatedAt: new Date() })
          .where(
            and(
              eq(inquiries.id, input.inquiryId),
              eq(inquiries.vendorId, profile.id),
              eq(inquiries.status, "closed")
            )
          );
        if (!updated || updated.affectedRows === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Resolved inquiry not found" });
        }
        return { success: true };
      }),

    archiveInquiry: protectedProcedure
      .input(z.object({ inquiryId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const profile = await getVendorProfileByUserId(ctx.user.id);
        if (!profile) throw new TRPCError({ code: "FORBIDDEN", message: "Vendor profile required" });
        const [updated] = await db
          .update(inquiries)
          .set({ status: "archived", updatedAt: new Date() })
          .where(
            and(
              eq(inquiries.id, input.inquiryId),
              eq(inquiries.vendorId, profile.id),
              ne(inquiries.status, "archived")
            )
          );
        if (!updated || updated.affectedRows === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Inquiry not found" });
        }
        return { success: true };
      }),

    unarchiveInquiry: protectedProcedure
      .input(z.object({ inquiryId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const profile = await getVendorProfileByUserId(ctx.user.id);
        if (!profile) throw new TRPCError({ code: "FORBIDDEN", message: "Vendor profile required" });
        const [updated] = await db
          .update(inquiries)
          .set({ status: "open", updatedAt: new Date() })
          .where(
            and(
              eq(inquiries.id, input.inquiryId),
              eq(inquiries.vendorId, profile.id),
              eq(inquiries.status, "archived")
            )
          );
        if (!updated || updated.affectedRows === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Archived inquiry not found" });
        }
        return { success: true };
      }),

    reportConversation: protectedProcedure
      .input(
        z.object({
          inquiryId: z.number().int().positive(),
          reason: z.string().trim().min(3).max(120),
          details: z.string().trim().max(2000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const profile = await getVendorProfileByUserId(ctx.user.id);
        if (!profile) throw new TRPCError({ code: "FORBIDDEN", message: "Vendor profile required" });
        const [inquiry] = await db
          .select({ id: inquiries.id })
          .from(inquiries)
          .where(and(eq(inquiries.id, input.inquiryId), eq(inquiries.vendorId, profile.id)))
          .limit(1);
        if (!inquiry) throw new TRPCError({ code: "NOT_FOUND", message: "Inquiry not found" });
        const [existing] = await db
          .select({ id: conversationReports.id })
          .from(conversationReports)
          .where(
            and(
              eq(conversationReports.inquiryId, input.inquiryId),
              eq(conversationReports.reporterId, ctx.user.id),
              eq(conversationReports.status, "open")
            )
          )
          .limit(1);
        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: "You already reported this conversation." });
        }
        const [created] = await db.insert(conversationReports).values({
          inquiryId: input.inquiryId,
          reporterId: ctx.user.id,
          reason: input.reason,
          details: input.details || null,
        });
        await db.insert(moderationRecords).values({
          entityType: "conversation",
          entityId: String(input.inquiryId),
          actorId: ctx.user.id,
          action: "conversation_reported",
          reason: input.reason,
        });
        return { id: created.insertId, status: "open" as const };
      }),

    verificationStatus: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return null;
      const profile = await getVendorProfileByUserId(ctx.user.id);
      if (!profile) return null;
      const [user] = await db
        .select({ email: users.email, phone: users.phone, emailVerifiedAt: users.emailVerifiedAt, phoneVerifiedAt: users.phoneVerifiedAt })
        .from(users)
        .where(eq(users.id, ctx.user.id))
        .limit(1);
      const sessions = await db
        .select()
        .from(vendorVerificationSessions)
        .where(eq(vendorVerificationSessions.vendorId, profile.id))
        .orderBy(desc(vendorVerificationSessions.createdAt));
      const sanitizedSessions = sessions.map(s => ({
        id: s.id,
        provider: s.provider,
        sessionType: s.sessionType,
        status: s.status,
        countryCode: s.countryCode,
        expiresAt: s.expiresAt,
        createdAt: s.createdAt,
      }));
      const badges = deriveVendorBadges({
        emailVerified: Boolean(user?.email && user.emailVerifiedAt),
        phoneVerified: Boolean(user?.phone && user.phoneVerifiedAt),
        identityStatus: profile.identityStatus,
        residenceStatus: profile.residenceStatus,
        residenceCountry: profile.residenceCountry,
        approvalStatus: profile.approvalStatus,
      });
      return {
        profile: {
          identityStatus: profile.identityStatus,
          identityVerifiedAt: profile.identityVerifiedAt,
          residenceStatus: profile.residenceStatus,
          residenceCountry: profile.residenceCountry,
          residenceVerifiedAt: profile.residenceVerifiedAt,
          approvalStatus: profile.approvalStatus,
        },
        badges,
        sessions: sanitizedSessions,
      };
    }),

    startVerificationSession: protectedProcedure
      .input(
        z.object({
          sessionType: z.enum([
            "identity_document",
            "liveness",
            "proof_of_residence",
            "combined_na_vendor",
          ]),
          countryCode: z.enum(["US", "CA", "MX"]),
          provider: z.enum(["didit", "veriff", "sumsub", "manual"]).default("didit"),
          consentGiven: z.boolean().refine(val => val === true, {
            message: "Consent is required to start vendor verification.",
          }),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const profile = await getVendorProfileByUserId(ctx.user.id);
        if (!profile) throw new TRPCError({ code: "FORBIDDEN", message: "Vendor profile required" });
        const adapter = selectVerificationAdapter(input.provider);
        const sessionResult = await adapter.createSession({
          vendorId: profile.id,
          userId: ctx.user.id,
          sessionType: input.sessionType,
          countryCode: input.countryCode,
          firstName: ctx.user.name?.split(" ")[0] || "Vendor",
          lastName: ctx.user.name?.split(" ").slice(1).join(" ") || "Applicant",
        });
        const [created] = await db.insert(vendorVerificationSessions).values({
          vendorId: profile.id,
          userId: ctx.user.id,
          provider: input.provider,
          providerSessionId: sessionResult.providerSessionId,
          sessionType: input.sessionType,
          status: sessionResult.status,
          countryCode: input.countryCode,
          consentGivenAt: new Date(),
          expiresAt: sessionResult.expiresAt,
        });
        await db
          .update(vendorProfiles)
          .set({
            identityStatus: "pending",
            residenceStatus: "pending",
            residenceCountry: input.countryCode,
          })
          .where(eq(vendorProfiles.id, profile.id));
        return {
          sessionId: created.insertId,
          providerSessionId: sessionResult.providerSessionId,
          verificationUrl: sessionResult.verificationUrl,
          status: sessionResult.status,
        };
      }),

    submitManualEvidence: protectedProcedure
      .input(
        z.object({
          sessionId: z.number().int().positive(),
          evidenceType: z.enum([
            "government_id",
            "utility_bill",
            "bank_statement",
            "lease_agreement",
            "business_registration",
          ]),
          fileBase64: z.string().min(10),
          filename: z.string().min(3).max(255),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const profile = await getVendorProfileByUserId(ctx.user.id);
        if (!profile) throw new TRPCError({ code: "FORBIDDEN", message: "Vendor profile required" });
        const [session] = await db
          .select()
          .from(vendorVerificationSessions)
          .where(
            and(
              eq(vendorVerificationSessions.id, input.sessionId),
              eq(vendorVerificationSessions.vendorId, profile.id)
            )
          )
          .limit(1);
        if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Verification session not found" });
        const fileBuffer = Buffer.from(input.fileBase64, "base64");
        const relKey = `evidence/${session.id}/${input.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        let storageKey = relKey;
        try {
          const stored = await storagePut(relKey, fileBuffer);
          storageKey = stored.key;
        } catch (storageErr) {
          console.warn("[Verification] Cloud storage presign fallback, stored local key:", storageErr);
        }
        const retentionExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
        const summary = sanitizeEvidenceSummary(input.filename, input.evidenceType);
        const [created] = await db.insert(vendorVerificationEvidence).values({
          sessionId: session.id,
          evidenceType: input.evidenceType,
          fileStoragePath: storageKey,
          redactedSummary: summary,
          retentionExpiresAt,
        });
        await db
          .update(vendorVerificationSessions)
          .set({ status: "in_review", updatedAt: new Date() })
          .where(eq(vendorVerificationSessions.id, session.id));
        return { evidenceId: created.insertId, summary, status: "in_review" as const };
      }),

    updateLeadStage: protectedProcedure
      .input(
        z.object({
          inquiryId: z.number().int().positive(),
          stage: z.enum([
            "new_inquiry",
            "contacted",
            "quote_sent",
            "deal_won",
            "deal_lost",
          ]),
          notes: z.string().trim().max(4000).optional(),
          followUpDate: z.coerce.date().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const profile = await getVendorProfileByUserId(ctx.user.id);
        if (!profile) throw new TRPCError({ code: "FORBIDDEN", message: "Vendor profile required" });
        const [inquiry] = await db
          .select()
          .from(inquiries)
          .where(and(eq(inquiries.id, input.inquiryId), eq(inquiries.vendorId, profile.id)))
          .limit(1);
        if (!inquiry) throw new TRPCError({ code: "NOT_FOUND", message: "Inquiry not found" });
        if (!canTransitionLead(inquiry.leadStage as LeadStage, input.stage)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Cannot transition from ${inquiry.leadStage} to ${input.stage}`,
          });
        }
        const updateData: Record<string, any> = {
          leadStage: input.stage,
          updatedAt: new Date(),
        };
        if (input.notes !== undefined) updateData.vendorPrivateNotes = input.notes;
        if (input.followUpDate !== undefined) updateData.followUpDate = input.followUpDate;
        await db
          .update(inquiries)
          .set(updateData)
          .where(eq(inquiries.id, inquiry.id));
        await db.insert(inquiryLeadHistory).values({
          inquiryId: inquiry.id,
          fromStage: inquiry.leadStage,
          toStage: input.stage,
          changedByUserId: ctx.user.id,
          notes: input.notes || null,
        });
        return { success: true, currentStage: input.stage };
      }),

    leadFunnel: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return computeLeadFunnel([]);
      const profile = await getVendorProfileByUserId(ctx.user.id);
      if (!profile) return computeLeadFunnel([]);
      const inqRows = await db
        .select({ leadStage: inquiries.leadStage })
        .from(inquiries)
        .where(eq(inquiries.vendorId, profile.id));
      return computeLeadFunnel(inqRows.map(r => r.leadStage as LeadStage));
    }),
  }),

  admin: router({
    pendingVendors: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return [];

      return db
        .select({
          vendor: vendorProfiles,
          user: users,
        })
        .from(vendorProfiles)
        .innerJoin(users, eq(vendorProfiles.userId, users.id))
        .where(eq(vendorProfiles.approvalStatus, "pending"))
        .orderBy(desc(vendorProfiles.createdAt));
    }),

    decideVendor: protectedProcedure
      .input(
        z.object({
          vendorId: z.number(),
          status: z.enum(["approved", "rejected", "suspended"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin")
          throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await db
          .update(vendorProfiles)
          .set({
            approvalStatus: input.status,
            approvedAt: input.status === "approved" ? new Date() : null,
          })
          .where(eq(vendorProfiles.id, input.vendorId));

        await db.insert(moderationRecords).values({
          entityType: "vendor",
          entityId: String(input.vendorId),
          actorId: ctx.user.id,
          action: input.status,
        });

        const [vendor] = await db
          .select({ userId: vendorProfiles.userId, businessName: vendorProfiles.businessName })
          .from(vendorProfiles)
          .where(eq(vendorProfiles.id, input.vendorId))
          .limit(1);
        if (vendor && (input.status === "approved" || input.status === "rejected")) {
          await enqueueNotificationEvent(db, {
            eventType: input.status === "approved" ? "VENDOR_APPROVED" : "VENDOR_REJECTED",
            idempotencyKey: `vendor_${input.status}:${input.vendorId}:${Date.now()}`,
            recipientUserId: vendor.userId,
            actorUserId: ctx.user.id,
            entityType: "vendor",
            entityId: input.vendorId,
            payload: {
              vendorId: input.vendorId,
              businessName: vendor.businessName,
              status: input.status,
              actionUrl: "/vendor",
            },
          });
        }

        return { success: true };
      }),

    categories: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return [];
      return db.select().from(categories).orderBy(categories.sortOrder);
    }),

    saveCategory: protectedProcedure
      .input(
        z.object({
          id: z.number().optional(),
          name: z.string().min(2).max(160),
          slug: z.string().min(2).max(128),
          sortOrder: z.number().int().default(0),
          isActive: z.boolean().default(true),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin")
          throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { id, ...values } = input;
        if (id) {
          await db.update(categories).set(values).where(eq(categories.id, id));
          return { id, success: true };
        }
        const [result] = await db.insert(categories).values(values);
        return { id: result.insertId, success: true };
      }),

    users: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      return getAllUsersForAdmin();
    }),

    updateUserStatus: protectedProcedure
      .input(
        z.object({
          userId: z.number(),
          status: z.enum(["active", "suspended"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin")
          throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db
          .update(users)
          .set({ status: input.status })
          .where(eq(users.id, input.userId));
        return { success: true };
      }),

    listings: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const allListings = await getAllListingsForAdmin();
      return allListings.map(item => ({
        ...item,
        quality: evaluateListingQuality({
          title: item.listing.title,
          description: item.listing.description,
          priceIndication: item.listing.priceIndication,
          location: item.listing.location,
          categoryId: item.listing.categoryId,
          vendorApproved: item.vendor.approvalStatus === "approved",
        }),
      }));
    }),

    reviews: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return [];
      const allReviews = await db
        .select({
          review: reviews,
          listing: listings,
          buyer: users,
        })
        .from(reviews)
        .innerJoin(listings, eq(reviews.listingId, listings.id))
        .innerJoin(users, eq(reviews.buyerId, users.id))
        .orderBy(desc(reviews.createdAt));
      return allReviews.map(item => ({
        ...item,
        integrity: evaluateReviewIntegrity({
          comment: item.review.comment,
          rating: item.review.rating,
        }),
      }));
    }),

    updateReviewStatus: protectedProcedure
      .input(
        z.object({
          reviewId: z.number().int().positive(),
          status: z.enum(["approved", "rejected", "pending"]),
          reason: z.string().trim().max(1000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db
          .update(reviews)
          .set({ status: input.status })
          .where(eq(reviews.id, input.reviewId));
        await db.insert(moderationRecords).values({
          entityType: "review",
          entityId: String(input.reviewId),
          actorId: ctx.user.id,
          action: `review_${input.status}`,
          reason: input.reason || null,
        });

        const [reviewRecord] = await db
          .select({ buyerId: reviews.buyerId, listingId: reviews.listingId })
          .from(reviews)
          .where(eq(reviews.id, input.reviewId))
          .limit(1);
        if (reviewRecord && (input.status === "approved" || input.status === "rejected")) {
          await enqueueNotificationEvent(db, {
            eventType: "REVIEW_MODERATED",
            idempotencyKey: `review_moderated:${input.reviewId}:${input.status}:${Date.now()}`,
            recipientUserId: reviewRecord.buyerId,
            actorUserId: ctx.user.id,
            entityType: "review",
            entityId: input.reviewId,
            payload: {
              reviewId: input.reviewId,
              listingId: reviewRecord.listingId,
              status: input.status,
              reason: input.reason || null,
              actionUrl: `/account?tab=reviews`,
            },
          });
        }

        return { success: true, status: input.status };
      }),

    disputes: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      return getAllDisputesForAdmin();
    }),

    updateDispute: protectedProcedure
      .input(
        z.object({
          disputeId: z.number(),
          status: z.enum(["open", "in_review", "resolved", "rejected"]),
          resolution: z.string().max(2000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin")
          throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db
          .update(disputes)
          .set({ status: input.status, resolution: input.resolution })
          .where(eq(disputes.id, input.disputeId));
        await db.insert(moderationRecords).values({
          entityType: "dispute",
          entityId: String(input.disputeId),
          actorId: ctx.user.id,
          action: input.status,
          reason: input.resolution,
        });
        return { success: true };
      }),

    updateListingStatus: protectedProcedure
      .input(
        z.object({
          listingId: z.number(),
          status: z.enum([
            "draft",
            "pending",
            "approved",
            "rejected",
            "published",
            "hidden",
            "archived",
          ]),
          reason: z.string().max(500).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin")
          throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db
          .update(listings)
          .set({
            status: input.status,
            publishedAt: input.status === "published" ? new Date() : null,
          })
          .where(eq(listings.id, input.listingId));
        await db.insert(moderationRecords).values({
          entityType: "listing",
          entityId: String(input.listingId),
          actorId: ctx.user.id,
          action: input.status,
          reason: input.reason,
        });
        return { success: true };
      }),

    moderation: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(moderationRecords)
        .orderBy(desc(moderationRecords.createdAt));
    }),

    conversationReports: protectedProcedure
      .input(
        z
          .object({
            status: z.enum(["open", "reviewed", "dismissed", "actioned"]).optional(),
            conversationState: z.enum(["open", "closed", "archived"]).optional(),
            listingId: z.number().int().positive().optional(),
            buyerId: z.number().int().positive().optional(),
            vendorId: z.number().int().positive().optional(),
            from: z.coerce.date().optional(),
            to: z.coerce.date().optional(),
          })
          .optional()
      )
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) return [];
        const filters = [
          input?.status ? eq(conversationReports.status, input.status) : undefined,
          input?.conversationState ? eq(inquiries.status, input.conversationState) : undefined,
          input?.listingId ? eq(inquiries.listingId, input.listingId) : undefined,
          input?.buyerId ? eq(inquiries.buyerId, input.buyerId) : undefined,
          input?.vendorId ? eq(inquiries.vendorId, input.vendorId) : undefined,
          input?.from ? gte(conversationReports.createdAt, input.from) : undefined,
          input?.to ? lte(conversationReports.createdAt, input.to) : undefined,
        ].filter(Boolean) as Array<ReturnType<typeof eq>>;
        return db
          .select({
            report: conversationReports,
            inquiry: inquiries,
            listing: listings,
            reporter: users,
          })
          .from(conversationReports)
          .innerJoin(inquiries, eq(conversationReports.inquiryId, inquiries.id))
          .innerJoin(listings, eq(inquiries.listingId, listings.id))
          .innerJoin(users, eq(conversationReports.reporterId, users.id))
          .where(filters.length ? and(...filters) : undefined)
          .orderBy(desc(conversationReports.createdAt))
          .limit(100);
      }),

    conversationMessages: protectedProcedure
      .input(z.object({ inquiryId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) return [];
        return db
          .select({ message: messages, sender: users })
          .from(messages)
          .innerJoin(users, eq(messages.senderId, users.id))
          .where(eq(messages.inquiryId, input.inquiryId))
          .orderBy(messages.createdAt);
      }),

    updateConversationReport: protectedProcedure
      .input(
        z.object({
          reportId: z.number().int().positive(),
          status: z.enum(["reviewed", "dismissed", "actioned"]),
          resolutionNote: z.string().trim().max(2000).optional(),
          linkedDisputeId: z.number().int().positive().nullable().optional(),
          suspendConversation: z.boolean().default(false),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const [report] = await db
          .select({ report: conversationReports, inquiry: inquiries })
          .from(conversationReports)
          .innerJoin(inquiries, eq(conversationReports.inquiryId, inquiries.id))
          .where(eq(conversationReports.id, input.reportId))
          .limit(1);
        if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "Report not found" });
        await db
          .update(conversationReports)
          .set({
            status: input.status,
            resolutionNote: input.resolutionNote || null,
            linkedDisputeId: input.linkedDisputeId,
            reviewedBy: ctx.user.id,
            reviewedAt: new Date(),
          })
          .where(eq(conversationReports.id, input.reportId));
        if (input.suspendConversation) {
          await db
            .update(inquiries)
            .set({ status: "archived", updatedAt: new Date() })
            .where(eq(inquiries.id, report.inquiry.id));
        }
        await db.insert(moderationRecords).values({
          entityType: "conversation",
          entityId: String(report.inquiry.id),
          actorId: ctx.user.id,
          action: `report_${input.status}`,
          reason: input.resolutionNote,
        });
        return { success: true };
      }),

    moderateMessage: protectedProcedure
      .input(
        z.object({
          messageId: z.number().int().positive(),
          hidden: z.boolean(),
          reason: z.string().trim().max(1000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const [message] = await db
          .select({ id: messages.id, inquiryId: messages.inquiryId })
          .from(messages)
          .where(eq(messages.id, input.messageId))
          .limit(1);
        if (!message) throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });
        await db
          .update(messages)
          .set({
            isHidden: input.hidden,
            hiddenAt: input.hidden ? new Date() : null,
            hiddenBy: input.hidden ? ctx.user.id : null,
            hiddenReason: input.hidden ? input.reason || null : null,
          })
          .where(eq(messages.id, input.messageId));
        await db.insert(moderationRecords).values({
          entityType: "message",
          entityId: String(input.messageId),
          actorId: ctx.user.id,
          action: input.hidden ? "message_hidden" : "message_restored",
          reason: input.reason,
        });
        return { success: true, inquiryId: message.inquiryId };
      }),

    escalateAccount: protectedProcedure
      .input(
        z.object({
          userId: z.number().int().positive(),
          action: z.enum(["suspend", "reinstate"]),
          reason: z.string().trim().min(3).max(1000),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db
          .update(users)
          .set({ status: input.action === "suspend" ? "suspended" : "active" })
          .where(eq(users.id, input.userId));
        await db.insert(moderationRecords).values({
          entityType: "conversation",
          entityId: `user:${input.userId}`,
          actorId: ctx.user.id,
          action: `account_${input.action}`,
          reason: input.reason,
        });
        return { success: true };
      }),

    analytics: protectedProcedure
      .input(
        z
          .object({
            from: z.coerce.date().optional(),
            to: z.coerce.date().optional(),
            vendorId: z.number().int().positive().optional(),
            categoryId: z.number().int().positive().optional(),
          })
          .optional()
      )
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const scope = resolveAnalyticsScope(ctx.user.role, null, input?.vendorId);
        return getAdminFunnelAnalytics({ ...scope, ...(input || {}) });
      }),

    featureFlags: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      return getFeatureFlags();
    }),

    setFeatureFlag: protectedProcedure
      .input(
        z.object({ settingKey: z.string().min(2), booleanValue: z.boolean() })
      )
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin")
          throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db
          .insert(systemSettings)
          .values({
            settingKey: input.settingKey,
            booleanValue: input.booleanValue,
          })
          .onDuplicateKeyUpdate({ set: { booleanValue: input.booleanValue } });
        return { success: true };
      }),

    notificationDeliverySummary: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return { byStatus: [], byChannel: [], failedOutbox: 0, webhookFailures: 0 };
      const byStatus = await db
        .select({ status: notificationDeliveries.status, count: sql<number>`count(*)` })
        .from(notificationDeliveries)
        .groupBy(notificationDeliveries.status);
      const byChannel = await db
        .select({ channel: notificationDeliveries.channel, count: sql<number>`count(*)` })
        .from(notificationDeliveries)
        .groupBy(notificationDeliveries.channel);
      const [failedOutbox] = await db
        .select({ count: sql<number>`count(*)` })
        .from(notificationOutbox)
        .where(sql`${notificationOutbox.status} in ('failed', 'dead')`);
      const [webhookFailures] = await db
        .select({ count: sql<number>`count(*)` })
        .from(notificationWebhookEvents)
        .where(eq(notificationWebhookEvents.processingStatus, "failed"));
      return {
        byStatus: byStatus.map(item => ({ ...item, count: Number(item.count) })),
        byChannel: byChannel.map(item => ({ ...item, count: Number(item.count) })),
        failedOutbox: Number(failedOutbox?.count || 0),
        webhookFailures: Number(webhookFailures?.count || 0),
      };
    }),

    notificationDeliveries: protectedProcedure
      .input(z.object({ status: z.enum(["queued", "sent", "delivered", "failed", "bounced", "complained"]).optional() }).optional())
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) return [];
        const filters = input?.status ? [eq(notificationDeliveries.status, input.status)] : [];
        return db
          .select({ delivery: notificationDeliveries, recipientEmail: users.email })
          .from(notificationDeliveries)
          .leftJoin(users, eq(notificationDeliveries.recipientUserId, users.id))
          .where(filters.length ? and(...filters) : undefined)
          .orderBy(desc(notificationDeliveries.updatedAt))
          .limit(100);
      }),

    retryNotificationDelivery: protectedProcedure
      .input(z.object({ deliveryId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const [delivery] = await db
          .select({ id: notificationDeliveries.id, outboxId: notificationDeliveries.outboxId })
          .from(notificationDeliveries)
          .where(eq(notificationDeliveries.id, input.deliveryId))
          .limit(1);
        if (!delivery) throw new TRPCError({ code: "NOT_FOUND", message: "Delivery not found" });
        await db
          .update(notificationDeliveries)
          .set({ status: "queued", nextAttemptAt: new Date(), failureCode: null, failureReason: null })
          .where(eq(notificationDeliveries.id, input.deliveryId));
        if (delivery.outboxId) {
          await db
            .update(notificationOutbox)
            .set({ status: "queued", availableAt: new Date(), lockedAt: null, lockToken: null, leaseExpiresAt: null, lastError: null })
            .where(eq(notificationOutbox.id, delivery.outboxId));
        }
        return { success: true };
      }),

    notificationWebhookEvents: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return [];
      return db.select().from(notificationWebhookEvents).orderBy(desc(notificationWebhookEvents.receivedAt)).limit(100);
    }),

    notificationSuppressions: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return [];
      return db.select().from(notificationSuppressions).where(eq(notificationSuppressions.active, true)).orderBy(desc(notificationSuppressions.suppressedAt)).limit(100);
    }),

    requeueNotificationOutbox: protectedProcedure
      .input(z.object({ outboxId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const [updated] = await db
          .update(notificationOutbox)
          .set({ status: "queued", availableAt: new Date(), lockedAt: null, lockToken: null, leaseExpiresAt: null, lastError: null })
          .where(and(eq(notificationOutbox.id, input.outboxId), inArray(notificationOutbox.status, ["failed", "dead"] as const)));
        if (!updated || updated.affectedRows === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Failed or dead outbox item not found" });
        }
        await db.insert(moderationRecords).values({
          entityType: "notification",
          entityId: String(input.outboxId),
          actorId: ctx.user.id,
          action: "notification_outbox_requeued",
        });
        return { success: true };
      }),

    releaseNotificationSuppression: protectedProcedure
      .input(z.object({ suppressionId: z.number().int().positive(), releaseReason: z.string().trim().min(2).max(255) }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const [updated] = await db
          .update(notificationSuppressions)
          .set({ active: false, releasedAt: new Date(), releaseReason: input.releaseReason })
          .where(and(eq(notificationSuppressions.id, input.suppressionId), eq(notificationSuppressions.active, true)));
        if (!updated || updated.affectedRows === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Active suppression not found" });
        }
        await db.insert(moderationRecords).values({
          entityType: "notification",
          entityId: String(input.suppressionId),
          actorId: ctx.user.id,
          action: "notification_suppression_released",
          reason: input.releaseReason,
        });
        return { success: true };
      }),

    emailDeliveryPause: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return { paused: false };
      const [setting] = await db.select({ booleanValue: systemSettings.booleanValue }).from(systemSettings).where(eq(systemSettings.settingKey, "email_delivery_paused")).limit(1);
      return { paused: setting?.booleanValue === true };
    }),

    setEmailDeliveryPaused: protectedProcedure
      .input(z.object({ paused: z.boolean(), reason: z.string().trim().min(2).max(255) }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db
          .insert(systemSettings)
          .values({ settingKey: "email_delivery_paused", booleanValue: input.paused, description: input.reason })
          .onDuplicateKeyUpdate({ set: { booleanValue: input.paused, description: input.reason } });
        await db.insert(moderationRecords).values({
          entityType: "notification",
          entityId: "email_delivery",
          actorId: ctx.user.id,
          action: input.paused ? "email_delivery_paused" : "email_delivery_resumed",
          reason: input.reason,
        });
        return { success: true, paused: input.paused };
      }),

    verificationSessions: protectedProcedure
      .input(
        z
          .object({
            status: z
              .enum(["created", "submitted", "in_review", "approved", "declined", "expired", "abandoned"])
              .optional(),
            countryCode: z.enum(["US", "CA", "MX"]).optional(),
            provider: z.enum(["veriff", "sumsub", "manual"]).optional(),
            sessionType: z.enum(["identity_document", "liveness", "proof_of_residence", "combined_na_vendor"]).optional(),
            reviewerId: z.number().int().positive().optional(),
          })
          .optional()
      )
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) return [];
        const conditions = [];
        if (input?.status) conditions.push(eq(vendorVerificationSessions.status, input.status));
        if (input?.countryCode) conditions.push(eq(vendorVerificationSessions.countryCode, input.countryCode));
        if (input?.provider) conditions.push(eq(vendorVerificationSessions.provider, input.provider));
        if (input?.sessionType) conditions.push(eq(vendorVerificationSessions.sessionType, input.sessionType));
        if (input?.reviewerId) conditions.push(eq(vendorVerificationSessions.reviewedBy, input.reviewerId));
        return db
          .select({
            session: vendorVerificationSessions,
            vendor: vendorProfiles,
            applicant: users,
          })
          .from(vendorVerificationSessions)
          .innerJoin(vendorProfiles, eq(vendorVerificationSessions.vendorId, vendorProfiles.id))
          .innerJoin(users, eq(vendorVerificationSessions.userId, users.id))
          .where(conditions.length ? and(...conditions) : undefined)
          .orderBy(desc(vendorVerificationSessions.createdAt))
          .limit(100);
      }),

    reviewVerificationSession: protectedProcedure
      .input(
        z.object({
          sessionId: z.number().int().positive(),
          action: z.enum(["approve", "decline"]),
          reviewerNotes: z.string().trim().max(2000).optional(),
          declinedReason: z.string().trim().max(500).optional(),
          countryCode: z.enum(["US", "CA", "MX"]).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const [session] = await db
          .select()
          .from(vendorVerificationSessions)
          .where(eq(vendorVerificationSessions.id, input.sessionId))
          .limit(1);
        if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Verification session not found" });
        const reviewedAt = new Date();
        const isApproval = input.action === "approve";
        const status = isApproval ? "approved" : "declined";
        await db
          .update(vendorVerificationSessions)
          .set({
            status,
            reviewedBy: ctx.user.id,
            reviewedAt,
            reviewerNotes: input.reviewerNotes || null,
            declinedReason: !isApproval ? input.declinedReason || "Requirements not met" : null,
            updatedAt: reviewedAt,
          })
          .where(eq(vendorVerificationSessions.id, session.id));
        const country = input.countryCode || (session.countryCode as "US" | "CA" | "MX" | null);
        await db
          .update(vendorProfiles)
          .set({
            identityStatus: isApproval ? "verified" : "rejected",
            identityVerifiedAt: isApproval ? reviewedAt : null,
            residenceStatus: isApproval && country ? "verified" : "rejected",
            residenceCountry: country || null,
            residenceVerifiedAt: isApproval && country ? reviewedAt : null,
            updatedAt: reviewedAt,
          })
          .where(eq(vendorProfiles.id, session.vendorId));
        await db.insert(moderationRecords).values({
          entityType: "vendor",
          entityId: String(session.id),
          actorId: ctx.user.id,
          action: `verification_${status}`,
          reason: input.reviewerNotes || input.declinedReason,
        });
        return { success: true, status };
      }),

    leadConversionSummary: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return computeLeadFunnel([]);
      const inqRows = await db.select({ leadStage: inquiries.leadStage }).from(inquiries);
      return computeLeadFunnel(inqRows.map(r => r.leadStage as LeadStage));
    }),
  }),
});

export type AppRouter = typeof appRouter;
import { storagePut } from "./storage";
