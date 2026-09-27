import { prisma } from "@/lib/db/prisma";
import { requireVendor } from "@/lib/permissions";
import { saveImage } from "@/lib/storage";
import { error, handleApiError, ok } from "@/lib/api";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const user = await requireVendor();
    if (!user.vendorProfile || user.vendorProfile.approvalStatus !== "APPROVED")
      return error("Vendor approval required", 403);
    const { slug } = await params;
    const listing = await prisma.listing.findUnique({
      where: { slug },
      include: { media: true },
    });
    if (!listing || listing.vendorId !== user.vendorProfile.id)
      return error("Listing not found", 404);
    if (listing.media.length >= 8)
      return error("Maximum of 8 images per listing", 422);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return error("Image file is required", 422);
    const saved = await saveImage(file, `listings/${listing.id}`);
    const media = await prisma.listingMedia.create({
      data: {
        listingId: listing.id,
        url: saved.url,
        storageKey: saved.storageKey,
        altText: String(form.get("altText") || listing.title),
        sortOrder: listing.media.length,
      },
    });
    return ok(media, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "UNSUPPORTED_FILE_TYPE")
      return error("Only JPEG, PNG, and WebP images are allowed", 422);
    if (err instanceof Error && err.message === "FILE_TOO_LARGE")
      return error("Image must be 5MB or smaller", 422);
    return handleApiError(err);
  }
}
