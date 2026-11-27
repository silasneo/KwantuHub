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
      approvalAt: new Date("2026-01-01"),
      identityVerifiedAt: new Date("2026-01-01"),
      residenceVerifiedAt: new Date("2026-01-02"),
      expiresAt: new Date("2099-01-01"),
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
      identityVerifiedAt: new Date("2026-01-01"),
      residenceVerifiedAt: new Date("2026-01-02"),
      expiresAt: new Date("2099-01-01"),
    });

    expect(badges.identityVerified).toBe(true);
    expect(badges.residenceVerified).toBe(false);
    expect(badges.countryCode).toBeNull();
  });

  it("does not mint verification timestamps from status flags and expires independent checks", () => {
    const input = {
      emailVerified: false,
      phoneVerified: false,
      identityStatus: "verified",
      residenceStatus: "verified",
      residenceCountry: "CA",
      approvalStatus: "approved",
    };
    expect(deriveVendorBadges(input)).toMatchObject({
      identityVerified: false,
      residenceVerified: false,
      issuedAt: null,
      kwantuApproved: false,
    });
    const badges = deriveVendorBadges({
      ...input,
      identityVerifiedAt: "2026-01-01",
      identityExpiresAt: "2026-01-02",
      residenceVerifiedAt: "2026-01-03",
      residenceExpiresAt: "2099-01-01",
    });
    expect(badges).toMatchObject({
      identityVerified: false,
      residenceVerified: true,
      issuedAt: new Date("2026-01-03").toISOString(),
    });
  });

  it("masks and categorizes uploaded evidence summaries safely without raw paths", () => {
    const summary = sanitizeEvidenceSummary(
      "lease_scan_2026.pdf",
      "lease_agreement"
    );
    expect(summary).toBe("LEASE AGREEMENT [.pdf]");
    expect(summary).not.toContain("lease_scan_2026");
  });
});
