import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/permissions";
import { error, handleApiError, ok } from "@/lib/api";
import { z } from "zod";
const schema = z.object({
  listingId: z.string().cuid(),
  subject: z.string().min(3).max(160),
  message: z.string().min(5).max(2000),
});
export async function GET() {
  try {
    const user = await requireAuth();
    const where =
      user.role === "VENDOR" && user.vendorProfile
        ? { vendorId: user.vendorProfile.id }
        : { buyerId: user.id };
    return ok(
      await prisma.inquiry.findMany({
        where,
        include: {
          listing: true,
          buyer: { select: { name: true, email: true } },
          messages: { orderBy: { createdAt: "asc" } },
        },
        orderBy: { updatedAt: "desc" },
      }),
    );
  } catch (err) {
    return handleApiError(err);
  }
}
export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    if (user.role !== "BUYER")
      return error("Only buyers can submit inquiries", 403);
    const body = schema.parse(await request.json());
    const listing = await prisma.listing.findFirst({
      where: { id: body.listingId, status: "PUBLISHED" },
    });
    if (!listing) return error("Listing not found", 404);
    const inquiry = await prisma.inquiry.create({
      data: {
        listingId: listing.id,
        buyerId: user.id,
        vendorId: listing.vendorId,
        subject: body.subject,
        messages: { create: { senderId: user.id, body: body.message } },
      },
      include: { messages: true },
    });
    await prisma.analyticsEvent.create({
      data: {
        eventType: "INQUIRY_CREATED",
        userId: user.id,
        listingId: listing.id,
      },
    });
    return ok(inquiry, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
