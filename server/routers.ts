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
  getListingReviews,
  getRelatedListings,
  getStorefrontBySlug,
  getUserByEmail,
  getPublicVendorContacts,
  getVendorProfileByUserId,
  recordAnalyticsEvent,
  searchListings,
  toPublicVendorProfile,
} from "./db";
import { getAdminFunnelAnalytics, getLeadFunnelAnalytics, getVendorFunnelAnalytics, resolveAnalyticsScope } from "./analytics";
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
  vendorVerificationDecisions,
  vendorVerificationSessions,
  savedSearches,
  savedSearchMatches,
  inquiryLeadHistory,
  verificationChallenges,
} from "../drizzle/schema";
import { and, desc, eq, gt, gte, inArray, isNull, like, lt, lte, ne, or, sql } from "drizzle-orm";
import {
  clearAuthCookie,
  hashPassword,
  publicUser,
  issueAuthSession,
  revokeRequestSession,
  verifyPassword,
} from "./jwtAuth";
import { accountEmailSchema, checkLoginAttempt, enforceAuthRateLimit, isDuplicateEmailError, newPasswordSchema, setAccountStatus } from "./accountSecurity";
import { authSessions } from "../drizzle/schema";
import { accountOnboarding, accountResetTokens } from "../drizzle/schema";
import { accountProcedures, queuePasswordReset, removeOwnedAvatar, vendorReady } from "./accountFlows";
import { isSafeAvatar, TERMS_VERSION } from "./accountPolicy";
import { adminPhoneCountryProcedures } from "./phoneCountries";
import { registrationProcedures } from "./registration";
import { adminEmailPolicyProcedures } from "./emailPolicy";
import { isInquiryOpen } from "./inquiryWorkflow";
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
import { pageInput, pagination } from "../shared/pagination";
import { buyerWishlist, buyerSavedSearches, portalReviews, portalVendorId, vendorListings, buyerInquiries, vendorInquiries, conversationMessages } from "./portalCollections";
import { getVendorTrustSignalsBatch, getVendorVerificationBadgesBatch } from "./vendorTrust";
import { enqueueListingPublication } from "./savedSearchService";
import { selectVerificationAdapter } from "./vendorVerificationAdapters";
import { randomUUID } from "node:crypto";
import { cleanupVendorOrphans, deleteUnreferencedMedia, encodePublicImage, lockVendor, mediaKey, uploadVendorImage, validateMedia } from "./vendorMedia";
import { evidenceDownloadUrl } from "./privateEvidence";
import { publicListingEligibility } from "./publicEligibility";
import { accountSummaryColumns } from "./responseProjections";
import { createMarketplaceInquiry, replyToMarketplaceInquiry, toggleMarketplaceWishlist, transitionMarketplaceInquiry } from "./marketplaceIntegrity";
import { reviewManualVerification } from "./verificationDecisions";
import { assertManualSessionReviewable, sessionChecks } from "./verificationPolicy";
import { adminEvidenceRetentionProcedures } from "./evidenceRetention";
import { recoverNotificationDelivery } from "./notificationRecovery";
import { adminReportingProcedures, analyticsFilterSchema } from "./reporting";
import { adminSiteContentProcedures, publicSiteContentProcedures } from "./siteContent";
import { adminManagementProcedures, categoryInputSchema, directorySchema, listingStatusSchema } from "./adminManagement";
import {
  storageDelete,
  storagePut,
} from "./storage";

const INQUIRY_CREATE_WINDOW_MS = 10 * 60_000;
const INQUIRY_CREATE_LIMIT = 8;
const priceBoundSchema = z.number().nonnegative().max(9_999_999_999.99).multipleOf(0.01);

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
          email: accountEmailSchema,
          password: z.string().min(1).max(1024),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const user = await getUserByEmail(input.email);
        await checkLoginAttempt(db, input.email, getRequestIp(ctx.req), async () => {
          // Missing accounts also run bcrypt and follow the same failure policy.
          const valid = await verifyPassword(input.password, user?.passwordHash ?? "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy");
          return Boolean(user?.passwordHash && valid);
        });
        if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });

        if (user.status !== "active") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Your account is suspended. Contact support for assistance.",
          });
        }

        await issueAuthSession(user, ctx.res);

        const vendorProfile = await getVendorProfileByUserId(user.id);
        return {
          user: {
            ...publicUser(user),
            vendorProfile: vendorProfile || null,
          },
        };
      }),

    ...registrationProcedures,

    updateProfile: protectedProcedure
      .input(
        z.object({
          name: z.string().trim().min(2).max(255).optional(),
          firstName: z.string().trim().min(1).max(100).optional(),
          lastName: z.string().trim().min(1).max(100).optional(),
          avatarUrl: z.string().max(1024).refine(isSafeAvatar, "Use an HTTPS image URL or upload an avatar.").nullable().optional(),
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
        await enforceAuthRateLimit(db, "profile_save", String(ctx.user.id), 30, 60 * 60_000);
        const oldAvatar = await db.transaction(async tx => {
        const [oldUser] = await tx.select().from(users).where(eq(users.id, ctx.user.id)).for("update");
        if (!oldUser || oldUser.status !== "active") throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in again." });
        if (input.avatarUrl?.startsWith("/media/") && input.avatarUrl !== oldUser.avatarUrl) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Use the avatar upload control for stored images." });
        }
        await tx.update(users).set({
            ...(input.name ? { name: input.name } : {}),
            ...(input.firstName ? { firstName: input.firstName } : {}),
            ...(input.lastName ? { lastName: input.lastName } : {}),
            ...(input.firstName || input.lastName ? { name: `${input.firstName ?? oldUser.firstName ?? ""} ${input.lastName ?? oldUser.lastName ?? ""}`.trim() } : {}),
            ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
            ...(input.notificationPreferences
              ? { notificationPreferences: input.notificationPreferences }
              : {}),
            updatedAt: new Date(),
          })
          .where(eq(users.id, ctx.user.id));
        return oldUser.avatarUrl;
        });
        if (input.avatarUrl !== undefined && input.avatarUrl !== oldAvatar) await removeOwnedAvatar(oldAvatar, ctx.user.id);

        const updated = await db
          .select()
          .from(users)
          .where(eq(users.id, ctx.user.id))
          .limit(1);
        return updated[0] ? publicUser(updated[0]) : null;
      }),

    logout: publicProcedure.mutation(async ({ ctx }) => {
      await revokeRequestSession(ctx.req);
      clearAuthCookie(ctx.res);

      return { success: true } as const;
    }),

    changePassword: protectedProcedure
      .input(
        z.object({
          currentPassword: z.string().min(1).max(1024),
          newPassword: newPasswordSchema,
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
        await enforceAuthRateLimit(db, "change_password", String(ctx.user.id), 10, 15 * 60_000);
        if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Current password is incorrect",
          });
        }
        const passwordHash = await hashPassword(input.newPassword);
        await db.transaction(async tx => {
          const [current] = await tx.select().from(users).where(eq(users.id, ctx.user.id)).for("update");
          if (!current || current.passwordHash !== user.passwordHash || current.status !== "active") {
            throw new TRPCError({ code: "UNAUTHORIZED", message: "Account changed. Please sign in again." });
          }
          await tx.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, ctx.user.id));
          await tx.delete(authSessions).where(eq(authSessions.userId, ctx.user.id));
          await tx.delete(accountResetTokens).where(eq(accountResetTokens.userId, ctx.user.id));
          await tx.update(verificationChallenges).set({ consumedAt: new Date() }).where(and(
            eq(verificationChallenges.userId, ctx.user.id), eq(verificationChallenges.purpose, "email_change"), isNull(verificationChallenges.consumedAt)
          ));
        });
        clearAuthCookie(ctx.res);
        return { success: true };
      }),

    ...accountProcedures,
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
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
        const filters = [eq(notifications.recipientUserId, ctx.user.id)];
        if (input.unreadOnly) filters.push(isNull(notifications.readAt));
        if (input.cursor) filters.push(lt(notifications.id, input.cursor));
        if (input.notificationType) {
          filters.push(eq(notifications.notificationType, input.notificationType as typeof notifications.notificationType.enumValues[number]));
        }
        const rows = await db
          .select()
          .from(notifications)
          .where(and(...filters))
          .orderBy(desc(notifications.id))
          .limit(input.limit + 1);
        const items = rows.slice(0, input.limit);
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
          nextCursor: rows.length > input.limit ? items.at(-1)!.id : null,
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
          emailSavedSearches: z.boolean().optional(),
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
    list: publicProcedure.input(pageInput.extend({ query: z.string().trim().max(160).optional() }).optional()).query(async ({ input }) => {
      const result = await getAllVendors(input ?? pageInput.parse({}));
      const ids = result.items.map(vendor => vendor.id);
      const [trust, badges] = await Promise.all([getVendorTrustSignalsBatch(ids), getVendorVerificationBadgesBatch(ids)]);
      return { ...result, items: result.items.map(vendor => ({
        ...vendor, trust: trust.get(vendor.id), badges: badges.get(vendor.id),
      })) };
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
          minPrice: priceBoundSchema.optional(),
          maxPrice: priceBoundSchema.optional(),
          currency: z.enum(["USD", "CAD"]).default("USD"),
          remote: z.boolean().optional(),
          verified: z.boolean().optional(),
          sort: z.enum(["newest", "oldest", "title", "price_low", "price_high"]).optional(),
          page: z.number().int().min(1).max(10000).default(1),
          pageSize: z.number().int().min(1).max(48).default(12),
        }).refine(value => value.minPrice === undefined || value.maxPrice === undefined || value.minPrice <= value.maxPrice, "Minimum price must not exceed maximum price.")
      )
      .query(async ({ input }) => {
        return searchListings(input);
      }),

    getListing: publicProcedure
      .input(z.object({ slug: z.string(), preview: z.boolean().optional() }))
      .query(async ({ ctx, input }) => {
        if (input.preview && !ctx.user?.emailVerifiedAt) throw new TRPCError({ code: "FORBIDDEN", message: "Sign in with a verified owner or administrator account to preview." });
        const item = await getListingBySlug(input.slug, ctx.user?.emailVerifiedAt ? ctx.user.id : undefined,
          input.preview && ctx.user ? ctx.user : undefined);
        if (!item)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Listing not found",
          });
        return item;
      }),

    reviews: publicProcedure
      .input(pageInput.extend({ listingId: z.number().int().positive() }))
      .query(async ({ input }) => getListingReviews(input.listingId, input)),

    revealContact: publicProcedure
      .input(
        z.object({
          listingId: z.number().int().positive(),
          turnstileToken: z.string().max(2048).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await enforceAuthRateLimit(db, "contact_ip", getRequestIp(ctx.req), 30, 60_000);
        const [listing] = await db
          .select({ id: listings.id, vendorId: listings.vendorId })
          .from(listings)
          .innerJoin(vendorProfiles, eq(listings.vendorId, vendorProfiles.id))
          .innerJoin(users, eq(vendorProfiles.userId, users.id))
          .where(
            and(
              eq(listings.id, input.listingId),
              publicListingEligibility()
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
          userId: ctx.user?.id,
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
          listingId: z.number().int().positive(),
          categoryId: z.number().int().positive(),
          limit: z.number().int().min(1).max(24).default(4),
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
      .input(pageInput.extend({ slug: z.string(), preview: z.boolean().optional() }))
      .query(async ({ ctx, input }) => {
        if (input.preview && !ctx.user?.emailVerifiedAt) throw new TRPCError({ code: "FORBIDDEN", message: "Sign in with a verified owner or administrator account to preview." });
        const item = await getStorefrontBySlug(input.slug, input.preview && ctx.user ? ctx.user : undefined, input);
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
    wishlist: protectedProcedure.input(pageInput.optional()).query(({ ctx, input }) =>
      buyerWishlist(ctx.user.id, input ?? pageInput.parse({}))),

    toggleWishlist: protectedProcedure
      .input(z.object({ listingId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        return toggleMarketplaceWishlist(db, ctx.user.id, input.listingId);
      }),

    viewHistory: protectedProcedure.input(pageInput.optional()).query(async ({ ctx, input }) =>
      getViewHistory(ctx.user.id, input ?? pageInput.parse({}))
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

    reviews: protectedProcedure.input(pageInput.optional()).query(async ({ ctx, input }) =>
      portalReviews(ctx.user.id, false, input ?? pageInput.parse({}))),

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
        await requireVerifiedContacts(db, ctx.user.id, { email: true });
        await requireTurnstile(db, ctx.req, ctx.user.id, input.turnstileToken, "submit_review");
        return db.transaction(async tx => {
        await tx.select({ id: users.id }).from(users).where(eq(users.id, ctx.user.id)).for("update");
        const [listing] = await tx
          .select({ id: listings.id, vendorId: listings.vendorId, status: listings.status })
          .from(listings)
          .where(and(eq(listings.id, input.listingId), publicListingEligibility()))
          .limit(1);
        if (!listing || listing.status !== "published") {
          throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" });
        }
        const [priorContact] = await tx.select({ id: inquiries.id }).from(inquiries)
          .innerJoin(vendorProfiles, eq(vendorProfiles.id, inquiries.vendorId))
          .where(and(eq(inquiries.buyerId, ctx.user.id), eq(inquiries.vendorId, listing.vendorId),
            ne(vendorProfiles.userId, ctx.user.id))).limit(1);
        if (!priorContact) throw new TRPCError({
          code: "FORBIDDEN", message: "Send this vendor an inquiry before submitting a review.",
        });
        const existing = await tx
          .select({ id: reviews.id })
          .from(reviews)
          .where(and(eq(reviews.listingId, input.listingId), eq(reviews.buyerId, ctx.user.id)))
          .limit(1);
        if (existing.length) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "You have already reviewed this listing" });
        }
        const [created] = await tx.insert(reviews).values({
          listingId: listing.id,
          vendorId: listing.vendorId,
          buyerId: ctx.user.id,
          rating: input.rating,
          comment: input.comment || null,
          status: "pending",
        });
        await tx.insert(analyticsEvents).values({
          eventType: "submit_review",
          userId: ctx.user.id,
          vendorId: listing.vendorId,
          listingId: listing.id,
          metadata: { rating: input.rating },
        });
        return { reviewId: created.insertId, status: "pending" as const };
        });
      }),

    inquiries: protectedProcedure.input(pageInput.extend({ inquiryId: z.number().int().positive().optional() }).optional())
      .query(({ ctx, input }) => buyerInquiries(ctx.user.id, input ?? pageInput.parse({}))),

    messages: protectedProcedure.input(pageInput.extend({ inquiryId: z.number().int().positive() }))
      .query(({ ctx, input }) => conversationMessages(ctx.user.id, input)),

    createInquiry: protectedProcedure
      .input(
        z.object({
          listingId: z.number().int().positive(),
          subject: z.string().trim().min(2).max(255),
          message: z.string().trim().min(2).max(4000),
          clientRequestId: z.string().min(1).max(64).optional(),
          turnstileToken: z.string().max(2048).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await requireVerifiedContacts(db, ctx.user.id, { email: true });
        await requireTurnstile(db, ctx.req, ctx.user.id, input.turnstileToken, "create_inquiry");
        await enforceAuthRateLimit(db, "inquiry_create", String(ctx.user.id), INQUIRY_CREATE_LIMIT, INQUIRY_CREATE_WINDOW_MS);

        return createMarketplaceInquiry(db, ctx.user.id, input);
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

        return replyToMarketplaceInquiry(db, ctx.user.id, input);
      }),

    closeInquiry: protectedProcedure
      .input(z.object({ inquiryId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        return transitionMarketplaceInquiry(db, ctx.user.id, input.inquiryId, "close");
      }),

    reopenInquiry: protectedProcedure
      .input(z.object({ inquiryId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        return transitionMarketplaceInquiry(db, ctx.user.id, input.inquiryId, "reopen");
      }),

    archiveInquiry: protectedProcedure
      .input(z.object({ inquiryId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        return transitionMarketplaceInquiry(db, ctx.user.id, input.inquiryId, "archive");
      }),

    unarchiveInquiry: protectedProcedure
      .input(z.object({ inquiryId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        return transitionMarketplaceInquiry(db, ctx.user.id, input.inquiryId, "unarchive");
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

    savedSearches: protectedProcedure.input(pageInput.optional()).query(({ ctx, input }) =>
      buyerSavedSearches(ctx.user.id, input ?? pageInput.parse({}))),

    createSavedSearch: protectedProcedure
      .input(
        z.object({
          name: z.string().trim().min(2).max(140),
          query: z.string().trim().max(255).optional(),
          categoryId: z.number().int().positive().optional(),
          listingType: z.enum(["product", "service"]).optional(),
          location: z.string().trim().max(160).optional(),
          minPrice: priceBoundSchema.optional(),
          maxPrice: priceBoundSchema.optional(),
          currency: z.enum(["USD", "CAD"]).default("USD"),
          remoteOnly: z.boolean().default(false),
          verifiedVendorOnly: z.boolean().default(false),
          alertFrequency: z.enum(["immediate", "daily", "off"]).default("off"),
        }).refine(value => value.minPrice === undefined || value.maxPrice === undefined || value.minPrice <= value.maxPrice, "Minimum price must not exceed maximum price.")
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        if (input.categoryId) {
          const [category] = await db.select().from(categories).where(and(eq(categories.id, input.categoryId), eq(categories.isActive, true)));
          if (!category) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active category." });
        }
        const [res] = await db.insert(savedSearches).values({
          userId: ctx.user.id,
          name: input.name,
          query: input.query || null,
          categoryId: input.categoryId || null,
          listingType: input.listingType || null,
          location: input.location || null,
          minPrice: input.minPrice !== undefined ? input.minPrice.toFixed(2) : null,
          maxPrice: input.maxPrice !== undefined ? input.maxPrice.toFixed(2) : null,
          currency: input.currency,
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
    uploadImage: protectedProcedure.input(z.object({ fileBase64: z.string().max(7_000_000) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await enforceAuthRateLimit(db, "vendor_image", String(ctx.user.id), 40, 60 * 60_000);
        const bytes = await encodePublicImage(input.fileBase64);
        return db.transaction(async tx => {
          const profile = await lockVendor(tx, ctx.user.id);
          if (profile.approvalStatus === "suspended" || profile.approvalStatus === "rejected") throw new TRPCError({ code: "FORBIDDEN", message: "Vendor account is restricted." });
          await cleanupVendorOrphans(tx, profile.id);
          return uploadVendorImage(profile.id, bytes);
        });
      }),

    discardImage: protectedProcedure.input(z.object({ url: z.string().max(1024) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        return db.transaction(async tx => {
          const profile = await lockVendor(tx, ctx.user.id);
          const key = mediaKey(input.url);
          return { deleted: key ? await deleteUnreferencedMedia(tx, profile.id, [key]) : 0 };
        });
      }),

    cleanupImages: protectedProcedure.mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.transaction(async tx => cleanupVendorOrphans(tx, (await lockVendor(tx, ctx.user.id)).id));
    }),

    saveStorefrontMedia: protectedProcedure.input(z.object({
      logoUrl: z.string().max(1024).nullable(),
      coverUrl: z.string().max(1024).nullable(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const result = await db.transaction(async tx => {
        const profile = await lockVendor(tx, ctx.user.id);
        if (profile.approvalStatus === "suspended" || profile.approvalStatus === "rejected") throw new TRPCError({ code: "FORBIDDEN", message: "Vendor account is restricted." });
        const [store] = await tx.select().from(storefronts).where(eq(storefronts.vendorId, profile.id)).for("update");
        if (!store) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Save your business profile first." });
        const logo = input.logoUrl ? await validateMedia(input.logoUrl, profile.id, [store.logoUrl ?? ""]) : null;
        const cover = input.coverUrl ? await validateMedia(input.coverUrl, profile.id, [store.coverUrl ?? ""]) : null;
        await tx.update(storefronts).set({
          logoUrl: logo?.url ?? null, logoStorageKey: logo?.storageKey ?? null,
          coverUrl: cover?.url ?? null, coverStorageKey: cover?.storageKey ?? null,
        }).where(eq(storefronts.id, store.id));
        return { vendorId: profile.id, oldKeys: [store.logoStorageKey, store.coverStorageKey].filter((key): key is string => !!key) };
      });
      try {
        await db.transaction(async tx => {
          await lockVendor(tx, ctx.user.id);
          await deleteUnreferencedMedia(tx, result.vendorId, result.oldKeys);
        });
      } catch (error) { console.error("[Media] Replaced storefront image cleanup failed", error); }
      return { success: true };
    }),
    getProfile: protectedProcedure.query(async ({ ctx }) => {
      return getVendorProfileByUserId(ctx.user.id);
    }),

    saveProfile: protectedProcedure
      .input(
        z.object({
          businessName: z.string().trim().min(2).max(180).optional(),
          headline: z.string().trim().max(255).nullable().optional(),
          description: z.string().trim().max(10000).optional(),
          location: z.string().max(160).optional(),
          serviceArea: z.string().max(240).optional(),
          remoteAvailable: z.boolean().optional(),
          contactEmail: z.string().email().nullable().optional(),
          phone: z.string().max(80).nullable().optional(),
          whatsapp: z.string().max(80).nullable().optional(),
          imessage: z.string().max(120).nullable().optional(),
          instagram: z.string().max(120).nullable().optional(),
          website: z.string().url().refine(value => new URL(value).protocol === "https:", "Use HTTPS.").nullable().optional(),
          standardsAcknowledged: z.boolean().default(false),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await db.transaction(async tx => {
          const { user, onboarding } = await vendorReady(tx, ctx.user.id);
          const [profile] = await tx.select().from(vendorProfiles).where(eq(vendorProfiles.userId, user.id)).for("update");
          if (!profile) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Complete identity onboarding first." });
          const description = input.description ?? profile.description;
          const location = input.location ?? profile.location;
          if (!onboarding.completedAt && (!description?.trim() || !location?.trim() || !input.standardsAcknowledged)) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Add a business description, location and accept the community standards." });
          }
          // Omitted fields are undefined and therefore preserved by Drizzle updates.
          const { standardsAcknowledged, headline, ...profileInput } = input;
          const restricted = profile.approvalStatus === "suspended" || profile.approvalStatus === "rejected";
          await tx.update(vendorProfiles).set({
            ...profileInput, approvalStatus: restricted ? profile.approvalStatus : "approved",
            approvedAt: profile.approvedAt ?? new Date(),
            standardsAcknowledgedAt: standardsAcknowledged ? new Date() : profile.standardsAcknowledgedAt,
          }).where(eq(vendorProfiles.id, profile.id));
          if (user.role !== "admin") await tx.update(users).set({ role: "vendor" }).where(eq(users.id, user.id));
          const sf = {
            displayName: input.businessName, headline, description: input.description, location: input.location,
            serviceArea: input.serviceArea, remoteAvailable: input.remoteAvailable, website: input.website,
          };
          const [existingSf] = await tx.select().from(storefronts).where(eq(storefronts.vendorId, profile.id)).for("update");
          if (existingSf) await tx.update(storefronts).set(sf).where(eq(storefronts.id, existingSf.id));
          else await tx.insert(storefronts).values({
            ...sf, displayName: input.businessName ?? profile.businessName, description, location,
            serviceArea: input.serviceArea ?? profile.serviceArea, remoteAvailable: input.remoteAvailable ?? profile.remoteAvailable,
            website: input.website === undefined ? profile.website : input.website, vendorId: profile.id,
            slug: `${(input.businessName ?? profile.businessName).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "vendor"}-${profile.id}`,
          });
          await tx.update(accountOnboarding).set({ completedAt: onboarding.completedAt ?? new Date() }).where(eq(accountOnboarding.userId, user.id));
        });
        return getVendorProfileByUserId(ctx.user.id);
      }),

    archiveListing: protectedProcedure.input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        return db.transaction(async tx => {
          const profile = await lockVendor(tx, ctx.user.id);
          const [listing] = await tx.select({ id: listings.id, status: listings.status }).from(listings)
            .where(and(eq(listings.id, input.id), eq(listings.vendorId, profile.id))).for("update");
          if (!listing) throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found." });
          if (listing.status !== "archived") {
            const [updated] = await tx.update(listings).set({ status: "archived" })
              .where(and(eq(listings.id, listing.id), eq(listings.vendorId, profile.id)));
            if (!updated.affectedRows) throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found." });
            await tx.insert(moderationRecords).values({
              entityType: "listing", entityId: String(listing.id), actorId: ctx.user.id,
              action: "owner_archived", reason: "Owner removed listing from discovery; inquiries, reviews and media retained.",
            });
          }
          return { id: listing.id, status: "archived" as const, success: true };
        });
      }),

    listings: protectedProcedure.input(pageInput.optional()).query(async ({ ctx, input }) => {
      return vendorListings(await portalVendorId(ctx.user.id), input ?? pageInput.parse({}));
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

    reviews: protectedProcedure.input(pageInput.optional()).query(async ({ ctx, input }) => {
      return portalReviews(await portalVendorId(ctx.user.id) ?? 0, true, input ?? pageInput.parse({}));
    }),

    saveListing: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive().optional(),
          title: z.string().min(2).max(220),
          description: z.string().min(10),
          categoryId: z.number().int().positive(),
          listingType: z.enum(["product", "service"]),
          priceIndication: z.string().optional(),
          location: z.string().optional(),
          remoteAvailable: z.boolean().default(false),
          status: z
            .enum(["draft", "published", "hidden", "archived"])
            .default("draft"),
          media: z
            .array(
              z.string().max(1024)
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

        const result = await db.transaction(async tx => {
          const lockedProfile = await lockVendor(tx, ctx.user.id);
          if (lockedProfile.approvalStatus !== "approved") throw new TRPCError({ code: "FORBIDDEN", message: "Approved vendor profile required." });
          const [category] = await tx.select().from(categories).where(and(eq(categories.id, input.categoryId), eq(categories.isActive, true)));
          if (!category) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an available category." });
          const [owned] = input.id ? await tx.select().from(listings)
            .where(and(eq(listings.id, input.id), eq(listings.vendorId, profile.id))).for("update") : [];
          if (input.id && !owned) throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found." });
          const oldMedia = owned ? await tx.select().from(listingMedia).where(eq(listingMedia.listingId, owned.id)) : [];
          const validated = input.media === undefined ? undefined : await Promise.all(input.media.map(url => validateMedia(url, profile.id, oldMedia.map(item => item.url))));
          if (owned) {
          const { id: _id, media: _media, turnstileToken: _turnstileToken, ...listingFields } = input;
          const [updated] = await tx
            .update(listings)
            .set({
              ...listingFields,
              storefrontId: profile.storefront?.id || null,
              publishedAt: input.status === "published" && owned.status !== "published" ? new Date() : owned.publishedAt,
            })
            .where(
              and(eq(listings.id, owned.id), eq(listings.vendorId, profile.id))
            );
          if (!updated.affectedRows) throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found." });
          if (validated !== undefined) {
            await tx
              .delete(listingMedia)
              .where(eq(listingMedia.listingId, owned.id));
            if (validated.length > 0) {
              await tx.insert(listingMedia).values(validated.map((item, sortOrder) => ({ ...item, listingId: owned.id, sortOrder })));
            }
          }
          if (input.status === "published" && owned.status !== "published") await enqueueListingPublication(tx, owned.id, ctx.user.id);
          return { id: owned.id, success: true, obsoleteKeys: oldMedia.map(item => item.storageKey).filter((key): key is string => !!key) };
        } else {
          const uniqueSlug = `${slug}-${randomUUID().slice(0, 8)}`;
          const [res] = await tx.insert(listings).values({
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
          if (validated?.length) {
            await tx.insert(listingMedia).values(validated.map((item, sortOrder) => ({ ...item, listingId: res.insertId, sortOrder })));
          }
          if (input.status === "published") await enqueueListingPublication(tx, res.insertId, ctx.user.id);
          return { id: res.insertId, slug: uniqueSlug, success: true, obsoleteKeys: [] as string[] };
        }
        });
        try {
          await db.transaction(async tx => {
            await lockVendor(tx, ctx.user.id);
            await deleteUnreferencedMedia(tx, profile.id, result.obsoleteKeys);
          });
        } catch (error) { console.error("[Media] Replaced listing image cleanup failed", error); }
        const { obsoleteKeys: _keys, ...response } = result;
        return response;
      }),

    inquiries: protectedProcedure.input(pageInput.extend({ inquiryId: z.number().int().positive().optional() }).optional()).query(async ({ ctx, input }) => {
      return vendorInquiries(ctx.user.id, await portalVendorId(ctx.user.id), input ?? pageInput.parse({}));
    }),

    messages: protectedProcedure.input(pageInput.extend({ inquiryId: z.number().int().positive() }))
      .query(({ ctx, input }) => conversationMessages(ctx.user.id, input)),

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
        return replyToMarketplaceInquiry(db, ctx.user.id, input, profile.id);
      }),

    closeInquiry: protectedProcedure
      .input(z.object({ inquiryId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const profile = await getVendorProfileByUserId(ctx.user.id);
        if (!profile) throw new TRPCError({ code: "FORBIDDEN", message: "Vendor profile required" });
        return transitionMarketplaceInquiry(db, ctx.user.id, input.inquiryId, "close", profile.id);
      }),

    reopenInquiry: protectedProcedure
      .input(z.object({ inquiryId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const profile = await getVendorProfileByUserId(ctx.user.id);
        if (!profile) throw new TRPCError({ code: "FORBIDDEN", message: "Vendor profile required" });
        return transitionMarketplaceInquiry(db, ctx.user.id, input.inquiryId, "reopen", profile.id);
      }),

    archiveInquiry: protectedProcedure
      .input(z.object({ inquiryId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const profile = await getVendorProfileByUserId(ctx.user.id);
        if (!profile) throw new TRPCError({ code: "FORBIDDEN", message: "Vendor profile required" });
        return transitionMarketplaceInquiry(db, ctx.user.id, input.inquiryId, "archive", profile.id);
      }),

    unarchiveInquiry: protectedProcedure
      .input(z.object({ inquiryId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const profile = await getVendorProfileByUserId(ctx.user.id);
        if (!profile) throw new TRPCError({ code: "FORBIDDEN", message: "Vendor profile required" });
        return transitionMarketplaceInquiry(db, ctx.user.id, input.inquiryId, "unarchive", profile.id);
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

    verificationStatus: protectedProcedure.input(pageInput.optional()).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      const [profile] = await db.select().from(vendorProfiles).where(eq(vendorProfiles.userId, ctx.user.id)).limit(1);
      if (!profile) return null;
      const page = input ?? pageInput.parse({});
      const scope = eq(vendorVerificationSessions.vendorId, profile.id);
      const [count] = await db.select({ total: sql<number>`count(*)` }).from(vendorVerificationSessions).where(scope);
      const sessions = await db
        .select()
        .from(vendorVerificationSessions)
        .where(scope)
        .orderBy(desc(vendorVerificationSessions.createdAt), desc(vendorVerificationSessions.id))
        .limit(page.pageSize).offset((page.page - 1) * page.pageSize);
      const sanitizedSessions = sessions.map(s => ({
        id: s.id,
        provider: s.provider,
        sessionType: s.sessionType,
        status: s.status,
        countryCode: s.countryCode,
        expiresAt: s.expiresAt,
        createdAt: s.createdAt,
        declinedReason: s.declinedReason,
        canUpload: s.provider === "manual" && ["created", "submitted", "in_review"].includes(s.status) &&
          Boolean(s.expiresAt && s.expiresAt > new Date()),
      }));
      const badges = await getVendorVerificationBadges(profile.id);
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
        pagination: pagination(Number(count.total), page),
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
          provider: z.enum(["didit", "manual"]).default("didit"),
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
        if (input.provider === "manual" && input.sessionType === "liveness") throw new TRPCError({
          code: "BAD_REQUEST", message: "Manual documents cannot verify liveness. Use hosted Didit.",
        });
        const adapter = selectVerificationAdapter(input.provider);
        if (!adapter.isConfigured()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This verification provider is not configured." });
        return db.transaction(async tx => {
        await tx.select({ id: users.id }).from(users).where(eq(users.id, ctx.user.id)).for("update");
        const [lockedProfile] = await tx.select().from(vendorProfiles).where(eq(vendorProfiles.id, profile.id)).for("update");
        if (["suspended", "rejected"].includes(lockedProfile.approvalStatus)) throw new TRPCError({ code: "FORBIDDEN", message: "Vendor account is restricted." });
        const checks = sessionChecks(input.sessionType);
        const [onboarding] = await tx.select().from(accountOnboarding).where(eq(accountOnboarding.userId, ctx.user.id));
        if (checks.includes("identity") && onboarding?.kycSessionId) throw new TRPCError({
          code: "PRECONDITION_FAILED", message: "Manage account identity through the onboarding flow or contact support for corrections. Start a residence-only check here.",
        });
        const active = await tx.select().from(vendorVerificationSessions).where(and(
          eq(vendorVerificationSessions.vendorId, profile.id), inArray(vendorVerificationSessions.status, ["created", "submitted", "in_review"]),
          gt(vendorVerificationSessions.expiresAt, new Date())
        ));
        if (active.some(session => sessionChecks(session.sessionType).some(check => checks.includes(check)))) throw new TRPCError({
          code: "CONFLICT", message: "A current session already covers this check. Complete it or wait until it expires.",
        });
        let sessionResult;
        try { sessionResult = await adapter.createSession({
          vendorId: profile.id,
          userId: ctx.user.id,
          sessionType: input.sessionType,
          countryCode: input.countryCode,
          firstName: ctx.user.name?.split(" ")[0] || "Vendor",
          lastName: ctx.user.name?.split(" ").slice(1).join(" ") || "Applicant",
        }); } catch (error) {
          console.error("[Verification] Hosted session creation failed", error instanceof Error ? error.name : "Error");
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Verification provider unavailable. Retry later.", cause: error });
        }
        const [created] = await tx.insert(vendorVerificationSessions).values({
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
        await tx
          .update(vendorProfiles)
          .set({
            ...(checks.includes("identity") && lockedProfile.identityStatus !== "verified" ? {
              identityStatus: "pending" as const, identityVerificationSessionId: created.insertId,
            } : {}),
            ...(checks.includes("residence") && lockedProfile.residenceStatus !== "verified" ? {
              residenceStatus: "pending" as const, residenceVerificationSessionId: created.insertId,
            } : {}),
          })
          .where(eq(vendorProfiles.id, profile.id));
        return {
          sessionId: created.insertId,
          providerSessionId: sessionResult.providerSessionId,
          verificationUrl: sessionResult.verificationUrl,
          status: sessionResult.status,
        };
        });
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
          fileBase64: z.string().min(16).max(7_000_000),
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
              eq(vendorVerificationSessions.vendorId, profile.id),
              eq(vendorVerificationSessions.userId, ctx.user.id)
            )
          )
          .limit(1);
        if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Verification session not found" });
        assertManualSessionReviewable(session);
        if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.fileBase64)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid document encoding" });
        }
        const fileBuffer = Buffer.from(input.fileBase64, "base64");
        if (!fileBuffer.length || fileBuffer.length > 5 * 1024 * 1024) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Document must be 5 MB or smaller" });
        }
        const extension = input.filename.toLowerCase().split(".").pop();
        const fileTypes: Record<string, { mimeType: string; matches: (data: Buffer) => boolean }> = {
          pdf: {
            mimeType: "application/pdf",
            matches: data => data.subarray(0, 5).toString() === "%PDF-",
          },
          png: {
            mimeType: "image/png",
            matches: data =>
              data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
          },
          jpg: {
            mimeType: "image/jpeg",
            matches: data => data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff,
          },
          jpeg: {
            mimeType: "image/jpeg",
            matches: data => data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff,
          },
        };
        const fileType = extension ? fileTypes[extension] : undefined;
        if (!fileType || !fileType.matches(fileBuffer)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Upload a valid PDF, PNG, or JPEG document",
          });
        }
        const storageKey = `private/verification/${session.id}/${randomUUID()}.${extension}`;
        try {
          await storagePut(storageKey, fileBuffer, fileType.mimeType);
        } catch (storageError) {
          console.error("[Verification] Private evidence upload failed:", storageError);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Document could not be securely stored. Please try again.",
          });
        }
        const retentionExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
        const summary = sanitizeEvidenceSummary(input.filename, input.evidenceType);
        try {
          const evidenceId = await db.transaction(async tx => {
            const [current] = await tx.select().from(vendorVerificationSessions).where(eq(vendorVerificationSessions.id, session.id)).for("update");
            assertManualSessionReviewable(current);
            const documents = await tx.select({ id: vendorVerificationEvidence.id }).from(vendorVerificationEvidence)
              .where(eq(vendorVerificationEvidence.sessionId, session.id));
            if (documents.length >= 10) throw new TRPCError({ code: "BAD_REQUEST", message: "A session supports at most 10 documents. Contact support." });
            const [created] = await tx.insert(vendorVerificationEvidence).values({
              sessionId: session.id,
              evidenceType: input.evidenceType,
              fileStoragePath: storageKey,
              redactedSummary: summary,
              retentionExpiresAt,
            });
            await tx
              .update(vendorVerificationSessions)
              .set({ status: "in_review", updatedAt: new Date() })
              .where(eq(vendorVerificationSessions.id, session.id));
            return created.insertId;
          });
          return { evidenceId, summary, status: "in_review" as const };
        } catch (databaseError) {
          try {
            await storageDelete(storageKey);
          } catch (cleanupError) {
            console.error("[Verification] Failed to clean up orphaned evidence:", cleanupError);
          }
          throw databaseError;
        }
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

    leadFunnel: protectedProcedure.input(analyticsFilterSchema.omit({ vendorId: true }).optional()).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return computeLeadFunnel([]);
      const profile = await getVendorProfileByUserId(ctx.user.id);
      if (!profile) return computeLeadFunnel([]);
      return getLeadFunnelAnalytics({ ...input, vendorId: profile.id });
    }),
  }),

  siteContent: router(publicSiteContentProcedures),
  admin: router({
    ...adminManagementProcedures,
    ...adminSiteContentProcedures,
    ...adminReportingProcedures,
    ...adminEvidenceRetentionProcedures,
    ...adminEmailPolicyProcedures,
    ...adminPhoneCountryProcedures,
    pendingVendors: protectedProcedure.input(directorySchema.extend({
      status: z.enum(["pending", "approved", "rejected", "suspended"]).optional(),
    }).optional()).query(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return [];

      return db
        .select({
          vendor: vendorProfiles,
          user: { id: users.id, name: users.name, email: users.email, status: users.status },
        })
        .from(vendorProfiles)
        .innerJoin(users, eq(vendorProfiles.userId, users.id))
        .where(and(
          input?.query ? or(like(vendorProfiles.businessName, `%${input.query.replace(/[\\%_]/g, "\\$&")}%`), like(users.email, `%${input.query.replace(/[\\%_]/g, "\\$&")}%`)) : undefined,
          input?.status ? eq(vendorProfiles.approvalStatus, input.status) : undefined,
        ))
        .orderBy(desc(vendorProfiles.createdAt), desc(vendorProfiles.id)).limit(25).offset(((input?.page ?? 1) - 1) * 25);
    }),

    decideVendor: protectedProcedure
      .input(
        z.object({
          vendorId: z.number(),
          status: z.enum(["approved", "rejected", "suspended"]),
          reason: z.string().trim().min(3).max(1000),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin")
          throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await db.transaction(async tx => {
          const [reference] = await tx.select().from(vendorProfiles).where(eq(vendorProfiles.id, input.vendorId));
          if (!reference) throw new TRPCError({ code: "NOT_FOUND", message: "Vendor not found." });
          if (input.status === "approved") await vendorReady(tx, reference.userId);
          else await tx.select({ id: users.id }).from(users).where(eq(users.id, reference.userId)).for("update");
          const [profile] = await tx.select().from(vendorProfiles).where(eq(vendorProfiles.id, input.vendorId)).for("update");
          if (input.status === "approved") {
            const [onboarding] = await tx.select().from(accountOnboarding).where(eq(accountOnboarding.userId, profile.userId));
            if (!onboarding?.completedAt) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The vendor must finish storefront onboarding first." });
          }
          await tx.update(vendorProfiles).set({
            approvalStatus: input.status, approvedAt: input.status === "approved" ? profile.approvedAt ?? new Date() : profile.approvedAt,
          }).where(eq(vendorProfiles.id, input.vendorId));
          await tx.insert(moderationRecords).values({
            entityType: "vendor", entityId: String(input.vendorId), actorId: ctx.user.id,
            action: input.status === "approved" ? "vendor_reenabled" : "vendor_suspended", reason: input.reason,
          });
        if (profile.approvalStatus !== input.status) {
          await enqueueNotificationEvent(tx, {
            eventType: input.status === "approved" ? "VENDOR_APPROVED" : input.status === "rejected" ? "VENDOR_REJECTED" : "VENDOR_STATUS_CHANGED",
            idempotencyKey: `vendor_${input.status}:${input.vendorId}:${Date.now()}`,
            recipientUserId: profile.userId,
            actorUserId: ctx.user.id,
            entityType: "vendor",
            entityId: input.vendorId,
            payload: {
              vendorId: input.vendorId,
              businessName: profile.businessName,
              status: input.status,
              actionUrl: "/vendor",
            },
          });
        }
        });
        return { success: true };
      }),

    categories: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return [];
      return db.select().from(categories).orderBy(categories.sortOrder);
    }),

    saveCategory: protectedProcedure
      .input(categoryInputSchema)
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin")
          throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { id, ...values } = input;
        return db.transaction(async tx => {
          const all = await tx.select().from(categories).orderBy(categories.id).for("update");
          if (id && !all.some(row => row.id === id)) throw new TRPCError({ code: "NOT_FOUND", message: "Category not found." });
          if (all.some(row => row.slug === values.slug && row.id !== id)) throw new TRPCError({ code: "CONFLICT", message: "Category slug already exists." });
          let categoryId = id;
          if (categoryId) await tx.update(categories).set(values).where(eq(categories.id, categoryId));
          else { const [result] = await tx.insert(categories).values(values); categoryId = result.insertId; }
          await tx.insert(moderationRecords).values({ entityType: "category", entityId: String(categoryId), actorId: ctx.user.id,
            action: id ? "category_updated" : "category_created", reason: JSON.stringify(values) });
          return { id: categoryId, success: true };
        });
      }),

    users: protectedProcedure.input(directorySchema.extend({
      role: z.enum(["buyer", "vendor", "admin"]).optional(),
      status: z.enum(["active", "suspended"]).optional(),
    }).optional()).query(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      return getAllUsersForAdmin(input);
    }),

    updateUserStatus: protectedProcedure
      .input(
        z.object({
          userId: z.number().int().positive(),
          status: z.enum(["active", "suspended"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin")
          throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await setAccountStatus(db, input.userId, input.status, {
          actorId: ctx.user.id, action: `account_${input.status}`, reason: "Administrator account status update.",
        });
        return { success: true };
      }),

    listings: protectedProcedure.input(directorySchema.extend({ status: listingStatusSchema.optional() }).optional()).query(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const allListings = await getAllListingsForAdmin(input);
      return allListings.map(item => ({
        ...item,
        quality: evaluateListingQuality({
          title: item.listing.title,
          description: item.listing.description,
          priceIndication: item.listing.priceIndication,
          location: item.listing.location,
          categoryId: item.listing.categoryId,
          vendorApproved: item.vendor.approvalStatus === "approved",
          mediaCount: item.mediaCount,
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
          buyer: accountSummaryColumns,
          buyerReviewCountRecent: sql<number>`(select count(*) from reviews recent where recent.buyerId = ${reviews.buyerId} and recent.createdAt between date_sub(${reviews.createdAt}, interval 1 day) and date_add(${reviews.createdAt}, interval 1 day))`,
          sameCommentCount: sql<number>`case when trim(coalesce(${reviews.comment}, '')) = '' then 0 else (select count(*) from reviews duplicate_review where lower(trim(duplicate_review.comment)) = lower(trim(${reviews.comment}))) end`,
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
          buyerReviewCountRecent: Number(item.buyerReviewCountRecent),
          sameCommentCount: Number(item.sameCommentCount),
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
        return db.transaction(async tx => {
        const [reviewRecord] = await tx.select().from(reviews).where(eq(reviews.id, input.reviewId)).for("update");
        if (!reviewRecord) throw new TRPCError({ code: "NOT_FOUND", message: "Review not found." });
        if (reviewRecord.status === input.status) return { success: true, status: input.status };
        await tx
          .update(reviews)
          .set({ status: input.status })
          .where(eq(reviews.id, input.reviewId));
        await tx.insert(moderationRecords).values({
          entityType: "review",
          entityId: String(input.reviewId),
          actorId: ctx.user.id,
          action: `review_${input.status}`,
          reason: input.reason || null,
        });

        if (reviewRecord && (input.status === "approved" || input.status === "rejected")) {
          await enqueueNotificationEvent(tx, {
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
        });
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
        return db.transaction(async tx => {
        const [existing] = await tx.select({ id: disputes.id }).from(disputes).where(eq(disputes.id, input.disputeId)).for("update");
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Dispute not found." });
        await tx
          .update(disputes)
          .set({ status: input.status, resolution: input.resolution })
          .where(eq(disputes.id, input.disputeId));
        await tx.insert(moderationRecords).values({
          entityType: "dispute",
          entityId: String(input.disputeId),
          actorId: ctx.user.id,
          action: input.status,
          reason: input.resolution,
        });
        return { success: true };
        });
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
        const result = await db.transaction(async tx => {
        const [existing] = await tx.select().from(listings).where(eq(listings.id, input.listingId)).for("update");
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found." });
        if (existing.status === input.status) return { success: true };
        await tx
          .update(listings)
          .set({
            status: input.status,
            publishedAt: input.status === "published" ? new Date() : existing.publishedAt,
          })
          .where(eq(listings.id, input.listingId));
        await tx.insert(moderationRecords).values({
          entityType: "listing",
          entityId: String(input.listingId),
          actorId: ctx.user.id,
          action: input.status,
          reason: input.reason,
        });
        if (input.status === "published") await enqueueListingPublication(tx, input.listingId, ctx.user.id);
        return { success: true };
        });
        return result;
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
            reporter: accountSummaryColumns,
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
          .select({ message: messages, sender: accountSummaryColumns })
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
          resumeConversation: z.boolean().default(false),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        if (input.suspendConversation && input.resumeConversation) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose restrict or restore, not both." });
        return db.transaction(async tx => {
        const [report] = await tx
          .select({ report: conversationReports, inquiry: inquiries })
          .from(conversationReports)
          .innerJoin(inquiries, eq(conversationReports.inquiryId, inquiries.id))
          .where(eq(conversationReports.id, input.reportId))
          .limit(1).for("update");
        if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "Report not found" });
        if (input.linkedDisputeId) {
          const [dispute] = await tx.select().from(disputes).where(and(
            eq(disputes.id, input.linkedDisputeId), eq(disputes.buyerId, report.inquiry.buyerId), eq(disputes.vendorId, report.inquiry.vendorId)
          ));
          if (!dispute) throw new TRPCError({ code: "BAD_REQUEST", message: "The linked dispute must belong to this buyer and vendor." });
        }
        await tx
          .update(conversationReports)
          .set({
            status: input.status,
            resolutionNote: input.resolutionNote || null,
            linkedDisputeId: input.linkedDisputeId,
            reviewedBy: ctx.user.id,
            reviewedAt: new Date(),
          })
          .where(eq(conversationReports.id, input.reportId));
        if (input.suspendConversation || input.resumeConversation) {
          await tx
            .update(inquiries)
            .set({ moderatorSuspendedAt: input.suspendConversation ? new Date() : null, updatedAt: new Date() })
            .where(eq(inquiries.id, report.inquiry.id));
        }
        await tx.insert(moderationRecords).values({
          entityType: "conversation",
          entityId: String(report.inquiry.id),
          actorId: ctx.user.id,
          action: input.suspendConversation ? "conversation_restricted" : input.resumeConversation ? "conversation_restored" : `report_${input.status}`,
          reason: input.resolutionNote,
        });
        return { success: true };
        });
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
        return db.transaction(async tx => {
        const [message] = await tx
          .select({ id: messages.id, inquiryId: messages.inquiryId })
          .from(messages)
          .where(eq(messages.id, input.messageId))
          .limit(1).for("update");
        if (!message) throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });
        await tx
          .update(messages)
          .set({
            isHidden: input.hidden,
            hiddenAt: input.hidden ? new Date() : null,
            hiddenBy: input.hidden ? ctx.user.id : null,
            hiddenReason: input.hidden ? input.reason || null : null,
          })
          .where(eq(messages.id, input.messageId));
        await tx.insert(moderationRecords).values({
          entityType: "message",
          entityId: String(input.messageId),
          actorId: ctx.user.id,
          action: input.hidden ? "message_hidden" : "message_restored",
          reason: input.reason,
        });
        return { success: true, inquiryId: message.inquiryId };
        });
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
        await setAccountStatus(db, input.userId, input.action === "suspend" ? "suspended" : "active", {
          actorId: ctx.user.id,
          action: `account_${input.action}`,
          reason: input.reason,
        });
        return { success: true };
      }),

    requestAccountReset: protectedProcedure.input(z.object({ userId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const [account] = await db.select({ email: users.email, status: users.status }).from(users).where(eq(users.id, input.userId));
        if (!account?.email || account.status !== "active") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "An active account with an email is required." });
        await enforceAuthRateLimit(db, "reset_email", account.email, 3, 60 * 60_000);
        await queuePasswordReset(db, account.email, ctx.user.id);
        return { message: "A recovery link has been queued to the account email. No password or session has been changed." };
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
        await db.transaction(async tx => {
        await tx
          .insert(systemSettings)
          .values({
            settingKey: input.settingKey,
            booleanValue: input.booleanValue,
          })
          .onDuplicateKeyUpdate({ set: { booleanValue: input.booleanValue } });
        await tx.insert(moderationRecords).values({ entityType: "site_content", entityId: input.settingKey.slice(0, 64),
          actorId: ctx.user.id, action: "feature_flag_changed", reason: JSON.stringify(input) });
        });
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
      .input(z.object({
        deliveryId: z.number().int().positive(),
        reconciliation: z.object({
          outcome: z.enum(["sent", "not_sent"]), notes: z.string().trim().min(3).max(1000),
          providerMessageId: z.string().trim().min(1).max(255).optional(),
        }).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        if (input.reconciliation && !ctx.user.emailVerifiedAt) throw new TRPCError({ code: "FORBIDDEN", message: "A verified administrator is required to reconcile provider outcomes." });
        return recoverNotificationDelivery(db, ctx.user.id, input.deliveryId, input.reconciliation);
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
        await db.transaction(async tx => {
        const [job] = await tx.select().from(notificationOutbox).where(eq(notificationOutbox.id, input.outboxId)).for("update");
        if (!job || !["failed", "dead"].includes(job.status)) throw new TRPCError({ code: "NOT_FOUND", message: "Failed or dead outbox item not found." });
        const [uncertain] = await tx.select({ id: notificationDeliveries.id }).from(notificationDeliveries).where(and(
          eq(notificationDeliveries.outboxId, job.id),
          inArray(notificationDeliveries.failureCode, ["send_in_progress", "send_outcome_unknown"])
        )).limit(1);
        if (uncertain) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Use delivery reconciliation after checking the provider. Do not blindly retry an uncertain send." });
        const [updated] = await tx
          .update(notificationOutbox)
          .set({ status: "queued", availableAt: new Date(), lockedAt: null, lockToken: null, leaseExpiresAt: null, lastError: null })
          .where(and(eq(notificationOutbox.id, input.outboxId), inArray(notificationOutbox.status, ["failed", "dead"] as const)));
        if (!updated || updated.affectedRows === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Failed or dead outbox item not found" });
        }
        await tx.insert(moderationRecords).values({
          entityType: "notification",
          entityId: String(input.outboxId),
          actorId: ctx.user.id,
          action: "notification_outbox_requeued",
        });
        });
        return { success: true };
      }),

    releaseNotificationSuppression: protectedProcedure
      .input(z.object({ suppressionId: z.number().int().positive(), releaseReason: z.string().trim().min(2).max(255) }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.transaction(async tx => {
        const [updated] = await tx
          .update(notificationSuppressions)
          .set({ active: false, releasedAt: new Date(), releaseReason: input.releaseReason })
          .where(and(eq(notificationSuppressions.id, input.suppressionId), eq(notificationSuppressions.active, true)));
        if (!updated || updated.affectedRows === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Active suppression not found" });
        }
        await tx.insert(moderationRecords).values({
          entityType: "notification",
          entityId: String(input.suppressionId),
          actorId: ctx.user.id,
          action: "notification_suppression_released",
          reason: input.releaseReason,
        });
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
        await db.transaction(async tx => {
        await tx
          .insert(systemSettings)
          .values({ settingKey: "email_delivery_paused", booleanValue: input.paused, description: input.reason })
          .onDuplicateKeyUpdate({ set: { booleanValue: input.paused, description: input.reason } });
        await tx.insert(moderationRecords).values({
          entityType: "notification",
          entityId: "email_delivery",
          actorId: ctx.user.id,
          action: input.paused ? "email_delivery_paused" : "email_delivery_resumed",
          reason: input.reason,
        });
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
            provider: z.enum(["didit", "veriff", "sumsub", "manual"]).optional(),
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
        const rows = await db
          .select({
            session: vendorVerificationSessions,
            vendor: vendorProfiles,
            applicant: accountSummaryColumns,
          })
          .from(vendorVerificationSessions)
          .innerJoin(vendorProfiles, eq(vendorVerificationSessions.vendorId, vendorProfiles.id))
          .innerJoin(users, eq(vendorVerificationSessions.userId, users.id))
          .where(conditions.length ? and(...conditions) : undefined)
          .orderBy(desc(vendorVerificationSessions.createdAt))
          .limit(100);
        return Promise.all(
          rows.map(async row => {
            const evidence = await db
              .select()
              .from(vendorVerificationEvidence)
              .where(eq(vendorVerificationEvidence.sessionId, row.session.id));
            const decisions = await db.select().from(vendorVerificationDecisions).where(eq(vendorVerificationDecisions.sessionId, row.session.id));
            return {
              ...row,
              decisions,
              evidence: await Promise.all(
                evidence.map(async item => ({
                  id: item.id,
                  evidenceType: item.evidenceType,
                  summary: item.redactedSummary,
                  expiresAt: item.retentionExpiresAt,
                  legalHoldAt: item.legalHoldAt,
                  legalHoldReason: item.legalHoldReason,
                  signedUrl: !item.deletedAt && item.retentionExpiresAt && item.retentionExpiresAt > new Date() ? await evidenceDownloadUrl(item.id, ctx.user.id) : null,
                }))
              ),
            };
          })
        );
      }),

    reviewVerificationSession: protectedProcedure
      .input(
        z.object({
          sessionId: z.number().int().positive(),
          action: z.enum(["approve", "decline"]),
          checkType: z.enum(["identity", "residence"]).optional(),
          reviewerNotes: z.string().trim().max(1000).optional(),
          declinedReason: z.string().trim().max(500).optional(),
          countryCode: z.enum(["US", "CA", "MX"]).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        if (!ctx.user.emailVerifiedAt) throw new TRPCError({ code: "FORBIDDEN", message: "A verified administrator is required." });
        return reviewManualVerification(db, ctx.user.id, input);
      }),

    leadConversionSummary: protectedProcedure.input(analyticsFilterSchema.optional()).query(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return computeLeadFunnel([]);
      return getLeadFunnelAnalytics(input ?? {});
    }),
  }),
});

export type AppRouter = typeof appRouter;
