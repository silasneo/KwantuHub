import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { siteHeroSlides, moderationRecords } from "../drizzle/schema";
import { defaultHeroSlides, heroContentSchema } from "../shared/siteContent";
import { protectedProcedure, publicProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { encodePublicImage, mediaKey } from "./vendorMedia";
import { getPublicMediaUrl, storageHead, storagePut } from "./storage";
import { enforceAuthRateLimit } from "./accountSecurity";

type StoredSlide = typeof siteHeroSlides.$inferSelect;
let cache: { until: number; rows: StoredSlide[] } | undefined;
export function clearHeroCache() {
  cache = undefined;
}

export function activeHeroSlides(rows: StoredSlide[], now = new Date()) {
  if (!rows.length) return defaultHeroSlides;
  return rows
    .filter(
      row =>
        row.isActive &&
        (!row.startsAt || row.startsAt <= now) &&
        (!row.endsAt || row.endsAt > now)
    )
    .map(row => ({
      ...heroContentSchema.parse(row.content),
      id: String(row.id),
    }));
}

async function contentDb() {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Site content database unavailable.",
    });
  return db;
}

async function validateHeroImage(image: string) {
  if (defaultHeroSlides.some(slide => slide.image === image)) return image;
  const key = mediaKey(image);
  if (!key || !/^public\/site-content\/\d+\/[a-f0-9-]{36}\.webp$/.test(key)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Upload a site-content image before saving.",
    });
  }
  try {
    const object = await storageHead(key);
    if (
      object.ContentType !== "image/webp" ||
      !object.ContentLength ||
      object.ContentLength > 5 * 1024 * 1024
    ) {
      throw new Error("Invalid site image");
    }
  } catch (error) {
    console.error(
      "[SiteContent] Image validation failed",
      error instanceof Error ? error.name : "UnknownError"
    );
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Image is missing or storage unavailable. Upload again or retry.",
    });
  }
  return getPublicMediaUrl(key);
}

export const publicSiteContentProcedures = {
  heroSlides: publicProcedure.query(async () => {
    const now = Date.now();
    if (!cache || cache.until <= now) {
      const db = await contentDb();
      const rows = await db
        .select()
        .from(siteHeroSlides)
        .orderBy(asc(siteHeroSlides.sortOrder), asc(siteHeroSlides.id))
        .limit(100);
      cache = { rows, until: now + 30_000 };
    }
    // Schedule boundaries are evaluated per request even while rows are cached.
    return activeHeroSlides(cache.rows, new Date(now));
  }),
};

export const adminSiteContentProcedures = {
  heroSlides: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
    return (await contentDb())
      .select()
      .from(siteHeroSlides)
      .orderBy(asc(siteHeroSlides.sortOrder), asc(siteHeroSlides.id))
      .limit(100);
  }),
  uploadHeroImage: protectedProcedure
    .input(z.object({ base64: z.string().max(7_000_000) }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await contentDb();
      await enforceAuthRateLimit(
        db,
        "hero_upload",
        String(ctx.user.id),
        20,
        60 * 60_000
      );
      const bytes = await encodePublicImage(input.base64);
      try {
        return await storagePut(
          `public/site-content/${ctx.user.id}/${randomUUID()}.webp`,
          bytes,
          "image/webp"
        );
      } catch (error) {
        console.error(
          "[SiteContent] Upload failed",
          error instanceof Error ? error.name : "UnknownError"
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Image upload failed. Retry when storage is available.",
        });
      }
    }),
  saveHeroSlide: protectedProcedure
    .input(
      z
        .object({
          id: z.number().int().positive().optional(),
          revision: z.number().int().positive().optional(),
          content: heroContentSchema,
          sortOrder: z.number().int().min(0).max(10_000),
          isActive: z.boolean(),
          startsAt: z.coerce.date().nullable(),
          endsAt: z.coerce.date().nullable(),
          reason: z.string().trim().min(3).max(500),
        })
        .refine(
          input =>
            !input.startsAt || !input.endsAt || input.startsAt < input.endsAt,
          { message: "End time must be after start time.", path: ["endsAt"] }
        )
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await contentDb();
      const content = {
        ...input.content,
        image: await validateHeroImage(input.content.image),
      };
      const result = await db.transaction(async tx => {
        const rows = await tx
          .select()
          .from(siteHeroSlides)
          .orderBy(siteHeroSlides.id)
          .for("update");
        const existing = input.id
          ? rows.find(row => row.id === input.id)
          : undefined;
        if (input.id && !existing)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Slide not found.",
          });
        if (existing && input.revision !== existing.revision)
          throw new TRPCError({
            code: "CONFLICT",
            message: "Slide changed. Reload it before saving.",
          });
        if (!existing && rows.length >= 100)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Maximum 100 slides. Reuse an inactive slide.",
          });
        const values = {
          content,
          sortOrder: input.sortOrder,
          isActive: input.isActive,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
        };
        let id: number;
        if (existing) {
          id = existing.id;
          await tx
            .update(siteHeroSlides)
            .set({ ...values, revision: existing.revision + 1 })
            .where(eq(siteHeroSlides.id, id));
        } else {
          const [inserted] = await tx.insert(siteHeroSlides).values(values);
          id = inserted.insertId;
        }
        await tx
          .insert(moderationRecords)
          .values({
            entityType: "site_content",
            entityId: String(id),
            actorId: ctx.user.id,
            action: existing ? "hero_updated" : "hero_created",
            reason: input.reason,
          });
        return { id };
      });
      clearHeroCache();
      return result;
    }),
};
