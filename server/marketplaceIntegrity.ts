import { TRPCError } from "@trpc/server";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import {
  analyticsEvents, inquiries, listings, messages, notificationOutbox,
  users, vendorProfiles, wishlists,
} from "../drizzle/schema";
import { getDb } from "./db";
import { publicListingEligibility } from "./publicEligibility";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Inquiry = typeof inquiries.$inferSelect;

function assertUnrestricted(inquiry: Inquiry) {
  if (inquiry.moderatorSuspendedAt) throw new TRPCError({
    code: "FORBIDDEN", message: "This conversation is restricted by an administrator. Contact support.",
  });
}

async function participantInquiry(tx: Transaction, inquiryId: number, userId: number, vendorId?: number) {
  const [inquiry] = await tx.select().from(inquiries).where(and(
    eq(inquiries.id, inquiryId),
    vendorId === undefined ? eq(inquiries.buyerId, userId) : eq(inquiries.vendorId, vendorId)
  )).for("update");
  if (!inquiry) throw new TRPCError({ code: "NOT_FOUND", message: "Inquiry not found." });
  assertUnrestricted(inquiry);
  return inquiry;
}

export async function toggleMarketplaceWishlist(db: Database, buyerId: number, listingId: number) {
  return db.transaction(async tx => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, buyerId)).for("update");
    const [existing] = await tx.select().from(wishlists).where(and(
      eq(wishlists.buyerId, buyerId), eq(wishlists.listingId, listingId)
    ));
    if (existing) {
      await tx.delete(wishlists).where(eq(wishlists.id, existing.id));
      return { saved: false };
    }
    const [listing] = await tx.select().from(listings).where(and(eq(listings.id, listingId), publicListingEligibility()));
    if (!listing) throw new TRPCError({ code: "NOT_FOUND", message: "Listing is no longer available." });
    await tx.insert(wishlists).values({ buyerId, listingId });
    await tx.insert(analyticsEvents).values({ eventType: "save_listing", userId: buyerId, vendorId: listing.vendorId, listingId });
    return { saved: true };
  });
}

export async function createMarketplaceInquiry(db: Database, buyerId: number, input: {
  listingId: number; subject: string; message: string; clientRequestId?: string;
}) {
  return db.transaction(async tx => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, buyerId)).for("update");
    const [retry] = input.clientRequestId ? await tx.select().from(inquiries).where(and(
      eq(inquiries.buyerId, buyerId), eq(inquiries.clientRequestId, input.clientRequestId)
    )) : [];
    const [recent] = retry ? [retry] : await tx.select().from(inquiries).where(and(
      eq(inquiries.buyerId, buyerId), eq(inquiries.listingId, input.listingId),
      gt(inquiries.createdAt, new Date(Date.now() - 24 * 60 * 60_000))
    )).orderBy(desc(inquiries.id)).limit(1);
    if (recent) {
      const [first] = await tx.select().from(messages).where(eq(messages.inquiryId, recent.id)).orderBy(messages.id).limit(1);
      if (recent.listingId === input.listingId && recent.subject === input.subject && first?.body === input.message) {
        assertUnrestricted(recent);
        return { id: recent.id, success: true, reused: true };
      }
      throw new TRPCError({ code: "CONFLICT", message: "You already have a recent inquiry for this listing, or this request identifier was used. Open the existing conversation." });
    }
    const [listing] = await tx.select({ listing: listings, ownerId: vendorProfiles.userId }).from(listings)
      .innerJoin(vendorProfiles, eq(listings.vendorId, vendorProfiles.id))
      .where(and(eq(listings.id, input.listingId), publicListingEligibility()));
    if (!listing) throw new TRPCError({ code: "NOT_FOUND", message: "Listing is no longer available." });
    if (listing.ownerId === buyerId) throw new TRPCError({ code: "FORBIDDEN", message: "You cannot inquire about your own listing." });
    const [created] = await tx.insert(inquiries).values({
      listingId: input.listingId, buyerId, vendorId: listing.listing.vendorId,
      subject: input.subject, clientRequestId: input.clientRequestId ?? null,
    });
    await tx.insert(messages).values({ inquiryId: created.insertId, senderId: buyerId, body: input.message });
    await tx.insert(notificationOutbox).values({
      eventType: "INQUIRY_CREATED", idempotencyKey: `inquiry_created:${created.insertId}:${listing.ownerId}`,
      recipientUserId: listing.ownerId, actorUserId: buyerId, entityType: "inquiry", entityId: created.insertId,
      payload: { inquiryId: created.insertId, listingId: input.listingId, subject: input.subject,
        actionUrl: `/vendor?tab=inquiries&inquiry=${created.insertId}` },
    });
    await tx.insert(analyticsEvents).values({
      eventType: "submit_inquiry", userId: buyerId, vendorId: listing.listing.vendorId, listingId: input.listingId,
    });
    return { id: created.insertId, success: true, reused: false };
  });
}

export async function replyToMarketplaceInquiry(db: Database, userId: number, input: {
  inquiryId: number; message: string;
}, vendorId?: number) {
  return db.transaction(async tx => {
    const inquiry = await participantInquiry(tx, input.inquiryId, userId, vendorId);
    if (inquiry.status !== "open") throw new TRPCError({ code: "BAD_REQUEST", message: "This inquiry is closed or archived." });
    const [vendor] = await tx.select({ userId: vendorProfiles.userId }).from(vendorProfiles).where(eq(vendorProfiles.id, inquiry.vendorId));
    if (!vendor) throw new TRPCError({ code: "NOT_FOUND", message: "Vendor not found." });
    const [message] = await tx.insert(messages).values({ inquiryId: inquiry.id, senderId: userId, body: input.message });
    await tx.update(inquiries).set({ updatedAt: new Date() }).where(eq(inquiries.id, inquiry.id));
    const recipientId = vendorId === undefined ? vendor.userId : inquiry.buyerId;
    await tx.insert(notificationOutbox).values({
      eventType: "INQUIRY_REPLY_RECEIVED", idempotencyKey: `inquiry_reply_received:${message.insertId}:${recipientId}`,
      recipientUserId: recipientId, actorUserId: userId, entityType: "message", entityId: message.insertId,
      payload: { inquiryId: inquiry.id, listingId: inquiry.listingId, subject: `Reply to: ${inquiry.subject}`,
        actionUrl: `/${vendorId === undefined ? "vendor" : "account"}?tab=inquiries&inquiry=${inquiry.id}` },
    });
    return { id: message.insertId, success: true };
  });
}

export async function transitionMarketplaceInquiry(db: Database, userId: number, inquiryId: number,
  action: "close" | "reopen" | "archive" | "unarchive", vendorId?: number
) {
  return db.transaction(async tx => {
    const inquiry = await participantInquiry(tx, inquiryId, userId, vendorId);
    const status = action === "close" ? "closed" : action === "archive" ? "archived"
      : action === "unarchive" ? inquiry.archivedFromStatus ?? "open" : "open";
    if (action === "reopen" && inquiry.status !== "closed" || action === "unarchive" && inquiry.status !== "archived" ||
        action === "close" && inquiry.status === "archived") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "This conversation state does not allow that action." });
    }
    if (status === inquiry.status) return { success: true };
    await tx.update(inquiries).set({
      status, archivedFromStatus: action === "archive" ? inquiry.status === "closed" ? "closed" : "open" : null,
      updatedAt: new Date(),
    }).where(eq(inquiries.id, inquiry.id));
    if (action === "close") {
      const [vendor] = await tx.select({ userId: vendorProfiles.userId }).from(vendorProfiles).where(eq(vendorProfiles.id, inquiry.vendorId));
      if (!vendor) throw new TRPCError({ code: "NOT_FOUND", message: "Vendor not found." });
      const recipientId = vendorId === undefined ? vendor.userId : inquiry.buyerId;
      // A transactionally generated UUID distinguishes separate close/reopen cycles.
      await tx.insert(notificationOutbox).values({
        eventType: "INQUIRY_RESOLVED", idempotencyKey: sql`CONCAT('inquiry_resolved:', ${inquiry.id}, ':', UUID())`,
        recipientUserId: recipientId, actorUserId: userId, entityType: "inquiry", entityId: inquiry.id,
        payload: { inquiryId: inquiry.id, listingId: inquiry.listingId, subject: inquiry.subject,
          actionUrl: `/${vendorId === undefined ? "vendor" : "account"}?tab=inquiries&inquiry=${inquiry.id}` },
      });
    }
    return { success: true };
  });
}
