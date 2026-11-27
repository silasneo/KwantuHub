import { describe, expect, it } from "vitest";
import { matchesPriceRange, parsePriceIndication, validateDiscoveryBounds } from "../shared/discoveryFilters";

describe("discovery price semantics", () => {
  it("parses ranges and decimals without concatenating or rounding", () => {
    expect(parsePriceIndication("$50.25-100.75")).toEqual({ min: 50.25, max: 100.75, currency: "USD" });
    expect(parsePriceIndication("CAD 1,000.01")).toEqual({ min: 1000.01, max: 1000.01, currency: "CAD" });
    expect(matchesPriceRange("50-100", 75, 80)).toBe(true);
    expect(matchesPriceRange("50-100", 101)).toBe(false);
    expect(matchesPriceRange("$19.99", 20)).toBe(false);
  });
  it("never converts currencies or guesses ambiguous prices", () => {
    expect(matchesPriceRange("CAD 50", 40, 60)).toBe(false);
    expect(matchesPriceRange("CAD 50", 40, 60, "CAD")).toBe(true);
    for (const value of ["Inquire", "from $50", "$50/hour", "USD 50-CAD 100", "100-50", "-10"]) {
      expect(parsePriceIndication(value)).toBeNull();
      expect(matchesPriceRange(value, 0)).toBe(false);
      expect(matchesPriceRange(value)).toBe(true);
    }
  });
  it("rejects invalid category IDs and bounds", () => {
    for (const filters of [{ categoryId: 0 }, { categoryId: 1.5 }, { minPrice: NaN }, { maxPrice: Infinity }, { minPrice: -1 }, { minPrice: 10, maxPrice: 9 }, { minPrice: 0.001 }, { maxPrice: 10_000_000_000 }]) {
      expect(() => validateDiscoveryBounds(filters)).toThrow();
    }
    expect(() => validateDiscoveryBounds({ minPrice: 0, maxPrice: 0.01 })).not.toThrow();
    expect(() => validateDiscoveryBounds({ minPrice: 1_234_567_890.12, maxPrice: 9_999_999_999.99 })).not.toThrow();
  });
});
