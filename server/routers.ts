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
  getVendorAnalytics,
  getVendorProfileByUserId,
  getVendorReviews,
  recordAnalyticsEvent,
  searchListings,
} from "./db";
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
  wishlists,
} from "../drizzle/schema";
import { and, desc, eq } from "drizzle-orm";
import {
  clearAuthCookie,
  hashPassword,
  publicUser,
  setAuthCookie,
  signToken,
  verifyPassword,
} from "./jwtAuth";

const contactRevealAttempts = new Map<string, number[]>();
const CONTACT_REVEAL_WINDOW_MS = 60_000;
const CONTACT_REVEAL_LIMIT = 5;

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
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

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
  }),

  categories: router({
    list: publicProcedure.query(async () => {
      return getCategories();
    }),
  }),

  vendors: router({
    list: publicProcedure.query(async () => {
      return getAllVendors();
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

    revealContact: publicProcedure
      .input(
        z.object({
          listingId: z.number().int().positive(),
          anonymousSessionId: z.string().max(128).optional(),
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
          userId: ctx.user?.id,
          anonymousSessionId: input.anonymousSessionId,
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
        return item;
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
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
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
          return { ...inquiry, listing, vendor, messages: msgs };
        })
      );
    }),

    createInquiry: protectedProcedure
      .input(
        z.object({
          listingId: z.number(),
          subject: z.string().min(2).max(255),
          message: z.string().min(2),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

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

        await recordAnalyticsEvent({
          eventType: "submit_inquiry",
          userId: ctx.user.id,
          vendorId: listingRows[0].vendorId,
          listingId: input.listingId,
        });

        return { id: inqRes.insertId, success: true };
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

        let vendorProfileId: number;
        if (existing.length > 0) {
          vendorProfileId = existing[0].id;
          await db
            .update(vendorProfiles)
            .set({
              ...input,
              approvalStatus: "pending",
            })
            .where(eq(vendorProfiles.id, vendorProfileId));
        } else {
          const [res] = await db.insert(vendorProfiles).values({
            userId: ctx.user.id,
            ...input,
            approvalStatus: "pending",
          });
          vendorProfileId = res.insertId;
        }

        // Update user role to vendor
        await db
          .update(users)
          .set({ role: "vendor" })
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

    analytics: protectedProcedure.query(async ({ ctx }) => {
      const profile = await getVendorProfileByUserId(ctx.user.id);
      if (!profile) {
        return {
          views: 0,
          saves: 0,
          contactReveals: 0,
          inquiries: 0,
          listings: 0,
        };
      }
      return getVendorAnalytics(profile.id);
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

        const slug = input.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");

        if (input.id) {
          const { media: mediaUrls, ...listingFields } = input;
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
          return { ...inquiry, listing, buyer, messages: msgs };
        })
      );
    }),

    replyInquiry: protectedProcedure
      .input(
        z.object({
          inquiryId: z.number(),
          message: z.string().min(1),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const [msgRes] = await db.insert(messages).values({
          inquiryId: input.inquiryId,
          senderId: ctx.user.id,
          body: input.message,
        });

        await db
          .update(inquiries)
          .set({ updatedAt: new Date() })
          .where(eq(inquiries.id, input.inquiryId));

        return { id: msgRes.insertId, success: true };
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
      return getAllListingsForAdmin();
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
  }),
});

export type AppRouter = typeof appRouter;
