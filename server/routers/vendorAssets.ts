import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { storagePut } from "../storage";
import { protectedProcedure, router } from "../_core/trpc";

const MAX_ASSET_BYTES = 5 * 1024 * 1024;
const acceptedMimeTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
const assetInput = z.object({
  originalName: z.string().trim().min(1).max(255),
  mimeType: z.enum(acceptedMimeTypes),
  byteSize: z.number().int().positive().max(MAX_ASSET_BYTES),
  label: z.string().trim().min(1).max(160),
  kind: z.enum(["storefront", "listing", "document"]),
  dataBase64: z.string().min(1),
});

function cleanFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").slice(0, 120) || "vendor-asset";
}

function decodeBase64(encoded: string) {
  const value = encoded.replace(/^data:[^;]+;base64,/, "");
  return Buffer.from(value, "base64");
}

export const vendorAssetsRouter = router({
  list: protectedProcedure.query(({ ctx }) => db.listVendorAssets(ctx.user.id)),

  upload: protectedProcedure.input(assetInput).mutation(async ({ ctx, input }) => {
    const bytes = decodeBase64(input.dataBase64);
    if (bytes.length === 0 || bytes.length > MAX_ASSET_BYTES || bytes.length !== input.byteSize) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "The file could not be validated. Upload an image or PDF up to 5 MB." });
    }

    const fileKey = `vendors/${ctx.user.id}/${Date.now()}-${cleanFileName(input.originalName)}`;
    const stored = await storagePut(fileKey, bytes, input.mimeType);
    return db.createVendorAsset({
      ownerId: ctx.user.id,
      fileKey: stored.key,
      url: stored.url,
      originalName: input.originalName,
      mimeType: input.mimeType,
      byteSize: input.byteSize,
      kind: input.kind,
      label: input.label,
    });
  }),

  remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const deleted = await db.removeVendorAsset(ctx.user.id, input.id);
    if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "This asset could not be found." });
    return { success: true } as const;
  }),
});

export { MAX_ASSET_BYTES, acceptedMimeTypes, cleanFileName, decodeBase64 };
