import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import {
  inquiries,
  listings,
  messages,
  reviews,
  savedSearches,
  users,
  vendorProfiles,
  wishlists,
} from "../drizzle/schema";
import { pagination, type PageInput } from "../shared/pagination";
import { getDb, getListingMediaBatch, toPublicVendorProfile } from "./db";
import {
  accountSummaryColumns,
  publicVendorColumns,
} from "./responseProjections";
import { getConversationState } from "./inquiryWorkflow";

async function database() {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable.",
    });
  return db;
}

export async function portalVendorId(userId: number) {
  const db = await database();
  const [profile] = await db
    .select({ id: vendorProfiles.id })
    .from(vendorProfiles)
    .where(eq(vendorProfiles.userId, userId))
    .limit(1);
  return profile?.id;
}

export async function buyerWishlist(userId: number, input: PageInput) {
  const db = await database();
  const scope = eq(wishlists.buyerId, userId);
  const [count] = await db
    .select({ total: sql<number>`count(*)` })
    .from(wishlists)
    .where(scope);
  const items = await db
    .select({ wishlist: wishlists, listing: listings })
    .from(wishlists)
    .innerJoin(listings, eq(wishlists.listingId, listings.id))
    .where(scope)
    .orderBy(desc(wishlists.createdAt), desc(wishlists.id))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);
  return { items, pagination: pagination(Number(count.total), input) };
}

export async function buyerSavedSearches(userId: number, input: PageInput) {
  const db = await database();
  const scope = eq(savedSearches.userId, userId);
  const [count] = await db
    .select({ total: sql<number>`count(*)` })
    .from(savedSearches)
    .where(scope);
  const items = await db
    .select()
    .from(savedSearches)
    .where(scope)
    .orderBy(desc(savedSearches.createdAt), desc(savedSearches.id))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);
  return { items, pagination: pagination(Number(count.total), input) };
}

export async function portalReviews(
  ownerId: number,
  vendor: boolean,
  input: PageInput
) {
  const db = await database();
  const scope = vendor
    ? and(eq(reviews.vendorId, ownerId), eq(reviews.status, "approved"))
    : eq(reviews.buyerId, ownerId);
  const [count] = await db
    .select({ total: sql<number>`count(*)` })
    .from(reviews)
    .where(scope);
  const items = await db
    .select({
      review: reviews,
      listing: listings,
      vendor: publicVendorColumns,
      buyer: { id: users.id, name: users.name, avatarUrl: users.avatarUrl },
    })
    .from(reviews)
    .innerJoin(listings, eq(reviews.listingId, listings.id))
    .innerJoin(vendorProfiles, eq(reviews.vendorId, vendorProfiles.id))
    .innerJoin(users, eq(reviews.buyerId, users.id))
    .where(scope)
    .orderBy(desc(reviews.createdAt), desc(reviews.id))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);
  return { items, pagination: pagination(Number(count.total), input) };
}

export async function vendorListings(
  vendorId: number | undefined,
  input: PageInput
) {
  const db = await database();
  const scope =
    vendorId === undefined ? sql`false` : eq(listings.vendorId, vendorId);
  const [count] = await db
    .select({ total: sql<number>`count(*)` })
    .from(listings)
    .where(scope);
  const rows = await db
    .select()
    .from(listings)
    .where(scope)
    .orderBy(desc(listings.createdAt), desc(listings.id))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);
  const media = await getListingMediaBatch(
    db,
    rows.map(row => row.id)
  );
  return {
    items: rows.map(row => ({ ...row, media: media.get(row.id) ?? [] })),
    pagination: pagination(Number(count.total), input),
  };
}

async function inquirySummaries(
  scope: SQL,
  input: PageInput,
  viewerId: number
) {
  const db = await database();
  const [count] = await db
    .select({ total: sql<number>`count(*)` })
    .from(inquiries)
    .where(scope);
  const rows = await db
    .select({
      inquiry: inquiries,
      listing: listings,
      vendor: vendorProfiles,
      buyer: accountSummaryColumns,
    })
    .from(inquiries)
    .innerJoin(listings, eq(inquiries.listingId, listings.id))
    .innerJoin(vendorProfiles, eq(inquiries.vendorId, vendorProfiles.id))
    .innerJoin(users, eq(inquiries.buyerId, users.id))
    .where(scope)
    .orderBy(desc(inquiries.updatedAt), desc(inquiries.id))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);
  const ids = rows.map(row => row.inquiry.id);
  const stats = ids.length
    ? await db
        .select({
          inquiryId: messages.inquiryId,
          unreadCount: sql<number>`sum(case when ${messages.senderId} <> ${viewerId} and ${messages.readAt} is null then 1 else 0 end)`,
          lastMessageAt: sql`max(${messages.createdAt})`.mapWith(
            messages.createdAt
          ),
          firstBuyerAt:
            sql`min(case when ${messages.senderId} = ${inquiries.buyerId} then ${messages.createdAt} end)`.mapWith(
              messages.createdAt
            ),
          firstVendorAt:
            sql`min(case when ${messages.senderId} <> ${inquiries.buyerId} then ${messages.createdAt} end)`.mapWith(
              messages.createdAt
            ),
          lastSenderId: sql<number>`(select latest.senderId from messages latest where latest.inquiryId = ${messages.inquiryId} and latest.isHidden = false order by latest.createdAt desc, latest.id desc limit 1)`,
        })
        .from(messages)
        .innerJoin(inquiries, eq(inquiries.id, messages.inquiryId))
        .where(
          and(inArray(messages.inquiryId, ids), eq(messages.isHidden, false))
        )
        .groupBy(messages.inquiryId)
    : [];
  const byId = new Map(stats.map(row => [row.inquiryId, row]));
  return {
    items: rows.map(row => {
      const summary = byId.get(row.inquiry.id);
      return {
        ...row,
        unreadCount: Number(summary?.unreadCount ?? 0),
        lastMessageAt: summary?.lastMessageAt ?? null,
        responseTimeSeconds:
          summary?.firstBuyerAt && summary.firstVendorAt
            ? Math.max(
                0,
                Math.round(
                  (summary.firstVendorAt.getTime() -
                    summary.firstBuyerAt.getTime()) /
                    1000
                )
              )
            : null,
        conversationState: getConversationState(
          row.inquiry.status,
          summary
            ? [
                {
                  senderId: summary.lastSenderId,
                  createdAt: summary.lastMessageAt,
                },
              ]
            : [],
          row.inquiry.buyerId,
          viewerId
        ),
      };
    }),
    pagination: pagination(Number(count.total), input),
  };
}

export async function buyerInquiries(
  userId: number,
  input: PageInput & { inquiryId?: number }
) {
  const scope = and(
    eq(inquiries.buyerId, userId),
    input.inquiryId ? eq(inquiries.id, input.inquiryId) : undefined
  )!;
  const result = await inquirySummaries(scope, input, userId);
  return {
    ...result,
    items: result.items.map(
      ({ inquiry, vendor, listing, buyer: _buyer, ...summary }) => {
        const { vendorPrivateNotes: _notes, ...safe } = inquiry;
        return {
          ...safe,
          ...summary,
          listing,
          vendor: toPublicVendorProfile(vendor),
        };
      }
    ),
  };
}

export async function vendorInquiries(
  userId: number,
  vendorId: number | undefined,
  input: PageInput & { inquiryId?: number }
) {
  const scope =
    vendorId === undefined
      ? sql`false`
      : and(
          eq(inquiries.vendorId, vendorId),
          input.inquiryId ? eq(inquiries.id, input.inquiryId) : undefined
        )!;
  const result = await inquirySummaries(scope, input, userId);
  return {
    ...result,
    items: result.items.map(
      ({ inquiry, listing, buyer, vendor: _vendor, ...summary }) => ({
        ...inquiry,
        ...summary,
        listing,
        buyer,
      })
    ),
  };
}

export async function conversationMessages(
  userId: number,
  input: PageInput & { inquiryId: number }
) {
  const db = await database();
  const [owned] = await db
    .select({ id: inquiries.id })
    .from(inquiries)
    .innerJoin(vendorProfiles, eq(inquiries.vendorId, vendorProfiles.id))
    .where(
      and(
        eq(inquiries.id, input.inquiryId),
        sql`(${inquiries.buyerId} = ${userId} or ${vendorProfiles.userId} = ${userId})`
      )
    )
    .limit(1);
  if (!owned)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Conversation not found.",
    });
  const scope = and(
    eq(messages.inquiryId, owned.id),
    eq(messages.isHidden, false)
  );
  const [count] = await db
    .select({ total: sql<number>`count(*)` })
    .from(messages)
    .where(scope);
  const rows = await db
    .select({
      id: messages.id,
      inquiryId: messages.inquiryId,
      senderId: messages.senderId,
      body: messages.body,
      readAt: messages.readAt,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(scope)
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);
  return {
    items: rows.reverse(),
    pagination: pagination(Number(count.total), input),
  };
}
