import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/permissions";
import { error, handleApiError, ok } from "@/lib/api";
import { z } from "zod";
export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const body = z
      .object({
        inquiryId: z.string().cuid(),
        body: z.string().min(1).max(2000),
      })
      .parse(await request.json());
    const inquiry = await prisma.inquiry.findUnique({
      where: { id: body.inquiryId },
    });
    if (!inquiry) return error("Inquiry not found", 404);
    const allowed =
      inquiry.buyerId === user.id ||
      (user.role === "VENDOR" && user.vendorProfile?.id === inquiry.vendorId);
    if (!allowed) return error("Forbidden", 403);
    return ok(
      await prisma.message.create({
        data: { inquiryId: inquiry.id, senderId: user.id, body: body.body },
      }),
      { status: 201 },
    );
  } catch (err) {
    return handleApiError(err);
  }
}
