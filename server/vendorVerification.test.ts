import { describe, expect, it } from "vitest";
import {
  deriveVendorBadges,
  isNorthAmericaCountry,
  NORTH_AMERICA_COUNTRIES,
  sanitizeEvidenceSummary,
} from "./vendorVerification";

describe("Stage 4B vendor identity and residence verification policy", () => {
  it("recognizes North America target countries accurately", () => {
    expect(isNorthAmericaCountry("US")).toBe(true);
    expect(isNorthAmericaCountry("CA")).toBe(true);
    expect(isNorthAmericaCountry("MX")).toBe(true);
    expect(isNorthAmericaCountry("GB")).toBe(false);
    expect(NORTH_AMERICA_COUNTRIES.MX).toBe("Mexico");
  });

  it("derives explainable vendor trust badges based on verified attributes", () => {
    const badges = deriveVendorBadges({
      emailVerified: true,
      phoneVerified: true,
      identityStatus: "verified",
      residenceStatus: "verified",
      residenceCountry: "CA",
      approvalStatus: "approved",
    });

    expect(badges.contactVerified).toBe(true);
    expect(badges.identityVerified).toBe(true);
    expect(badges.residenceVerified).toBe(true);
    expect(badges.kwantuApproved).toBe(true);
    expect(badges.countryCode).toBe("CA");
    expect(badges.issuedAt).toBeTruthy();
  });

  it("downgrades residence badge when country is not in North America", () => {
    const badges = deriveVendorBadges({
      emailVerified: true,
      phoneVerified: true,
      identityStatus: "verified",
      residenceStatus: "verified",
      residenceCountry: "DE",
      approvalStatus: "approved",
    });

    expect(badges.identityVerified).toBe(true);
    expect(badges.residenceVerified).toBe(false);
    expect(badges.countryCode).toBeNull();
  });

  it("masks and categorizes uploaded evidence summaries safely without raw paths", () => {
    const summary = sanitizeEvidenceSummary("lease_scan_2026.pdf", "lease_agreement");
    expect(summary).toBe("LEASE AGREEMENT [.pdf]");
    expect(summary).not.toContain("lease_scan_2026");
  });
});
