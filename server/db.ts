import { and, desc, eq, gte, inArray, like, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  categories,
  accountOnboarding,
  analyticsEvents,
  disputes,
  inquiries,
  listingMedia,
  listings,
  listingViews,
  messages,
  reviews,
  storefronts,
  systemSettings,
  users,
  vendorProfiles,
  wishlists,
  InsertUser,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { normalizeEmail } from "./contactVerification";
import { publicListingEligibility, publicVendorEligibility } from "./publicEligibility";
import { publicVendorColumns } from "./responseProjections";
import { TRPCError } from "@trpc/server";
import { numericPriceExpressions } from "./discoverySql";
import { validateDiscoveryBounds } from "../shared/discoveryFilters";
import { pagination, type PageInput } from "../shared/pagination";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getListingMediaBatch(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, ids: number[]) {
  const grouped = new Map<number, (typeof listingMedia.$inferSelect)[]>();
  if (!ids.length) return grouped;
  const rows = await db.select().from(listingMedia).where(inArray(listingMedia.listingId, ids))
    .orderBy(listingMedia.sortOrder, listingMedia.id);
  for (const row of rows) {
    const items = grouped.get(row.listingId) ?? [];
    items.push(row);
    grouped.set(row.listingId, items);
  }
  return grouped;
}

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};

  const textFields = ["name", "email", "loginMethod"] as const;
  textFields.forEach(field => {
    if (user[field] !== undefined) {
      const value = field === "email" && user[field] ? normalizeEmail(user[field]) : user[field] ?? null;
      values[field] = value;
      updateSet[field] = value;
    }
  });

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }

  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  const existing = await getUserByOpenId(user.openId);
  if (existing) {
    await db.update(users).set(updateSet).where(eq(users.id, existing.id));
  } else {
    await db.insert(users).values(values);
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);
  return result[0];
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizeEmail(email)))
    .limit(1);
  return result[0];
}

export async function getVendorProfileByUserId(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(vendorProfiles)
    .where(eq(vendorProfiles.userId, userId))
    .limit(1);
  if (!result[0]) return undefined;
  const sf = await db
    .select()
    .from(storefronts)
    .where(eq(storefronts.vendorId, result[0].id))
    .limit(1);
  const [onboarding] = await db.select({ completedAt: accountOnboarding.completedAt }).from(accountOnboarding)
    .where(eq(accountOnboarding.userId, userId));
  return { ...result[0], storefront: sf[0] || null, onboardingCompletedAt: onboarding?.completedAt ?? null };
}

export async function getAllVendors(input: PageInput & { query?: string } = { page: 1, pageSize: 20 }) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
  const scope = and(publicVendorEligibility(), input.query
    ? sql`(locate(${input.query.toLowerCase()}, lower(${vendorProfiles.businessName})) > 0 or locate(${input.query.toLowerCase()}, lower(${vendorProfiles.description})) > 0)` : undefined);
  const [count] = await db.select({ total: sql<number>`count(*)` }).from(vendorProfiles).where(scope);
  const vendors = await db
    .select({
      vendor: vendorProfiles,
      user: users,
      storefront: storefronts,
      listingCount: sql<number>`(select count(*) from ${listings} where ${listings.vendorId} = ${vendorProfiles.id} and ${publicListingEligibility()})`,
    })
    .from(vendorProfiles)
    .innerJoin(users, eq(vendorProfiles.userId, users.id))
    .leftJoin(storefronts, eq(vendorProfiles.id, storefronts.vendorId))
    .where(scope)
    .orderBy(desc(vendorProfiles.approvedAt), desc(vendorProfiles.id))
    .limit(input.pageSize).offset((input.page - 1) * input.pageSize);

  const ids = vendors.map(row => row.vendor.id);
  const ranked = db.select({
    id: listings.id,
    rank: sql<number>`row_number() over (partition by ${listings.vendorId} order by ${listings.publishedAt} desc, ${listings.id} desc)`.as("sample_rank"),
  }).from(listings).where(and(ids.length ? inArray(listings.vendorId, ids) : sql`false`, publicListingEligibility())).as("ranked");
  const samples = ids.length ? await db.select({ listing: listings }).from(listings)
    .innerJoin(ranked, eq(ranked.id, listings.id)).where(sql`${ranked.rank} <= 6`)
    .orderBy(desc(listings.publishedAt), desc(listings.id)) : [];
  return {
    items: vendors.map(({ vendor, user, storefront, listingCount }) => {
      return {
        ...toPublicVendorProfile(vendor),
        user: { name: user.name, avatarUrl: user.avatarUrl },
        storefront,
        listingCount: Number(listingCount),
        sampleListings: samples.filter(row => row.listing.vendorId === vendor.id).map(row => row.listing),
      };
    }),
    pagination: pagination(Number(count.total), input),
  };
}

/**
 * Public vendor projection used by directory, storefront, and buyer-facing
 * discovery responses. Contact channels and verification evidence are exposed
 * only through authenticated contact-reveal or vendor verification flows.
 */
export function toPublicVendorProfile(vendor: typeof vendorProfiles.$inferSelect) {
  return {
    id: vendor.id,
    businessName: vendor.businessName,
    description: vendor.description,
    location: vendor.location,
    serviceArea: vendor.serviceArea,
    remoteAvailable: vendor.remoteAvailable,
    website: vendor.website,
    approvalStatus: vendor.approvalStatus,
    approvedAt: vendor.approvedAt,
  };
}

export async function getCategories() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(categories)
    .where(eq(categories.isActive, true))
    .orderBy(categories.sortOrder);
}

export interface SearchFilters {
  q?: string;
  category?: string;
  type?: "product" | "service";
  location?: string;
  price?: string;
  minPrice?: number;
  maxPrice?: number;
  currency?: "USD" | "CAD";
  remote?: boolean;
  verified?: boolean;
  sort?: "newest" | "oldest" | "title" | "price_low" | "price_high";
  page?: number;
  pageSize?: number;
}

export async function searchListings(filters: SearchFilters = {}) {
  try { validateDiscoveryBounds(filters); }
  catch (error) { throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Invalid search bounds." }); }
  const db = await getDb();
  if (!db)
    return {
      items: [],
      pagination: { total: 0, page: 1, pageSize: 12, totalPages: 1 },
    };

  const page = Math.max(1, filters.page || 1);
  const pageSize = Math.min(48, Math.max(1, filters.pageSize || 12));
  const offset = (page - 1) * pageSize;

  const conditions = [publicListingEligibility()];

  if (filters.category) {
    const cat = await db
      .select()
      .from(categories)
      .where(eq(categories.slug, filters.category))
      .limit(1);
    if (!cat[0]?.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active category." });
    conditions.push(eq(listings.categoryId, cat[0].id));
  }

  if (filters.type) {
    conditions.push(eq(listings.listingType, filters.type));
  }

  if (filters.remote) {
    conditions.push(
      or(eq(listings.remoteAvailable, true), eq(vendorProfiles.remoteAvailable, true))!
    );
  }

  if (filters.verified) {
    conditions.push(eq(vendorProfiles.identityStatus, "verified"), sql`${vendorProfiles.identityVerifiedAt} IS NOT NULL`);
  }

  if (filters.location) {
    conditions.push(sql`LOCATE(${filters.location.trim().toLowerCase()}, LOWER(${listings.location}) COLLATE utf8mb4_bin) > 0`);
  }

  if (filters.price) {
    conditions.push(like(listings.priceIndication, `%${filters.price}%`));
  }

  const numericPrice = numericPriceExpressions();
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined ||
      filters.sort === "price_low" || filters.sort === "price_high") {
    conditions.push(sql`${numericPrice.currency} = ${filters.currency ?? "USD"}`);
  }
  if (filters.minPrice !== undefined) {
    conditions.push(sql`${numericPrice.max} >= ${filters.minPrice}`);
  }
  if (filters.maxPrice !== undefined) {
    conditions.push(sql`${numericPrice.min} <= ${filters.maxPrice}`);
  }

  if (filters.q) {
    const searchTerm = filters.q.trim().toLowerCase();
    conditions.push(
      or(
        sql`LOCATE(${searchTerm}, LOWER(${listings.title}) COLLATE utf8mb4_bin) > 0`,
        sql`LOCATE(${searchTerm}, LOWER(${listings.description}) COLLATE utf8mb4_bin) > 0`
      )!
    );
  }

  const whereClause = and(...conditions);

  const [totalRes] = await db
    .select({ count: sql<number>`count(*)` })
    .from(listings)
    .innerJoin(vendorProfiles, eq(listings.vendorId, vendorProfiles.id))
    .where(whereClause);

  const total = Number(totalRes?.count || 0);

  const orderExpr =
    filters.sort === "price_low" ? numericPrice.min
      : filters.sort === "price_high" ? desc(numericPrice.max)
      : filters.sort === "title"
      ? listings.title
      : filters.sort === "oldest"
        ? listings.publishedAt
        : desc(listings.publishedAt);

  const rows = await db
    .select({
      listing: listings,
      category: categories,
      vendor: vendorProfiles,
      storefront: storefronts,
    })
    .from(listings)
    .innerJoin(categories, eq(listings.categoryId, categories.id))
    .innerJoin(vendorProfiles, eq(listings.vendorId, vendorProfiles.id))
    .leftJoin(storefronts, eq(listings.storefrontId, storefronts.id))
    .where(whereClause)
    .orderBy(orderExpr, filters.sort === "oldest" || filters.sort === "title" || filters.sort === "price_low" ? listings.id : desc(listings.id))
    .limit(pageSize)
    .offset(offset);

  const media = await getListingMediaBatch(db, rows.map(row => row.listing.id));
  const enriched = rows.map(({ listing, category, vendor, storefront }) => {
      return {
        ...listing,
        category,
        vendor: {
          id: vendor.id,
          businessName: vendor.businessName,
          approvalStatus: vendor.approvalStatus,
          location: vendor.location,
          storefront,
        },
        media: media.get(listing.id) ?? [],
      };
    });

  return {
    items: enriched,
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

export async function recordListingView(listingId: number, viewerId?: number) {
  const db = await getDb();
  if (!db) return;

  if (viewerId) {
    const recent = await db
      .select({ id: listingViews.id })
      .from(listingViews)
      .where(
        and(
          eq(listingViews.listingId, listingId),
          eq(listingViews.viewerId, viewerId),
          gte(listingViews.createdAt, new Date(Date.now() - 30 * 60 * 1000))
        )
      )
      .limit(1);
    if (recent.length > 0) return;
  }

  await db.insert(listingViews).values({ listingId, viewerId: viewerId ?? null });
}

export async function getListingBySlug(
  slug: string,
  viewerId?: number,
  previewUser?: { id: number; role: string }
) {
  const db = await getDb();
  if (!db) return null;

  const rows = await db
    .select({
      listing: listings,
      category: categories,
      vendor: vendorProfiles,
      storefront: storefronts,
    })
    .from(listings)
    .innerJoin(categories, eq(listings.categoryId, categories.id))
    .innerJoin(vendorProfiles, eq(listings.vendorId, vendorProfiles.id))
    .leftJoin(storefronts, eq(listings.storefrontId, storefronts.id))
    .where(and(eq(listings.slug, slug), previewUser
      ? previewUser.role === "admin" ? undefined : eq(vendorProfiles.userId, previewUser.id)
      : publicListingEligibility()))
    .limit(1);

  if (!rows[0]) return null;
  const { listing, category, vendor, storefront } = rows[0];

  const media = await db
    .select()
    .from(listingMedia)
    .where(eq(listingMedia.listingId, listing.id))
    .orderBy(listingMedia.sortOrder);

  // Track anonymous views and deduplicated authenticated buyer history.
  if (!previewUser) await recordListingView(listing.id, viewerId);

  return {
    ...listing,
    category,
    vendor: {
      id: vendor.id,
      businessName: vendor.businessName,
      approvalStatus: vendor.approvalStatus,
      location: vendor.location,
      storefront,
    },
    media,
  };
}

export async function getViewHistory(buyerId: number, input: PageInput = { page: 1, pageSize: 20 }) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

  const [count] = await db.select({ total: sql<number>`count(*)` }).from(listingViews)
    .where(eq(listingViews.viewerId, buyerId));
  const rows = await db
    .select({ view: listingViews, listing: listings, category: categories })
    .from(listingViews)
    .innerJoin(listings, eq(listingViews.listingId, listings.id))
    .innerJoin(categories, eq(listings.categoryId, categories.id))
    .where(eq(listingViews.viewerId, buyerId))
    .orderBy(desc(listingViews.createdAt), desc(listingViews.id))
    .limit(input.pageSize).offset((input.page - 1) * input.pageSize);

  const media = await getListingMediaBatch(db, rows.map(row => row.listing.id));
  return {
    items: rows.map(({ view, listing, category }) => ({
      viewedAt: view.createdAt, listing: { ...listing, category, media: media.get(listing.id) ?? [] },
    })),
    pagination: pagination(Number(count.total), input),
  };
}

export async function removeViewHistoryItem(buyerId: number, listingId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(listingViews)
    .where(and(eq(listingViews.viewerId, buyerId), eq(listingViews.listingId, listingId)));
}

export async function clearViewHistory(buyerId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(listingViews).where(eq(listingViews.viewerId, buyerId));
}

export async function getListingReviews(listingId: number, input: PageInput = { page: 1, pageSize: 20 }) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
  const scope = and(eq(reviews.listingId, listingId), eq(reviews.status, "approved"),
    sql`EXISTS (SELECT 1 FROM listings WHERE listings.id = ${reviews.listingId} AND ${publicListingEligibility()})`);
  const [stats] = await db.select({ total: sql<number>`count(*)`, average: sql<number>`avg(${reviews.rating})` })
    .from(reviews).where(scope);
  const rows = await db
    .select({ review: reviews, buyer: { id: users.id, name: users.name, avatarUrl: users.avatarUrl } })
    .from(reviews)
    .innerJoin(users, eq(reviews.buyerId, users.id))
    .where(scope)
    .orderBy(desc(reviews.createdAt), desc(reviews.id)).limit(input.pageSize).offset((input.page - 1) * input.pageSize);
  return { reviews: rows, averageRating: Number(stats.average ?? 0), reviewCount: Number(stats.total),
    pagination: pagination(Number(stats.total), input) };
}

export async function getRelatedListings(
  listingId: number,
  categoryId: number,
  limit = 4
) {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      listing: listings,
      category: categories,
      vendor: vendorProfiles,
      storefront: storefronts,
    })
    .from(listings)
    .innerJoin(categories, eq(listings.categoryId, categories.id))
    .innerJoin(vendorProfiles, eq(listings.vendorId, vendorProfiles.id))
    .leftJoin(storefronts, eq(listings.storefrontId, storefronts.id))
    .where(
      and(
        eq(listings.categoryId, categoryId),
        publicListingEligibility(),
        sql`${listings.id} != ${listingId}`
      )
    )
    .orderBy(desc(listings.publishedAt))
    .limit(limit);

  const media = await getListingMediaBatch(db, rows.map(row => row.listing.id));
  return (
    rows.map(({ listing, category, vendor, storefront }) => {
      return {
        ...listing,
        category,
        vendor: {
          id: vendor.id,
          businessName: vendor.businessName,
          approvalStatus: vendor.approvalStatus,
          location: vendor.location,
          storefront,
        },
        media: media.get(listing.id) ?? [],
      };
    })
  );
}

export async function getStorefrontBySlug(slug: string, previewUser?: { id: number; role: string }, input: PageInput = { page: 1, pageSize: 20 }) {
  const db = await getDb();
  if (!db) return null;

  const sf = await db
    .select()
    .from(storefronts)
    .where(and(eq(storefronts.slug, slug),
      sql`EXISTS (SELECT 1 FROM vendorProfiles WHERE vendorProfiles.id = ${storefronts.vendorId} AND ${previewUser
        ? previewUser.role === "admin" ? sql`true` : eq(vendorProfiles.userId, previewUser.id)
        : publicVendorEligibility()})`))
    .limit(1);
  if (!sf[0]) return null;

  const vendor = await db
    .select()
    .from(vendorProfiles)
    .where(eq(vendorProfiles.id, sf[0].vendorId))
    .limit(1);
  const scope = and(eq(listings.storefrontId, sf[0].id), previewUser ? undefined : publicListingEligibility());
  const [count] = await db.select({ total: sql<number>`count(*)` }).from(listings).where(scope);
  const vendorListings = await db
    .select()
    .from(listings)
    .where(scope).orderBy(desc(listings.publishedAt), desc(listings.id))
    .limit(input.pageSize).offset((input.page - 1) * input.pageSize);

  const media = await getListingMediaBatch(db, vendorListings.map(row => row.id));
  const enrichedListings = vendorListings.map(row => ({ ...row, media: media.get(row.id) ?? [] }));

  return {
    ...sf[0],
    vendor: vendor[0] ? toPublicVendorProfile(vendor[0]) : null,
    listings: enrichedListings,
    pagination: pagination(Number(count.total), input),
  };
}

export async function recordAnalyticsEvent(input: {
  eventType: string;
  userId?: number | null;
  anonymousSessionId?: string | null;
  vendorId?: number | null;
  listingId?: number | null;
  metadata?: Record<string, unknown>;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(analyticsEvents).values({
    eventType: input.eventType,
    userId: input.userId ?? null,
    anonymousSessionId: input.anonymousSessionId ?? null,
    vendorId: input.vendorId ?? null,
    listingId: input.listingId ?? null,
    metadata: input.metadata ?? null,
  });
}

export async function getVendorAnalytics(vendorId: number) {
  const db = await getDb();
  if (!db) {
    return { views: 0, saves: 0, contactReveals: 0, inquiries: 0, listings: 0 };
  }

  const [
    [viewCount],
    [saveCount],
    [contactCount],
    [inquiryCount],
    [listingCount],
  ] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(listingViews)
      .innerJoin(listings, eq(listingViews.listingId, listings.id))
      .where(eq(listings.vendorId, vendorId)),
    db
      .select({ count: sql<number>`count(*)` })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.vendorId, vendorId),
          eq(analyticsEvents.eventType, "save_listing")
        )
      ),
    db
      .select({ count: sql<number>`count(*)` })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.vendorId, vendorId),
          eq(analyticsEvents.eventType, "reveal_contact")
        )
      ),
    db
      .select({ count: sql<number>`count(*)` })
      .from(inquiries)
      .where(eq(inquiries.vendorId, vendorId)),
    db
      .select({ count: sql<number>`count(*)` })
      .from(listings)
      .where(eq(listings.vendorId, vendorId)),
  ]);

  return {
    views: Number(viewCount?.count || 0),
    saves: Number(saveCount?.count || 0),
    contactReveals: Number(contactCount?.count || 0),
    inquiries: Number(inquiryCount?.count || 0),
    listings: Number(listingCount?.count || 0),
  };
}

export async function getPublicVendorContacts(vendorId: number) {
  const db = await getDb();
  if (!db) return null;
  const [vendor] = await db
    .select({
      phone: vendorProfiles.phone,
      whatsapp: vendorProfiles.whatsapp,
      imessage: vendorProfiles.imessage,
      instagram: vendorProfiles.instagram,
      contactEmail: vendorProfiles.contactEmail,
    })
    .from(vendorProfiles)
    .where(and(eq(vendorProfiles.id, vendorId), publicVendorEligibility()))
    .limit(1);
  return vendor || null;
}

export async function getAllUsersForAdmin(input: { query?: string; role?: "buyer" | "vendor" | "admin"; status?: "active" | "suspended"; page?: number } = {}) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      status: users.status,
      avatarUrl: users.avatarUrl,
      createdAt: users.createdAt,
      emailVerifiedAt: users.emailVerifiedAt,
      phoneVerifiedAt: users.phoneVerifiedAt,
      lastSignedIn: users.lastSignedIn,
      signupIntent: users.signupIntent,
    })
    .from(users)
    .where(and(
      input.query ? or(like(users.name, `%${input.query.replace(/[\\%_]/g, "\\$&")}%`), like(users.email, `%${input.query.replace(/[\\%_]/g, "\\$&")}%`)) : undefined,
      input.role ? eq(users.role, input.role) : undefined,
      input.status ? eq(users.status, input.status) : undefined,
    ))
    .orderBy(desc(users.createdAt), desc(users.id)).limit(25).offset(((input.page ?? 1) - 1) * 25);
}

export async function getAllListingsForAdmin(input: { query?: string; status?: typeof listings.$inferSelect.status; page?: number } = {}) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ listing: listings, vendor: vendorProfiles, category: categories,
      mediaCount: sql<number>`(select count(*) from ${listingMedia} where ${listingMedia.listingId} = ${listings.id})`.mapWith(Number) })
    .from(listings)
    .innerJoin(vendorProfiles, eq(listings.vendorId, vendorProfiles.id))
    .innerJoin(categories, eq(listings.categoryId, categories.id))
    .where(and(
      input.query ? or(like(listings.title, `%${input.query.replace(/[\\%_]/g, "\\$&")}%`), like(vendorProfiles.businessName, `%${input.query.replace(/[\\%_]/g, "\\$&")}%`)) : undefined,
      input.status ? eq(listings.status, input.status) : undefined,
    ))
    .orderBy(desc(listings.updatedAt), desc(listings.id)).limit(25).offset(((input.page ?? 1) - 1) * 25);
}

export async function getAllDisputesForAdmin() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      dispute: disputes,
      listing: { id: listings.id, title: listings.title, slug: listings.slug },
      vendor: {
        id: vendorProfiles.id,
        businessName: vendorProfiles.businessName,
      },
      buyer: { id: users.id, name: users.name, email: users.email },
    })
    .from(disputes)
    .leftJoin(listings, eq(disputes.listingId, listings.id))
    .innerJoin(vendorProfiles, eq(disputes.vendorId, vendorProfiles.id))
    .innerJoin(users, eq(disputes.buyerId, users.id))
    .orderBy(desc(disputes.updatedAt));
}

export async function getFeatureFlags() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(systemSettings).orderBy(systemSettings.settingKey);
}
