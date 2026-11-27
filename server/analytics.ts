import {
  and,
  desc,
  eq,
  gte,
  isNull,
  lte,
  ne,
  sql,
  type SQL,
} from "drizzle-orm";
import type { MySqlColumn } from "drizzle-orm/mysql-core";
import {
  analyticsEvents,
  inquiries,
  listingViews,
  listings,
  messages,
  users,
  vendorProfiles,
} from "../drizzle/schema";
import { getDb } from "./db";
import { summarizeLeadCounts, type LeadStage } from "./leadWorkflow";

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

export function normalizeAnalyticsRange(
  range: AnalyticsRange = {}
): AnalyticsRange {
  const normalize = (value: Date | undefined, end = false) =>
    value
      ? new Date(
          Date.UTC(
            value.getUTCFullYear(),
            value.getUTCMonth(),
            value.getUTCDate(),
            end ? 23 : 0,
            end ? 59 : 0,
            end ? 59 : 0,
            end ? 999 : 0
          )
        )
      : undefined;
  const from = normalize(range.from);
  const to = normalize(range.to, true);
  if (from && to && from > to) {
    return {
      ...range,
      from: normalize(range.to),
      to: normalize(range.from, true),
    };
  }
  return { ...range, from, to };
}

export function safeRate(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

function dateFilters(column: MySqlColumn, range: AnalyticsRange): SQL[] {
  return [
    ...(range.from ? [gte(column, range.from)] : []),
    ...(range.to ? [lte(column, range.to)] : []),
  ];
}

function listingFilters(range: AnalyticsRange): SQL[] {
  return [
    ...(range.vendorId ? [eq(listings.vendorId, range.vendorId)] : []),
    ...(range.categoryId ? [eq(listings.categoryId, range.categoryId)] : []),
  ];
}

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export async function getLeadFunnelAnalytics(range: AnalyticsRange) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable for lead analytics.");
  range = normalizeAnalyticsRange(range);
  const rows = await db
    .select({ stage: inquiries.leadStage, count: sql<number>`count(*)` })
    .from(inquiries)
    .innerJoin(listings, eq(listings.id, inquiries.listingId))
    .where(
      and(...listingFilters(range), ...dateFilters(inquiries.createdAt, range))
    )
    .groupBy(inquiries.leadStage);
  const counts: Record<LeadStage, number> = {
    new_inquiry: 0,
    contacted: 0,
    quote_sent: 0,
    deal_won: 0,
    deal_lost: 0,
  };
  for (const row of rows) counts[row.stage] = Number(row.count);
  return summarizeLeadCounts(counts);
}

export async function getInquiryResponseMetrics(
  db: Database,
  range: AnalyticsRange
) {
  // One first vendor response per inquiry, never one sample per message.
  const responses = db
    .select({
      id: inquiries.id,
      createdAt: inquiries.createdAt,
      resolved:
        sql<number>`case when ${inquiries.status} = 'closed' then 1 else 0 end`.as(
          "resolved"
        ),
      firstReply: sql<string | null>`min(${messages.createdAt})`.as(
        "first_reply"
      ),
    })
    .from(inquiries)
    .innerJoin(listings, eq(inquiries.listingId, listings.id))
    .innerJoin(vendorProfiles, eq(inquiries.vendorId, vendorProfiles.id))
    .leftJoin(
      messages,
      and(
        eq(messages.inquiryId, inquiries.id),
        eq(messages.senderId, vendorProfiles.userId),
        gte(messages.createdAt, inquiries.createdAt),
        ...(range.to ? [lte(messages.createdAt, range.to)] : [])
      )
    )
    .where(
      and(...listingFilters(range), ...dateFilters(inquiries.createdAt, range))
    )
    .groupBy(inquiries.id, inquiries.createdAt, inquiries.status)
    .as("responses");
  const [row] = await db
    .select({
      inquiries: sql<number>`count(*)`,
      responded: sql<number>`count(${responses.firstReply})`,
      resolved: sql<number>`coalesce(sum(${responses.resolved}), 0)`,
      averageSeconds: sql<
        number | null
      >`avg(timestampdiff(second, ${responses.createdAt}, ${responses.firstReply}))`,
    })
    .from(responses);
  return {
    inquiries: Number(row.inquiries),
    responded: Number(row.responded),
    resolved: Number(row.resolved),
    averageResponseSeconds:
      row.averageSeconds === null
        ? null
        : Math.round(Number(row.averageSeconds)),
  };
}

export async function getVendorFunnelAnalytics(
  vendorId: number,
  range: AnalyticsRange = {}
) {
  const scope = { ...normalizeAnalyticsRange(range), vendorId };
  const db = await getDb();
  if (!db) throw new Error("Database unavailable for vendor analytics.");
  const listingScope = listingFilters(scope);
  const [
    views,
    listingCount,
    saves,
    contactReveals,
    metrics,
    unread,
    topListings,
  ] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(listingViews)
      .innerJoin(listings, eq(listingViews.listingId, listings.id))
      .where(
        and(...listingScope, ...dateFilters(listingViews.createdAt, scope))
      ),
    db
      .select({ count: sql<number>`count(*)` })
      .from(listings)
      .where(and(...listingScope)),
    db
      .select({ count: sql<number>`count(*)` })
      .from(analyticsEvents)
      .innerJoin(listings, eq(analyticsEvents.listingId, listings.id))
      .where(
        and(
          eq(analyticsEvents.eventType, "save_listing"),
          ...listingScope,
          ...dateFilters(analyticsEvents.createdAt, scope)
        )
      ),
    db
      .select({ count: sql<number>`count(*)` })
      .from(analyticsEvents)
      .innerJoin(listings, eq(analyticsEvents.listingId, listings.id))
      .where(
        and(
          eq(analyticsEvents.eventType, "reveal_contact"),
          ...listingScope,
          ...dateFilters(analyticsEvents.createdAt, scope)
        )
      ),
    getInquiryResponseMetrics(db, scope),
    db
      .select({ count: sql<number>`count(*)` })
      .from(messages)
      .innerJoin(inquiries, eq(messages.inquiryId, inquiries.id))
      .innerJoin(listings, eq(inquiries.listingId, listings.id))
      .innerJoin(vendorProfiles, eq(inquiries.vendorId, vendorProfiles.id))
      .where(
        and(
          ...listingScope,
          ...dateFilters(inquiries.createdAt, scope),
          ...dateFilters(messages.createdAt, scope),
          isNull(messages.readAt),
          ne(messages.senderId, vendorProfiles.userId)
        )
      ),
    db
      .select({
        listingId: listings.id,
        title: listings.title,
        inquiries: sql<number>`count(${inquiries.id})`,
      })
      .from(listings)
      .leftJoin(
        inquiries,
        and(
          eq(inquiries.listingId, listings.id),
          ...dateFilters(inquiries.createdAt, scope)
        )
      )
      .where(and(...listingScope))
      .groupBy(listings.id, listings.title)
      .orderBy(desc(sql`count(${inquiries.id})`), listings.id)
      .limit(5),
  ]);
  return {
    scope,
    views: Number(views[0].count),
    saves: Number(saves[0].count),
    contactReveals: Number(contactReveals[0].count),
    listings: Number(listingCount[0].count),
    inquiries: metrics.inquiries,
    unread: Number(unread[0].count),
    resolved: metrics.resolved,
    responded: metrics.responded,
    resolutionRate: safeRate(metrics.resolved, metrics.inquiries),
    responseRate: safeRate(metrics.responded, metrics.inquiries),
    averageResponseSeconds: metrics.averageResponseSeconds,
    topListings: topListings.map(item => ({
      ...item,
      inquiries: Number(item.inquiries),
    })),
  };
}

export async function getAdminFunnelAnalytics(range: AnalyticsRange = {}) {
  range = normalizeAnalyticsRange(range);
  const db = await getDb();
  if (!db) throw new Error("Database unavailable for administrator analytics.");
  const [views, reveals, metrics, accounts, vendors, listingCount] =
    await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(listingViews)
        .innerJoin(listings, eq(listingViews.listingId, listings.id))
        .where(
          and(
            ...listingFilters(range),
            ...dateFilters(listingViews.createdAt, range)
          )
        ),
      db
        .select({ count: sql<number>`count(*)` })
        .from(analyticsEvents)
        .innerJoin(listings, eq(analyticsEvents.listingId, listings.id))
        .where(
          and(
            eq(analyticsEvents.eventType, "reveal_contact"),
            ...listingFilters(range),
            ...dateFilters(analyticsEvents.createdAt, range)
          )
        ),
      getInquiryResponseMetrics(db, range),
      db
        .select({ count: sql<number>`count(*)` })
        .from(users)
        .where(and(...dateFilters(users.createdAt, range))),
      db
        .select({ count: sql<number>`count(*)` })
        .from(vendorProfiles)
        .where(
          and(
            ...dateFilters(vendorProfiles.createdAt, range),
            ...(range.vendorId ? [eq(vendorProfiles.id, range.vendorId)] : [])
          )
        ),
      db
        .select({ count: sql<number>`count(*)` })
        .from(listings)
        .where(
          and(
            ...listingFilters(range),
            ...dateFilters(listings.createdAt, range)
          )
        ),
    ]);
  return {
    scope: range,
    listingViews: Number(views[0].count),
    contactReveals: Number(reveals[0].count),
    inquiries: metrics.inquiries,
    replies: metrics.responded,
    resolutions: metrics.resolved,
    responseRate: safeRate(metrics.responded, metrics.inquiries),
    resolutionRate: safeRate(metrics.resolved, metrics.inquiries),
    users: Number(accounts[0].count),
    vendors: Number(vendors[0].count),
    listings: Number(listingCount[0].count),
  };
}
