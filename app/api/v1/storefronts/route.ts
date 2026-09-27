import { prisma } from "@/lib/db/prisma";
import { requireVendor } from "@/lib/permissions";
import { getStableStorefrontSlug } from "@/lib/services/storefronts";
import { error, handleApiError, ok } from "@/lib/api";
import { z } from "zod";

const schema = z.object({
  displayName: z.string().min(2).max(160),
  headline: z.string().max(240).optional(),
  description: z.string().max(2000).optional(),
  location: z.string().max(120).optional(),
  serviceArea: z.string().max(240).optional(),
  remoteAvailable: z.boolean().default(false),
  website: z.string().url().optional(),
});

export async function GET() {
  try {
    const user = await requireVendor();
    return ok(
      await prisma.storefront.findUnique({
        where: { vendorId: user.vendorProfile!.id },
        include: { listings: { where: { status: "PUBLISHED" } } },
      }),
    );
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireVendor();
    if (!user.vendorProfile || user.vendorProfile.approvalStatus !== "APPROVED")
      return error("Vendor approval required", 403);
    const data = schema.parse(await request.json());
    const existing = await prisma.storefront.findUnique({
      where: { vendorId: user.vendorProfile.id },
    });
    const slug = await getStableStorefrontSlug(
      data.displayName,
      user.vendorProfile.id,
      existing?.slug,
    );
    const storefront = await prisma.storefront.upsert({
      where: { vendorId: user.vendorProfile.id },
      update: data,
      create: { ...data, slug, vendorId: user.vendorProfile.id },
    });
    return ok(storefront);
  } catch (err) {
    return handleApiError(err);
  }
}
