import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import {
  analyticsEvents,
  categories,
  inquiries,
  listingViews,
  listings,
  messages,
  vendorProfiles,
} from "../drizzle/schema";
import { getDb } from "./db";

export type AnalyticsRange = {
  from?: Date;
  to?: Date;
  vendorId?: number;
  categoryId?: number;
};

export function resolveAnalyticsScope(
  role: "admin" | "vendor" | "buyer",
  ownVendorId: number | null,
  requestedVendorId?: number
): AnalyticsRange {
  if (role === "admin") return { vendorId: requestedVendorId };
  if (role === "vendor" && ownVendorId) return { vendorId: ownVendorId };
  throw new Error("Analytics access denied");
}

export function normalizeAnalyticsRange(range: AnalyticsRange = {}): AnalyticsRange {
  const normalize = (value: Date | undefined, endOfDay = false) => {
    if (!value) return undefined;
    return new Date(Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate(),
      endOfDay ? 23 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 999 : 0
    ));
  };
  const from = normalize(range.from);
  const to = normalize(range.to, true);
  if (from && to && from > to) {
    return { ...range, from: normalize(range.to), to: normalize(range.from, true) };
  }
  return { ...range, from, to };
}

export function safeRate(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

function dateFilters(column: any, range: AnalyticsRange) {
  return [
    range.from ? gte(column, range.from) : undefined,
    range.to ? lte(column, range.to) : undefined,
  ].filter(Boolean) as any[];
}

function listingFilters(range: AnalyticsRange, listingColumn = listings) {
  return [
    range.vendorId ? eq(listingColumn.vendorId, range.vendorId) : undefined,
    range.categoryId ? eq(listingColumn.categoryId, range.categoryId) : undefined,
  ].filter(Boolean) as any[];
}

export async function getVendorFunnelAnalytics(vendorId: number, range: AnalyticsRange = {}) {
  range = normalizeAnalyticsRange(range);
  const db = await getDb();
  if (!db) return emptyVendorAnalytics(vendorId, range);
  const scope = { ...range, vendorId };
  const listingScope = listingFilters(scope);
  const views = await db
    .select({ count: sql<number>`count(*)` })
    .from(listingViews)
    .innerJoin(listings, eq(listingViews.listingId, listings.id))
    .where(and(...listingScope, ...dateFilters(listingViews.createdAt, scope)));
  const listingCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(listings)
    .where(and(...listingScope));
  const saves = await db
    .select({ count: sql<number>`count(*)` })
    .from(analyticsEvents)
    .innerJoin(listings, eq(analyticsEvents.listingId, listings.id))
    .where(and(eq(analyticsEvents.eventType, "save_listing"), ...listingScope, ...dateFilters(analyticsEvents.createdAt, scope)));
  const contactReveals = await db
    .select({ count: sql<number>`count(*)` })
    .from(analyticsEvents)
    .innerJoin(listings, eq(analyticsEvents.listingId, listings.id))
    .where(and(eq(analyticsEvents.eventType, "reveal_contact"), ...listingScope, ...dateFilters(analyticsEvents.createdAt, scope)));
  const vendorInquiries = await db
    .select({ inquiry: inquiries })
    .from(inquiries)
    .innerJoin(listings, eq(inquiries.listingId, listings.id))
    .where(and(eq(inquiries.vendorId, vendorId), ...listingFilters(scope), ...dateFilters(inquiries.createdAt, scope)));
  const inquiryIds = vendorInquiries.map(row => row.inquiry.id);
  const inquiryCount = inquiryIds.length;
  const resolvedCount = vendorInquiries.filter(row => row.inquiry.status === "closed").length;
  const unread = inquiryIds.length
    ? await db
        .select({ count: sql<number>`count(*)` })
        .from(messages)
        .innerJoin(inquiries, eq(messages.inquiryId, inquiries.id))
        .innerJoin(vendorProfiles, eq(inquiries.vendorId, vendorProfiles.id))
        .where(and(eq(inquiries.vendorId, vendorId), sql`${messages.readAt} is null`, sql`${messages.senderId} <> ${vendorProfiles.userId}`, ...dateFilters(messages.createdAt, scope)))
    : [{ count: 0 }];
  const messagesForResponse = inquiryIds.length
    ? await db
        .select({ inquiryId: messages.inquiryId, senderId: messages.senderId, createdAt: messages.createdAt, buyerId: inquiries.buyerId })
        .from(messages)
        .innerJoin(inquiries, eq(messages.inquiryId, inquiries.id))
        .where(and(eq(inquiries.vendorId, vendorId), ...dateFilters(messages.createdAt, scope)))
        .orderBy(messages.createdAt)
    : [];
  const responseSeconds = messagesForResponse
    .reduce((total, message, index, all) => {
      if (message.senderId !== message.buyerId) return total;
      const vendorReply = all.slice(index + 1).find(next => next.inquiryId === message.inquiryId && next.senderId !== message.buyerId);
      return vendorReply ? total + Math.max(0, (vendorReply.createdAt.getTime() - message.createdAt.getTime()) / 1000) : total;
    }, 0);
  const responseSamples = messagesForResponse.filter((message, index, all) => message.senderId === message.buyerId && all.slice(index + 1).some(next => next.inquiryId === message.inquiryId && next.senderId !== message.buyerId)).length;
  const topListings = await db
    .select({ listingId: listings.id, title: listings.title, inquiries: sql<number>`count(${inquiries.id})` })
    .from(listings)
    .leftJoin(inquiries, eq(inquiries.listingId, listings.id))
    .where(and(...listingScope))
    .groupBy(listings.id, listings.title)
    .orderBy(desc(sql`count(${inquiries.id})`))
    .limit(5);
  return {
    scope,
    views: Number(views[0]?.count || 0),
    saves: Number(saves[0]?.count || 0),
    contactReveals: Number(contactReveals[0]?.count || 0),
    inquiries: inquiryCount,
    listings: Number(listingCount[0]?.count || 0),
    unread: Number(unread[0]?.count || 0),
    resolved: resolvedCount,
    resolutionRate: safeRate(resolvedCount, inquiryCount),
    responseRate: safeRate(responseSamples, Math.max(1, inquiryCount)),
    averageResponseSeconds: responseSamples ? Math.round(responseSeconds / responseSamples) : null,
    topListings,
  };
}

export async function getAdminFunnelAnalytics(range: AnalyticsRange = {}) {
  range = normalizeAnalyticsRange(range);
  const db = await getDb();
  if (!db) return { ...emptyAdminAnalytics(), scope: range };
  const listingScope = listingFilters(range);
  const [views, contactReveals, inquiryRows, replyCount, resolutionCount] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(listingViews).innerJoin(listings, eq(listingViews.listingId, listings.id)).where(and(...listingScope, ...dateFilters(listingViews.createdAt, range))),
    db.select({ count: sql<number>`count(*)` }).from(analyticsEvents).innerJoin(listings, eq(analyticsEvents.listingId, listings.id)).where(and(eq(analyticsEvents.eventType, "reveal_contact"), ...listingScope, ...dateFilters(analyticsEvents.createdAt, range))),
    db.select({ inquiry: inquiries }).from(inquiries).innerJoin(listings, eq(inquiries.listingId, listings.id)).where(and(...listingScope, ...dateFilters(inquiries.createdAt, range))),
    db.select({ count: sql<number>`count(*)` }).from(messages).innerJoin(inquiries, eq(messages.inquiryId, inquiries.id)).innerJoin(listings, eq(inquiries.listingId, listings.id)).innerJoin(vendorProfiles, eq(inquiries.vendorId, vendorProfiles.id)).where(and(sql`${messages.senderId} = ${vendorProfiles.userId}`, ...listingScope, ...dateFilters(messages.createdAt, range))),
    db.select({ count: sql<number>`count(*)` }).from(inquiries).innerJoin(listings, eq(inquiries.listingId, listings.id)).where(and(eq(inquiries.status, "closed"), ...listingScope, ...dateFilters(inquiries.updatedAt, range))),
  ]);
  const inquiriesCount = inquiryRows.length;
  return {
    scope: range,
    listingViews: Number(views[0]?.count || 0),
    contactReveals: Number(contactReveals[0]?.count || 0),
    inquiries: inquiriesCount,
    replies: Number(replyCount[0]?.count || 0),
    resolutions: Number(resolutionCount[0]?.count || 0),
    resolutionRate: safeRate(Number(resolutionCount[0]?.count || 0), inquiriesCount),
  };
}

function emptyVendorAnalytics(vendorId: number, range: AnalyticsRange) {
  return { scope: { ...range, vendorId }, views: 0, saves: 0, contactReveals: 0, inquiries: 0, listings: 0, unread: 0, resolved: 0, resolutionRate: 0, responseRate: 0, averageResponseSeconds: null, topListings: [] };
}

function emptyAdminAnalytics() {
  return { listingViews: 0, contactReveals: 0, inquiries: 0, replies: 0, resolutions: 0, resolutionRate: 0 };
}
