export type SavedSearchFilterInput = {
  query?: string | null;
  categoryId?: number | null;
  listingType?: "product" | "service" | null;
  location?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  remoteOnly?: boolean;
  verifiedVendorOnly?: boolean;
};

export type ListingMatchCandidate = {
  id: number;
  title: string;
  description: string;
  categoryId: number;
  listingType: "product" | "service";
  location?: string | null;
  priceIndication?: string | null;
  remoteAvailable: boolean;
  vendorVerified: boolean;
  status: string;
};

export function matchesSavedSearch(
  filters: SavedSearchFilterInput,
  listing: ListingMatchCandidate
): boolean {
  if (listing.status !== "published") return false;

  if (filters.query && filters.query.trim()) {
    const term = filters.query.trim().toLowerCase();
    const titleMatch = listing.title.toLowerCase().includes(term);
    const descMatch = listing.description.toLowerCase().includes(term);
    if (!titleMatch && !descMatch) return false;
  }

  if (filters.categoryId && filters.categoryId !== listing.categoryId) {
    return false;
  }

  if (filters.listingType && filters.listingType !== listing.listingType) {
    return false;
  }

  if (filters.remoteOnly && !listing.remoteAvailable) {
    return false;
  }

  if (filters.verifiedVendorOnly && !listing.vendorVerified) {
    return false;
  }

  if (filters.location && filters.location.trim()) {
    const loc = filters.location.trim().toLowerCase();
    if (!listing.location || !listing.location.toLowerCase().includes(loc)) {
      return false;
    }
  }

  return true;
}
