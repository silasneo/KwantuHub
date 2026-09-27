import { prisma } from "@/lib/db/prisma";
import { requireVendor } from "@/lib/permissions";
import { handleApiError, ok } from "@/lib/api";
export async function GET() {
  try {
    const user = await requireVendor();
    const vendorId = user.vendorProfile!.id;
    const [views, saves, inquiries] = await prisma.$transaction([
      prisma.listingView.count({ where: { listing: { vendorId } } }),
      prisma.wishlist.count({ where: { listing: { vendorId } } }),
      prisma.inquiry.count({ where: { vendorId } }),
    ]);
    return ok({ views, saves, inquiries });
  } catch (err) {
    return handleApiError(err);
  }
}
