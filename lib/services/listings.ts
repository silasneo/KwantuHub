import { prisma } from "@/lib/db/prisma";
import type { ListingType, Prisma } from "@prisma/client";

export type ListingSearch = {
  q?: string;
  category?: string;
  type?: ListingType;
  location?: string;
  price?: string;
  remote?: boolean;
  verified?: boolean;
  sort: "newest" | "oldest" | "title";
  page: number;
  pageSize: number;
};

export async function findListings(params: ListingSearch) {
  const where: Prisma.ListingWhereInput = {
    status: "PUBLISHED",
    vendor: { approvalStatus: "APPROVED" },
    ...(params.q
      ? {
          OR: [
            { title: { contains: params.q, mode: "insensitive" } },
            { description: { contains: params.q, mode: "insensitive" } },
            {
              vendor: {
                businessName: { contains: params.q, mode: "insensitive" },
              },
            },
          ],
        }
      : {}),
    ...(params.category ? { category: { slug: params.category } } : {}),
    ...(params.type ? { listingType: params.type } : {}),
    ...(params.location
      ? { location: { contains: params.location, mode: "insensitive" } }
      : {}),
    ...(params.price
      ? { priceIndication: { contains: params.price, mode: "insensitive" } }
      : {}),
    ...(params.remote ? { remoteAvailable: true } : {}),
  };

  const orderBy: Prisma.ListingOrderByWithRelationInput =
    params.sort === "oldest"
      ? { publishedAt: "asc" }
      : params.sort === "title"
        ? { title: "asc" }
        : { publishedAt: "desc" };

  const [items, total] = await prisma.$transaction([
    prisma.listing.findMany({
      where,
      include: {
        category: true,
        vendor: { include: { storefront: true } },
        media: { orderBy: { sortOrder: "asc" }, take: 1 },
      },
      orderBy,
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.listing.count({ where }),
  ]);

  return {
    items,
    pagination: {
      page: params.page,
      pageSize: params.pageSize,
      total,
      totalPages: Math.ceil(total / params.pageSize),
    },
  };
}
