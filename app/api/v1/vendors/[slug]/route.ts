import { prisma } from "@/lib/db/prisma";
import { error, ok } from "@/lib/api";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const vendor = await prisma.vendorProfile.findFirst({
    where: { approvalStatus: "APPROVED", storefront: { slug } },
    include: {
      storefront: true,
      listings: {
        where: { status: "PUBLISHED" },
        orderBy: { publishedAt: "desc" },
      },
    },
  });
  if (!vendor) return error("Vendor not found", 404);
  return ok(vendor);
}
