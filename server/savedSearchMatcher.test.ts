import { describe, expect, it } from "vitest";
import { matchesSavedSearch, type ListingMatchCandidate } from "./savedSearchMatcher";

describe("Stage 4D saved search matching policy", () => {
  const sampleListing: ListingMatchCandidate = {
    id: 101,
    title: "Handwoven Kente Cloth Stole",
    description: "Authentic royal pattern from Ghana, ships across North America",
    categoryId: 3,
    listingType: "product",
    location: "Toronto, Canada",
    remoteAvailable: true,
    vendorVerified: true,
    status: "published",
  };

  it("matches listings based on title or description keywords", () => {
    expect(matchesSavedSearch({ query: "kente" }, sampleListing)).toBe(true);
    expect(matchesSavedSearch({ query: "royal" }, sampleListing)).toBe(true);
    expect(matchesSavedSearch({ query: "ceramics" }, sampleListing)).toBe(false);
  });

  it("enforces category and listingType constraints strictly", () => {
    expect(matchesSavedSearch({ categoryId: 3 }, sampleListing)).toBe(true);
    expect(matchesSavedSearch({ categoryId: 4 }, sampleListing)).toBe(false);
    expect(matchesSavedSearch({ listingType: "product" }, sampleListing)).toBe(true);
    expect(matchesSavedSearch({ listingType: "service" }, sampleListing)).toBe(false);
  });

  it("respects verifiedVendorOnly and remoteOnly filters", () => {
    expect(matchesSavedSearch({ verifiedVendorOnly: true }, sampleListing)).toBe(true);
    expect(
      matchesSavedSearch(
        { verifiedVendorOnly: true },
        { ...sampleListing, vendorVerified: false }
      )
    ).toBe(false);

    expect(matchesSavedSearch({ remoteOnly: true }, sampleListing)).toBe(true);
    expect(
      matchesSavedSearch(
        { remoteOnly: true },
        { ...sampleListing, remoteAvailable: false }
      )
    ).toBe(false);
  });

  it("never matches unpublished or draft listings", () => {
    expect(
      matchesSavedSearch(
        { query: "kente" },
        { ...sampleListing, status: "draft" }
      )
    ).toBe(false);
    expect(
      matchesSavedSearch(
        { query: "kente" },
        { ...sampleListing, status: "archived" }
      )
    ).toBe(false);
  });
  it("does not generate matches outside decimal bounds or across currencies", () => {
    const listing = { ...sampleListing, priceIndication: "USD 50.25-100.75" };
    expect(matchesSavedSearch({ minPrice: 101 }, listing)).toBe(false);
    expect(matchesSavedSearch({ maxPrice: 50.24 }, listing)).toBe(false);
    expect(matchesSavedSearch({ minPrice: 75.5, maxPrice: 80.5 }, listing)).toBe(true);
    expect(matchesSavedSearch({ minPrice: 50, currency: "CAD" }, listing)).toBe(false);
    expect(matchesSavedSearch({ minPrice: NaN }, listing)).toBe(false);
    expect(matchesSavedSearch({ minPrice: 1 }, { ...listing, priceIndication: "Inquire" })).toBe(false);
  });
  it("shares the listing-or-vendor remote policy and location matching", () => {
    expect(matchesSavedSearch({ remoteOnly: true }, { ...sampleListing, remoteAvailable: false, vendorRemoteAvailable: true })).toBe(true);
    expect(matchesSavedSearch({ location: "toronto" }, sampleListing)).toBe(true);
    expect(matchesSavedSearch({ location: "Boston" }, sampleListing)).toBe(false);
  });
});
