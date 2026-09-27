import { prisma } from "@/lib/db/prisma";
import { requireVendor } from "@/lib/permissions";
import { getStableStorefrontSlug } from "@/lib/services/storefronts";
import { error, handleApiError, ok } from "@/lib/api";
import { z } from "zod";

const profileSchema = z.object({
  businessName: z.string().min(2).max(160),
  description: z.string().max(2000).optional(),
  location: z.string().max(120).optional(),
  serviceArea: z.string().max(240).optional(),
  remoteAvailable: z.boolean().default(false),
  contactEmail: z.string().email().optional(),
  website: z.string().url().optional(),
});

export async function GET() {
  return ok(
    await prisma.vendorProfile.findMany({
      where: { approvalStatus: "APPROVED" },
      include: { storefront: true },
      orderBy: { businessName: "asc" },
    }),
  );
}

export async function PATCH(request: Request) {
  try {
    const user = await requireVendor();
    if (!user.vendorProfile) return error("Vendor profile not found", 404);
    const parsed = profileSchema.safeParse(await request.json());
    if (!parsed.success) return error("Invalid vendor profile", 422);
    const slug = await getStableStorefrontSlug(
      parsed.data.businessName,
      user.vendorProfile.id,
      user.vendorProfile.storefront?.slug,
    );
    const profile = await prisma.$transaction(async (tx) => {
      await tx.vendorProfile.update({
        where: { id: user.vendorProfile!.id },
        data: { ...parsed.data, approvalStatus: "PENDING" },
      });
      await tx.storefront.upsert({
        where: { vendorId: user.vendorProfile!.id },
        update: {
          displayName: parsed.data.businessName,
          description: parsed.data.description,
          location: parsed.data.location,
          remoteAvailable: parsed.data.remoteAvailable,
          website: parsed.data.website,
        },
        create: {
          vendorId: user.vendorProfile!.id,
          slug,
          displayName: parsed.data.businessName,
          description: parsed.data.description,
          location: parsed.data.location,
          remoteAvailable: parsed.data.remoteAvailable,
          website: parsed.data.website,
        },
      });
      return tx.vendorProfile.findUniqueOrThrow({
        where: { id: user.vendorProfile!.id },
        include: { storefront: true },
      });
    });
    return ok(profile);
  } catch (err) {
    return handleApiError(err);
  }
}
