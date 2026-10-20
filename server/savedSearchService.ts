import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  categories,
  listings,
  savedSearches,
  savedSearchMatches,
  users,
  vendorProfiles,
} from "../drizzle/schema";
import { matchesSavedSearch, type ListingMatchCandidate } from "./savedSearchMatcher";
import { enqueueNotificationEvent } from "./notificationWorker";

export async function processListingSavedSearchMatches(listingId: number) {
  const db = await getDb();
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
    .where(and(eq(listings.id, listingId), eq(listings.status, "published")))
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
    vendorVerified: listingRow.vendor.approvalStatus === "approved",
    status: listingRow.listing.status,
  };

  const activeSearches = await db
    .select()
    .from(savedSearches)
    .where(eq(savedSearches.isActive, true));

  let matchedCount = 0;
  let alertsEnqueued = 0;

  for (const search of activeSearches) {
    const isMatch = matchesSavedSearch(
      {
        query: search.query,
        categoryId: search.categoryId,
        listingType: search.listingType,
        location: search.location,
        minPrice: search.minPrice,
        maxPrice: search.maxPrice,
        remoteOnly: search.remoteOnly,
        verifiedVendorOnly: search.verifiedVendorOnly,
      },
      candidate
    );

    if (!isMatch) continue;

    // Idempotent match insertion
    const [existingMatch] = await db
      .select({ id: savedSearchMatches.id })
      .from(savedSearchMatches)
      .where(
        and(
          eq(savedSearchMatches.savedSearchId, search.id),
          eq(savedSearchMatches.listingId, candidate.id)
        )
      )
      .limit(1);

    if (!existingMatch) {
      await db.insert(savedSearchMatches).values({
        savedSearchId: search.id,
        listingId: candidate.id,
        alertDispatched: search.alertFrequency === "immediate",
      });
      matchedCount++;

      // If immediate frequency, enqueue notification to outbox
      if (search.alertFrequency === "immediate") {
        const idempotencyKey = `saved_search_alert:${search.id}:${candidate.id}`;
        try {
          await enqueueNotificationEvent(db as any, {
            idempotencyKey,
            eventType: "INQUIRY_CREATED" as any, // reuse existing notification outbox transport
            recipientUserId: search.userId,
            entityType: "listing",
            entityId: candidate.id,
            payload: {
              subject: `New listing match: ${candidate.title}`,
              searchName: search.name,
              listingId: candidate.id,
            },
          });
        } catch (enqueueErr) {
          console.warn("[SavedSearch] Outbox enqueue fallback:", enqueueErr);
        }
        alertsEnqueued++;
      }
    }
  }

  return { matchedCount, alertsEnqueued };
}
