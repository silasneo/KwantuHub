export type DiscoveryCurrency = "USD" | "CAD";
export type DiscoveryBounds = {
  categoryId?: number | null;
  minPrice?: number | null;
  maxPrice?: number | null;
};

export function validateDiscoveryBounds(filters: DiscoveryBounds): void {
  if (filters.categoryId != null && (!Number.isSafeInteger(filters.categoryId) || filters.categoryId <= 0)) {
    throw new Error("Select a valid category.");
  }
  for (const value of [filters.minPrice, filters.maxPrice]) {
    if (value != null && (!Number.isFinite(value) || value < 0)) {
      throw new Error("Prices must be finite, non-negative numbers.");
    }
    if (value != null && (value > 9_999_999_999.99 || Number(value.toFixed(2)) !== value)) {
      throw new Error("Price bounds must be at most 9,999,999,999.99 with no more than two decimal places; extra precision is not rounded.");
    }
  }
  if (filters.minPrice != null && filters.maxPrice != null && filters.minPrice > filters.maxPrice) {
    throw new Error("Minimum price cannot exceed maximum price.");
  }
}

export function parsePriceIndication(value?: string | null): { min: number; max: number; currency: DiscoveryCurrency } | null {
  if (!value) return null;
  const text = value.trim().toUpperCase();
  const currencies = text.match(/USD|CAD|CA\$|US\$/g) || [];
  if (currencies.some(currency => currency.startsWith("CA")) && currencies.some(currency => currency.startsWith("US"))) return null;
  const currency: DiscoveryCurrency = currencies.some(currency => currency.startsWith("CA")) ? "CAD" : "USD";
  const amount = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?`;
  const marker = String.raw`(?:(?:USD|CAD|CA\$|US\$|\$)\s*)?`;
  const match = text.match(new RegExp(`^${marker}(${amount})(?:\\s*(?:-|–|—|TO)\\s*${marker}(${amount}))?\\s*(?:USD|CAD)?$`));
  if (!match) return null;
  const min = Number(match[1].replace(/,/g, ""));
  const max = match[2] ? Number(match[2].replace(/,/g, "")) : min;
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return null;
  return { min, max, currency };
}

export function matchesPriceRange(
  price: string | null | undefined,
  min?: number | null,
  max?: number | null,
  currency: DiscoveryCurrency = "USD",
): boolean {
  validateDiscoveryBounds({ minPrice: min, maxPrice: max });
  if (min == null && max == null) return true;
  const parsed = parsePriceIndication(price);
  return parsed != null && parsed.currency === currency &&
    (min == null || parsed.max >= min) && (max == null || parsed.min <= max);
}

export type DiscoveryFilterInput = DiscoveryBounds & {
  query?: string | null;
  listingType?: "product" | "service" | null;
  location?: string | null;
  remoteOnly?: boolean;
  verifiedVendorOnly?: boolean;
  currency?: DiscoveryCurrency | null;
};
export type DiscoveryCandidate = {
  id: number;
  title: string;
  description: string;
  categoryId: number;
  listingType: "product" | "service";
  location?: string | null;
  priceIndication?: string | null;
  remoteAvailable: boolean;
  vendorRemoteAvailable?: boolean;
  vendorVerified: boolean;
  status: string;
};

export function matchesDiscoveryListing(filters: DiscoveryFilterInput, listing: DiscoveryCandidate): boolean {
  try { validateDiscoveryBounds(filters); } catch { return false; }
  const term = filters.query?.trim().toLowerCase();
  const location = filters.location?.trim().toLowerCase();
  return listing.status === "published" &&
    (!term || listing.title.toLowerCase().includes(term) || listing.description.toLowerCase().includes(term)) &&
    (filters.categoryId == null || filters.categoryId === listing.categoryId) &&
    (!filters.listingType || filters.listingType === listing.listingType) &&
    (!filters.remoteOnly || listing.remoteAvailable || Boolean(listing.vendorRemoteAvailable)) &&
    (!filters.verifiedVendorOnly || listing.vendorVerified) &&
    (!location || Boolean(listing.location?.toLowerCase().includes(location))) &&
    matchesPriceRange(listing.priceIndication, filters.minPrice, filters.maxPrice, filters.currency || "USD");
}
