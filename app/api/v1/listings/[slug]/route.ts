import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { requireVendor } from "@/lib/permissions";
import { error, handleApiError, ok } from "@/lib/api";
import { listingInputSchema } from "@/lib/validation/schemas";
import { z } from "zod";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const listing = await prisma.listing.findFirst({
    where: {
      slug,
      status: "PUBLISHED",
      vendor: { approvalStatus: "APPROVED" },
    },
    include: {
      category: true,
      media: { orderBy: { sortOrder: "asc" } },
      vendor: { include: { storefront: true } },
    },
  });
  if (!listing) return error("Listing not found", 404);
  const user = await getCurrentUser();
  await prisma.listingView.create({
    data: { listingId: listing.id, viewerId: user?.id },
  });
  return ok(listing);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const user = await requireVendor();
    const { slug } = await params;
    const listing = await prisma.listing.findUnique({ where: { slug } });
    if (!listing || listing.vendorId !== user.vendorProfile?.id)
      return error("Listing not found", 404);
    const payload = await request.json();
    const action = z
      .object({ action: z.enum(["publish", "hide", "archive"]) })
      .safeParse(payload);
    if (action.success) {
      if (
        action.data.action === "publish" &&
        user.vendorProfile.approvalStatus !== "APPROVED"
      ) {
        return error("Vendor approval required before publishing", 403);
      }
      const status =
        action.data.action === "publish"
          ? "PUBLISHED"
          : action.data.action === "hide"
            ? "HIDDEN"
            : "ARCHIVED";
      return ok(
        await prisma.listing.update({
          where: { id: listing.id },
          data: {
            status,
            publishedAt:
              status === "PUBLISHED" ? new Date() : listing.publishedAt,
          },
        }),
      );
    }
    const update = listingInputSchema.partial().safeParse(payload);
    if (!update.success) return error("Invalid listing update", 422);
    return ok(
      await prisma.listing.update({
        where: { id: listing.id },
        data: update.data,
      }),
    );
  } catch (err) {
    return handleApiError(err);
  }
}
