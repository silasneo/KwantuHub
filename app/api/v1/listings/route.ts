import { prisma } from "@/lib/db/prisma";
import { requireVendor } from "@/lib/permissions";
import { findListings } from "@/lib/services/listings";
import { error, handleApiError, ok } from "@/lib/api";
import {
  listingInputSchema,
  listingQuerySchema,
} from "@/lib/validation/schemas";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("mine") === "true") {
      const user = await requireVendor();
      const items = await prisma.listing.findMany({
        where: { vendorId: user.vendorProfile!.id },
        include: { category: true, media: { orderBy: { sortOrder: "asc" } } },
        orderBy: { updatedAt: "desc" },
      });
      return ok({ items });
    }

    const parsed = listingQuerySchema.safeParse(
      Object.fromEntries(url.searchParams),
    );
    if (!parsed.success) return error("Invalid search parameters", 422);
    return ok(await findListings(parsed.data));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireVendor();
    if (
      !user.vendorProfile ||
      user.vendorProfile.approvalStatus !== "APPROVED"
    ) {
      return error("Vendor approval required before creating listings", 403);
    }
    const parsed = listingInputSchema.safeParse(await request.json());
    if (!parsed.success) return error("Invalid listing data", 422);
    const storefront = await prisma.storefront.findUnique({
      where: { vendorId: user.vendorProfile.id },
    });
    if (!storefront)
      return error("Create your storefront before adding listings", 409);
    const listing = await prisma.listing.create({
      data: {
        ...parsed.data,
        vendorId: user.vendorProfile.id,
        storefrontId: storefront.id,
        status: "DRAFT",
      },
    });
    return ok(listing, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
