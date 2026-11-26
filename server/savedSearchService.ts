import { and, asc, desc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { getDb } from "./db";
import { randomUUID } from "node:crypto";
import {
  categories,
  listings,
  savedSearches,
  savedSearchMatches,
  vendorProfiles,
  notificationOutbox,
  type SavedSearch,
} from "../drizzle/schema";
import {
  matchesSavedSearch,
  type ListingMatchCandidate,
} from "./savedSearchMatcher";
import { enqueueNotificationEvent } from "./notificationWorker";
import { publicListingEligibility } from "./publicEligibility";

type Database = ReturnType<typeof drizzle>;

export async function enqueueListingPublication(
  db: Pick<Database, "insert">,
  listingId: number,
  actorId: number
) {
  await db.insert(notificationOutbox).values({
    idempotencyKey: `listing_publication:${listingId}:${randomUUID()}`,
    eventType: "LISTING_PUBLISHED",
    recipientUserId: actorId,
    entityType: "listing",
    entityId: listingId,
    payload: { listingId },
  });
}
/**
 * Saved-search alert policy
 * - Match rows are alert work items. They are recorded only for active searches whose alerts are
 *   on ("immediate" or "daily") when the listing is processed, and only for listings published
 *   after the search was created or most recently changed.
 * - alertDispatched=true means the alert was committed to the durable notification outbox in the
 *   same transaction. It is NOT proof of email delivery; delivery state lives in
 *   notificationDeliveries.
 * - Pausing (frequency "off" or inactive) stops new match rows. Resuming does not backfill
 *   listings published before the search was resumed. Pending matches of a search switched to "off" are
 *   left undispatched; switching immediate <-> daily lets the new cadence deliver them.
 * - Daily searches receive at most one digest per DAILY_DIGEST_INTERVAL_MS.
 */
export const SAVED_SEARCH_SWEEP_WINDOW_MS = 24 * 60 * 60 * 1000;
export const DAILY_DIGEST_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const DIGEST_MAX_LISTINGS = 20;

function listingActionUrl(slug: string) {
  return `/listings/${encodeURIComponent(slug)}`;
}

export function savedSearchMarketplaceUrl(
  search: Pick<
    SavedSearch,
    | "query"
    | "listingType"
    | "location"
    | "minPrice"
    | "maxPrice"
    | "currency"
    | "remoteOnly"
    | "verifiedVendorOnly"
  >,
  categorySlug?: string | null
) {
  const params = new URLSearchParams();
  if (search.query) params.set("q", search.query);
  if (categorySlug) params.set("category", categorySlug);
  if (search.listingType) params.set("type", search.listingType);
  if (search.location) params.set("location", search.location);
  if (search.minPrice != null) params.set("min", String(search.minPrice));
  if (search.maxPrice != null) params.set("max", String(search.maxPrice));
  if (search.minPrice != null || search.maxPrice != null)
    params.set("currency", search.currency);
  if (search.remoteOnly) params.set("remote", "true");
  if (search.verifiedVendorOnly) params.set("verified", "true");
  params.set("sort", "newest");
  return `/marketplace?${params.toString()}`;
}

async function resolveDb(db?: Database) {
  return db ?? (await getDb()) ?? undefined;
}

/**
 * Records matches for one public listing, excluding publications before search creation or change.
 * Publication work is queued transactionally; the bounded sweep also recovers recent legacy work.
 */
export async function processListingSavedSearchMatches(
  listingId: number,
  options: { db?: Database } = {}
) {
  const db = await resolveDb(options.db);
  if (!db) return { matchedCount: 0, alertsEnqueued: 0 };

  const [listingRow] = await db
    .select({
      listing: listings,
      vendor: vendorProfiles,
      category: categories,
    })
    .from(listings)
    .innerJoin(vendorProfiles, eq(listings.vendorId, vendorProfiles.id))
    .innerJoin(categories, eq(listings.categoryId, categories.id))
    .where(and(eq(listings.id, listingId), publicListingEligibility()))
    .limit(1);

  if (!listingRow) return { matchedCount: 0, alertsEnqueued: 0 };

  const candidate: ListingMatchCandidate = {
    id: listingRow.listing.id,
    title: listingRow.listing.title,
    description: listingRow.listing.description,
    categoryId: listingRow.listing.categoryId,
    listingType: listingRow.listing.listingType,
    location: listingRow.listing.location,
    priceIndication: listingRow.listing.priceIndication,
    remoteAvailable: listingRow.listing.remoteAvailable,
    vendorRemoteAvailable: listingRow.vendor.remoteAvailable,
    vendorVerified:
      listingRow.vendor.identityStatus === "verified" &&
      listingRow.vendor.identityVerifiedAt != null,
    status: listingRow.listing.status,
  };
  const publishedAt =
    listingRow.listing.publishedAt ?? listingRow.listing.createdAt;

  const activeSearches = await db
    .select()
    .from(savedSearches)
    .where(
      and(
        eq(savedSearches.isActive, true),
        inArray(savedSearches.alertFrequency, ["immediate", "daily"])
      )
    );

  let matchedCount = 0;
  let alertsEnqueued = 0;
  for (const search of activeSearches) {
    if (search.alertFrequency === "off") continue;
    if (search.userId === listingRow.vendor.userId) continue;
    if (
      publishedAt.getTime() <
      Math.max(search.createdAt.getTime(), search.updatedAt.getTime())
    )
      continue;
    const isMatch = matchesSavedSearch(
      {
        query: search.query,
        categoryId: search.categoryId,
        listingType: search.listingType,
        location: search.location,
        minPrice: search.minPrice == null ? undefined : Number(search.minPrice),
        maxPrice: search.maxPrice == null ? undefined : Number(search.maxPrice),
        currency: search.currency,
        remoteOnly: search.remoteOnly,
        verifiedVendorOnly: search.verifiedVendorOnly,
      },
      candidate
    );
    if (!isMatch) continue;

    const [inserted] = await db
      .insert(savedSearchMatches)
      .values({
        savedSearchId: search.id,
        listingId: candidate.id,
        alertDispatched: false,
      })
      .onDuplicateKeyUpdate({ set: { savedSearchId: search.id } });
    // MySQL reports 1 affected row for a fresh insert and 0 for an unchanged duplicate.
    if (Number(inserted?.affectedRows || 0) === 1) matchedCount++;

    if (search.alertFrequency === "immediate") {
      if (await dispatchImmediateMatch(db, search.id, candidate.id))
        alertsEnqueued++;
    }
  }

  return { matchedCount, alertsEnqueued };
}

/** Atomically enqueues one immediate alert and marks its match as queued. Errors propagate. */
export async function dispatchImmediateMatch(
  db: Database,
  savedSearchId: number,
  listingId: number
) {
  return db.transaction(async tx => {
    const [match] = await tx
      .select()
      .from(savedSearchMatches)
      .where(
        and(
          eq(savedSearchMatches.savedSearchId, savedSearchId),
          eq(savedSearchMatches.listingId, listingId)
        )
      )
      .limit(1)
      .for("update");
    if (!match || match.alertDispatched) return false;
    const [search] = await tx
      .select()
      .from(savedSearches)
      .where(eq(savedSearches.id, savedSearchId))
      .limit(1);
    if (!search?.isActive || search.alertFrequency !== "immediate")
      return false;
    const [listing] = await tx
      .select({ id: listings.id, title: listings.title, slug: listings.slug })
      .from(listings)
      .where(and(eq(listings.id, listingId), publicListingEligibility()))
      .limit(1);
    if (!listing) {
      // The listing was unpublished before the alert went out; never alert on it.
      await tx
        .update(savedSearchMatches)
        .set({ alertDispatched: true })
        .where(eq(savedSearchMatches.id, match.id));
      return false;
    }
    await enqueueNotificationEvent(tx, {
      idempotencyKey: `saved_search_match:${search.id}:${listing.id}`,
      eventType: "SAVED_SEARCH_MATCH",
      recipientUserId: search.userId,
      entityType: "saved_search",
      entityId: search.id,
      payload: {
        savedSearchId: search.id,
        searchName: search.name,
        listingId: listing.id,
        listingTitle: listing.title,
        actionUrl: listingActionUrl(listing.slug),
        actionLabel: "View listing",
      },
    });
    await tx
      .update(savedSearchMatches)
      .set({ alertDispatched: true })
      .where(eq(savedSearchMatches.id, match.id));
    await tx
      .update(savedSearches)
      .set({
        lastAlertedAt: new Date(),
        lastMatchedListingId: listing.id,
        updatedAt: search.updatedAt,
      })
      .where(eq(savedSearches.id, search.id));
    return true;
  });
}

/** Enqueues one daily digest for a search whose window has elapsed. */
export async function dispatchDailyDigest(
  db: Database,
  savedSearchId: number,
  now = new Date()
) {
  return db.transaction(async tx => {
    const [search] = await tx
      .select()
      .from(savedSearches)
      .where(eq(savedSearches.id, savedSearchId))
      .limit(1)
      .for("update");
    if (!search?.isActive || search.alertFrequency !== "daily") return false;
    if (
      search.lastAlertedAt &&
      now.getTime() - search.lastAlertedAt.getTime() < DAILY_DIGEST_INTERVAL_MS
    )
      return false;
    const pending = await tx
      .select({
        matchId: savedSearchMatches.id,
        listingId: listings.id,
        title: listings.title,
        slug: listings.slug,
      })
      .from(savedSearchMatches)
      .innerJoin(listings, eq(savedSearchMatches.listingId, listings.id))
      .where(
        and(
          eq(savedSearchMatches.savedSearchId, search.id),
          eq(savedSearchMatches.alertDispatched, false),
          publicListingEligibility()
        )
      )
      .orderBy(desc(savedSearchMatches.id))
      .limit(DIGEST_MAX_LISTINGS);
    if (!pending.length) return false;
    const [category] = search.categoryId
      ? await tx
          .select({ slug: categories.slug })
          .from(categories)
          .where(eq(categories.id, search.categoryId))
          .limit(1)
      : [];
    const highestMatchId = Math.max(...pending.map(item => item.matchId));
    await enqueueNotificationEvent(tx, {
      idempotencyKey: `saved_search_digest:${search.id}:${highestMatchId}`,
      eventType: "SAVED_SEARCH_DIGEST",
      recipientUserId: search.userId,
      entityType: "saved_search",
      entityId: search.id,
      payload: {
        savedSearchId: search.id,
        searchName: search.name,
        matchCount: pending.length,
        listings: pending.map(item => ({
          listingId: item.listingId,
          title: item.title,
          actionUrl: listingActionUrl(item.slug),
        })),
        actionUrl: savedSearchMarketplaceUrl(search, category?.slug),
        actionLabel: "See all matching listings",
      },
    });
    // Older pending matches beyond the digest cap, and matches whose listing is no longer public,
    // are retired with this digest so they are never alerted later out of context.
    await tx
      .update(savedSearchMatches)
      .set({ alertDispatched: true })
      .where(
        and(
          eq(savedSearchMatches.savedSearchId, search.id),
          eq(savedSearchMatches.alertDispatched, false),
          lte(savedSearchMatches.id, highestMatchId)
        )
      );
    await tx
      .update(savedSearches)
      .set({
        lastAlertedAt: now,
        lastMatchedListingId: pending[0].listingId,
        updatedAt: search.updatedAt,
      })
      .where(eq(savedSearches.id, search.id));
    return true;
  });
}

/**
 * Background sweep: (1) re-runs matching for recently published listings so a missed or failed
 * publication hook (vendor or admin path) is recovered, (2) retries immediate alerts whose enqueue
 * failed, (3) sends due daily digests.
 */
export async function runSavedSearchAlertSweep(
  db: Database,
  options: {
    now?: Date;
    signal?: AbortSignal;
    listingLimit?: number;
    searchLimit?: number;
  } = {}
) {
  const now = options.now ?? new Date();
  const stats = {
    listingsScanned: 0,
    matched: 0,
    immediateEnqueued: 0,
    digestsEnqueued: 0,
  };

  const recent = await db
    .select({ id: listings.id })
    .from(listings)
    .where(
      and(
        publicListingEligibility(),
        gte(
          listings.publishedAt,
          new Date(now.getTime() - SAVED_SEARCH_SWEEP_WINDOW_MS)
        )
      )
    )
    .orderBy(asc(listings.publishedAt))
    .limit(options.listingLimit ?? 200);
  for (const listing of recent) {
    if (options.signal?.aborted) return stats;
    const result = await processListingSavedSearchMatches(listing.id, { db });
    stats.listingsScanned++;
    stats.matched += result.matchedCount;
    stats.immediateEnqueued += result.alertsEnqueued;
  }

  const pendingImmediate = await db
    .select({
      savedSearchId: savedSearchMatches.savedSearchId,
      listingId: savedSearchMatches.listingId,
    })
    .from(savedSearchMatches)
    .innerJoin(
      savedSearches,
      eq(savedSearchMatches.savedSearchId, savedSearches.id)
    )
    .where(
      and(
        eq(savedSearchMatches.alertDispatched, false),
        eq(savedSearches.isActive, true),
        eq(savedSearches.alertFrequency, "immediate")
      )
    )
    .orderBy(asc(savedSearchMatches.id))
    .limit(options.searchLimit ?? 200);
  for (const pending of pendingImmediate) {
    if (options.signal?.aborted) return stats;
    if (
      await dispatchImmediateMatch(db, pending.savedSearchId, pending.listingId)
    )
      stats.immediateEnqueued++;
  }

  const dueDaily = await db
    .selectDistinct({ id: savedSearches.id })
    .from(savedSearches)
    .innerJoin(
      savedSearchMatches,
      eq(savedSearchMatches.savedSearchId, savedSearches.id)
    )
    .where(
      and(
        eq(savedSearches.isActive, true),
        eq(savedSearches.alertFrequency, "daily"),
        eq(savedSearchMatches.alertDispatched, false),
        or(
          isNull(savedSearches.lastAlertedAt),
          lte(
            savedSearches.lastAlertedAt,
            new Date(now.getTime() - DAILY_DIGEST_INTERVAL_MS)
          )
        )
      )
    )
    .limit(options.searchLimit ?? 200);
  for (const search of dueDaily) {
    if (options.signal?.aborted) return stats;
    if (await dispatchDailyDigest(db, search.id, now)) stats.digestsEnqueued++;
  }
  return stats;
}
