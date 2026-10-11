import { and, desc, eq, gte, inArray, like, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  categories,
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

let _db: ReturnType<typeof drizzle> | null = null;

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
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
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

  await db
    .insert(users)
    .values(values)
    .onDuplicateKeyUpdate({ set: updateSet });
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
    .where(eq(users.email, email))
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
  return { ...result[0], storefront: sf[0] || null };
}

export async function getAllVendors() {
  const db = await getDb();
  if (!db) return [];
  const vendors = await db
    .select({
      vendor: vendorProfiles,
      user: users,
      storefront: storefronts,
    })
    .from(vendorProfiles)
    .innerJoin(users, eq(vendorProfiles.userId, users.id))
    .leftJoin(storefronts, eq(vendorProfiles.id, storefronts.vendorId))
    .where(eq(vendorProfiles.approvalStatus, "approved"))
    .orderBy(desc(vendorProfiles.approvedAt));

  return Promise.all(
    vendors.map(async ({ vendor, user, storefront }) => {
      const vendorListings = await db
        .select()
        .from(listings)
        .where(
          and(
            eq(listings.vendorId, vendor.id),
            eq(listings.status, "published")
          )
        )
        .limit(6);
      return {
        ...vendor,
        user: { name: user.name, avatarUrl: user.avatarUrl },
        storefront,
        listingCount: vendorListings.length,
        sampleListings: vendorListings,
      };
    })
  );
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
  remote?: boolean;
  verified?: boolean;
  sort?: "newest" | "oldest" | "title" | "price_low" | "price_high";
  page?: number;
  pageSize?: number;
}

export async function searchListings(filters: SearchFilters = {}) {
  const db = await getDb();
  if (!db)
    return {
      items: [],
      pagination: { total: 0, page: 1, pageSize: 12, totalPages: 1 },
    };

  const page = Math.max(1, filters.page || 1);
  const pageSize = Math.min(48, Math.max(1, filters.pageSize || 12));
  const offset = (page - 1) * pageSize;

  const conditions = [eq(listings.status, "published")];

  if (filters.category) {
    const cat = await db
      .select()
      .from(categories)
      .where(eq(categories.slug, filters.category))
      .limit(1);
    if (cat[0]) {
      conditions.push(eq(listings.categoryId, cat[0].id));
    }
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
    conditions.push(eq(vendorProfiles.approvalStatus, "approved"));
  }

  if (filters.location) {
    conditions.push(like(listings.location, `%${filters.location}%`));
  }

  if (filters.price) {
    conditions.push(like(listings.priceIndication, `%${filters.price}%`));
  }

  const numericPrice = sql<number>`CAST(NULLIF(REGEXP_REPLACE(${listings.priceIndication}, '[^0-9.]', ''), '') AS DECIMAL(12,2))`;
  if (filters.minPrice !== undefined) {
    conditions.push(sql`${numericPrice} >= ${filters.minPrice}`);
  }
  if (filters.maxPrice !== undefined) {
    conditions.push(sql`${numericPrice} <= ${filters.maxPrice}`);
  }

  if (filters.q) {
    const searchPattern = `%${filters.q}%`;
    conditions.push(
      or(
        like(listings.title, searchPattern),
        like(listings.description, searchPattern),
        sql`EXISTS (SELECT 1 FROM vendorProfiles vp WHERE vp.id = ${listings.vendorId} AND vp.businessName LIKE ${searchPattern})`
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
    filters.sort === "title"
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
    .orderBy(orderExpr)
    .limit(pageSize)
    .offset(offset);

  // Enrich with media
  const enriched = await Promise.all(
    rows.map(async ({ listing, category, vendor, storefront }) => {
      const media = await db
        .select()
        .from(listingMedia)
        .where(eq(listingMedia.listingId, listing.id))
        .orderBy(listingMedia.sortOrder);

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
    })
  );

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

export async function getListingBySlug(slug: string, viewerId?: number) {
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
    .where(eq(listings.slug, slug))
    .limit(1);

  if (!rows[0]) return null;
  const { listing, category, vendor, storefront } = rows[0];

  const media = await db
    .select()
    .from(listingMedia)
    .where(eq(listingMedia.listingId, listing.id))
    .orderBy(listingMedia.sortOrder);

  // Track anonymous views and deduplicated authenticated buyer history.
  await recordListingView(listing.id, viewerId);

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

export async function getViewHistory(buyerId: number) {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({ view: listingViews, listing: listings, category: categories })
    .from(listingViews)
    .innerJoin(listings, eq(listingViews.listingId, listings.id))
    .innerJoin(categories, eq(listings.categoryId, categories.id))
    .where(eq(listingViews.viewerId, buyerId))
    .orderBy(desc(listingViews.createdAt))
    .limit(30);

  return Promise.all(
    rows.map(async ({ view, listing, category }) => {
      const media = await db
        .select()
        .from(listingMedia)
        .where(eq(listingMedia.listingId, listing.id))
        .orderBy(listingMedia.sortOrder);
      return { viewedAt: view.createdAt, listing: { ...listing, category, media } };
    })
  );
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

export async function getBuyerReviews(buyerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ review: reviews, listing: listings, vendor: vendorProfiles })
    .from(reviews)
    .innerJoin(listings, eq(reviews.listingId, listings.id))
    .innerJoin(vendorProfiles, eq(reviews.vendorId, vendorProfiles.id))
    .where(eq(reviews.buyerId, buyerId))
    .orderBy(desc(reviews.createdAt));
}

export async function getListingReviews(listingId: number) {
  const db = await getDb();
  if (!db) return { reviews: [], averageRating: 0, reviewCount: 0 };
  const rows = await db
    .select({ review: reviews, buyer: { id: users.id, name: users.name, avatarUrl: users.avatarUrl } })
    .from(reviews)
    .innerJoin(users, eq(reviews.buyerId, users.id))
    .where(and(eq(reviews.listingId, listingId), eq(reviews.status, "approved")))
    .orderBy(desc(reviews.createdAt));
  const averageRating = rows.length
    ? rows.reduce((sum, row) => sum + row.review.rating, 0) / rows.length
    : 0;
  return { reviews: rows, averageRating, reviewCount: rows.length };
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
        eq(listings.status, "published"),
        sql`${listings.id} != ${listingId}`
      )
    )
    .orderBy(desc(listings.publishedAt))
    .limit(limit);

  return Promise.all(
    rows.map(async ({ listing, category, vendor, storefront }) => {
      const media = await db
        .select()
        .from(listingMedia)
        .where(eq(listingMedia.listingId, listing.id))
        .orderBy(listingMedia.sortOrder);

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
    })
  );
}

export async function getStorefrontBySlug(slug: string) {
  const db = await getDb();
  if (!db) return null;

  const sf = await db
    .select()
    .from(storefronts)
    .where(eq(storefronts.slug, slug))
    .limit(1);
  if (!sf[0]) return null;

  const vendor = await db
    .select()
    .from(vendorProfiles)
    .where(eq(vendorProfiles.id, sf[0].vendorId))
    .limit(1);
  const vendorListings = await db
    .select()
    .from(listings)
    .where(
      and(eq(listings.storefrontId, sf[0].id), eq(listings.status, "published"))
    );

  const enrichedListings = await Promise.all(
    vendorListings.map(async l => {
      const media = await db
        .select()
        .from(listingMedia)
        .where(eq(listingMedia.listingId, l.id))
        .orderBy(listingMedia.sortOrder);
      return { ...l, media };
    })
  );

  return {
    ...sf[0],
    vendor: vendor[0] || null,
    listings: enrichedListings,
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

export async function getVendorReviews(vendorId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      review: reviews,
      buyer: {
        id: users.id,
        name: users.name,
        avatarUrl: users.avatarUrl,
      },
      listing: listings,
    })
    .from(reviews)
    .innerJoin(users, eq(reviews.buyerId, users.id))
    .innerJoin(listings, eq(reviews.listingId, listings.id))
    .where(and(eq(reviews.vendorId, vendorId), eq(reviews.status, "approved")))
    .orderBy(desc(reviews.createdAt));
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
    .where(eq(vendorProfiles.id, vendorId))
    .limit(1);
  return vendor || null;
}

export async function getAllUsersForAdmin() {
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
    })
    .from(users)
    .orderBy(desc(users.createdAt));
}

export async function getAllListingsForAdmin() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ listing: listings, vendor: vendorProfiles, category: categories })
    .from(listings)
    .innerJoin(vendorProfiles, eq(listings.vendorId, vendorProfiles.id))
    .innerJoin(categories, eq(listings.categoryId, categories.id))
    .orderBy(desc(listings.updatedAt));
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
