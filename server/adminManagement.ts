import { asc, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import {
  categories,
  listings,
  moderationRecords,
  savedSearches,
  users,
  vendorProfiles,
} from "../drizzle/schema";

export const directorySchema = z.object({
  query: z.string().trim().max(160).optional(),
  page: z.number().int().min(1).max(2000).default(1),
});
export const listingStatusSchema = z.enum([
  "draft",
  "pending",
  "approved",
  "rejected",
  "published",
  "hidden",
  "archived",
]);
export const categoryInputSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(2).max(160),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(128)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a lowercase URL slug."),
  sortOrder: z.number().int().min(0).max(10000).default(0),
  isActive: z.boolean().default(true),
});

async function adminDb(role: string) {
  if (role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  return db;
}

export const adminManagementProcedures = {
  overview: protectedProcedure.query(async ({ ctx }) => {
    const db = await adminDb(ctx.user.role);
    const [accounts, vendors, pending, items] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(users),
      db.select({ count: sql<number>`count(*)` }).from(vendorProfiles),
      db
        .select({ count: sql<number>`count(*)` })
        .from(vendorProfiles)
        .where(eq(vendorProfiles.approvalStatus, "pending")),
      db.select({ count: sql<number>`count(*)` }).from(listings),
    ]);
    return {
      users: Number(accounts[0].count),
      vendors: Number(vendors[0].count),
      pending: Number(pending[0].count),
      listings: Number(items[0].count),
    };
  }),
  editListing: protectedProcedure
    .input(
      z.object({
        listingId: z.number().int().positive(),
        title: z.string().trim().min(3).max(220),
        description: z.string().trim().min(10).max(10000),
        categoryId: z.number().int().positive(),
        location: z.string().trim().max(160),
        priceIndication: z.string().trim().max(120),
        remoteAvailable: z.boolean(),
        reason: z.string().trim().min(3).max(1000),
        expectedRevision: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await adminDb(ctx.user.role);
      return db.transaction(async tx => {
        const [category] = await tx
          .select()
          .from(categories)
          .where(eq(categories.id, input.categoryId))
          .for("update");
        if (!category?.isActive)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Choose an active category.",
          });
        const [row] = await tx
          .select()
          .from(listings)
          .where(eq(listings.id, input.listingId))
          .for("update");
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        if (row.revision !== input.expectedRevision)
          throw new TRPCError({
            code: "CONFLICT",
            message: "Listing changed. Reload before editing.",
          });
        const { listingId, reason, expectedRevision, ...values } = input;
        await tx
          .update(listings)
          .set(values)
          .where(eq(listings.id, listingId));
        await tx
          .insert(moderationRecords)
          .values({
            entityType: "listing",
            entityId: String(listingId),
            actorId: ctx.user.id,
            action: "listing_edited",
            reason,
          });
        return { success: true };
      });
    }),
  removeCategory: protectedProcedure
    .input(
      z.object({
        categoryId: z.number().int().positive(),
        mergeIntoId: z.number().int().positive().optional(),
        reason: z.string().trim().min(3).max(1000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await adminDb(ctx.user.role);
      return db.transaction(async tx => {
        const all = await tx
          .select()
          .from(categories)
          .orderBy(asc(categories.id))
          .for("update");
        const source = all.find(row => row.id === input.categoryId);
        if (!source) throw new TRPCError({ code: "NOT_FOUND" });
        if (all.some(row => row.parentId === source.id))
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Move child categories first.",
          });
        const [itemCount] = await tx
          .select({ count: sql<number>`count(*)` })
          .from(listings)
          .where(eq(listings.categoryId, source.id));
        const [searchCount] = await tx
          .select({ count: sql<number>`count(*)` })
          .from(savedSearches)
          .where(eq(savedSearches.categoryId, source.id));
        if (input.mergeIntoId) {
          const target = all.find(row => row.id === input.mergeIntoId);
          if (!target?.isActive || target.id === source.id)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Choose a different active target category.",
            });
          await tx
            .update(listings)
            .set({ categoryId: target.id })
            .where(eq(listings.categoryId, source.id));
          await tx
            .update(savedSearches)
            .set({ categoryId: target.id })
            .where(eq(savedSearches.categoryId, source.id));
        } else if (Number(itemCount.count) || Number(searchCount.count)) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Category is referenced by listings or saved searches. Merge it or hide it instead.",
          });
        }
        await tx.delete(categories).where(eq(categories.id, source.id));
        await tx
          .insert(moderationRecords)
          .values({
            entityType: "category",
            entityId: String(source.id),
            actorId: ctx.user.id,
            action: input.mergeIntoId ? "category_merged" : "category_deleted",
            reason: JSON.stringify({
              reason: input.reason,
              target: input.mergeIntoId,
              listings: Number(itemCount.count),
              searches: Number(searchCount.count),
            }),
          });
        return { success: true };
      });
    }),
};
