import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/permissions";
import { error, handleApiError, ok } from "@/lib/api";
import { z } from "zod";
export async function GET() {
  try {
    const user = await requireAuth();
    return ok(
      await prisma.wishlist.findMany({
        where: { buyerId: user.id },
        include: { listing: { include: { vendor: true, category: true } } },
        orderBy: { createdAt: "desc" },
      }),
    );
  } catch (err) {
    return handleApiError(err);
  }
}
export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const { listingId } = z
      .object({ listingId: z.string().cuid() })
      .parse(await request.json());
    const listing = await prisma.listing.findFirst({
      where: { id: listingId, status: "PUBLISHED" },
    });
    if (!listing) return error("Listing not found", 404);
    return ok(
      await prisma.wishlist.upsert({
        where: { buyerId_listingId: { buyerId: user.id, listingId } },
        update: {},
        create: { buyerId: user.id, listingId },
      }),
      { status: 201 },
    );
  } catch (err) {
    return handleApiError(err);
  }
}
export async function DELETE(request: Request) {
  try {
    const user = await requireAuth();
    const { listingId } = z
      .object({ listingId: z.string().cuid() })
      .parse(await request.json());
    await prisma.wishlist.deleteMany({
      where: { buyerId: user.id, listingId },
    });
    return ok({ removed: true });
  } catch (err) {
    return handleApiError(err);
  }
}
