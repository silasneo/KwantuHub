import { prisma } from "@/lib/db/prisma";
import { ok } from "@/lib/api";
export async function GET() {
  const categories = await prisma.category.findMany({
    where: { isActive: true, parentId: null },
    include: {
      children: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
    },
    orderBy: { sortOrder: "asc" },
  });
  return ok(categories);
}
