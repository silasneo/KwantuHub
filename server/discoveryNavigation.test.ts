import { describe, expect, it } from "vitest";
import { dashboardLinkState, marketplaceFilterUrl } from "../shared/discoveryNavigation";

describe("discovery and dashboard URL navigation", () => {
  it("resets pagination on every filter edit while preserving the remaining criteria", () => {
    const original = "q=kente&category=textiles&min=19.99&max=80&remote=true&currency=CAD&sort=title&page=4";
    for (const key of ["q", "category", "type", "location", "min", "max", "remote", "verified", "sort", "currency"]) {
      const next = new URL(marketplaceFilterUrl(original, key, "updated"), "https://example.test");
      expect(next.searchParams.has("page")).toBe(false);
      expect(next.searchParams.get(key)).toBe("updated");
      if (key !== "min") expect(next.searchParams.get("min")).toBe("19.99");
    }
    expect(marketplaceFilterUrl(original, "page", "5", false)).toContain("page=5");
    expect(marketplaceFilterUrl("page=2", "page", "", false)).toBe("/marketplace");
    // Back/forward can re-read the original URL without stale local filter state.
    expect(new URLSearchParams(original).get("page")).toBe("4");
  });
  it("selects notification tabs/inquiries and rejects malformed references", () => {
    const tabs = ["listings", "inquiries", "profile"] as const;
    expect(dashboardLinkState("?tab=inquiries&inquiry=42", tabs, "listings")).toEqual({ activeTab: "inquiries", inquiryId: 42 });
    expect(dashboardLinkState("?tab=profile", tabs, "listings").activeTab).toBe("profile");
    for (const id of ["-1", "0", "NaN", "1.5", "1e3", "99999999999999999999"]) {
      expect(dashboardLinkState(`?tab=bad&inquiry=${id}`, tabs, "listings")).toEqual({ activeTab: "listings", inquiryId: null });
    }
  });
});
