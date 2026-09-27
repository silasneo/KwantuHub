import { prisma } from "@/lib/db/prisma";
import { requireAdmin } from "@/lib/permissions";
import { handleApiError, ok } from "@/lib/api";
import { z } from "zod";
export async function GET() {
  try {
    await requireAdmin();
    return ok(
      await prisma.vendorProfile.findMany({
        where: { approvalStatus: "PENDING" },
        include: { user: { select: { email: true, name: true } } },
        orderBy: { createdAt: "asc" },
      }),
    );
  } catch (err) {
    return handleApiError(err);
  }
}
export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const body = z
      .object({
        vendorId: z.string().cuid(),
        status: z.enum(["APPROVED", "REJECTED", "SUSPENDED"]),
      })
      .parse(await request.json());
    const profile = await prisma.vendorProfile.update({
      where: { id: body.vendorId },
      data: {
        approvalStatus: body.status,
        approvedAt: body.status === "APPROVED" ? new Date() : null,
      },
    });
    return ok(profile);
  } catch (err) {
    return handleApiError(err);
  }
}
