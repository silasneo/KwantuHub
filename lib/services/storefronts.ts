import { prisma } from "@/lib/db/prisma";

export function slugifyStorefront(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function getStableStorefrontSlug(
  displayName: string,
  vendorId: string,
  currentSlug?: string | null,
) {
  if (currentSlug) return currentSlug;
  const base = slugifyStorefront(displayName) || `vendor-${vendorId.slice(-8)}`;
  const existing = await prisma.storefront.findUnique({
    where: { slug: base },
  });
  if (!existing || existing.vendorId === vendorId) return base;
  return `${base}-${vendorId.slice(-8)}`;
}
