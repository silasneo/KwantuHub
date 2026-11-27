import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { sanitizeReportOutput, generateAggregateCsv } from "./marketplaceReporting";
import { buildRobotsTxt, buildSitemapXml } from "./seoService";
import { toPublicVendorProfile } from "./db";

describe("privacy projection and formatting unit policies (not live acceptance)", () => {
  it("strips raw contacts, private notes, and identity evidence from aggregate report output", () => {
    const sanitized = sanitizeReportOutput({
      metric: "inquiries",
      value: 12,
      email: "private@example.com",
      phone: "+1 555 0100",
      vendorPrivateNotes: "follow up privately",
      messageBody: "private conversation",
      identityEvidence: "passport-document-key",
    });
    const csv = generateAggregateCsv([{ domain: "marketplace", metric: "inquiries", value: 12, note: "aggregate only" }]);

    expect(sanitized.email).toBeUndefined();
    expect(sanitized.phone).toBeUndefined();
    expect(sanitized.vendorPrivateNotes).toBeUndefined();
    expect(sanitized.messageBody).toBeUndefined();
    expect(sanitized.identityEvidence).toBeUndefined();
    expect(csv).not.toContain("private@example.com");
    expect(csv).not.toContain("passport-document-key");
  });

  it("produces a contact-safe public vendor projection", () => {
    const publicVendor = toPublicVendorProfile({
      id: 10,
      userId: 99,
      businessName: "Artisan Co",
      description: "Handmade goods",
      location: "Toronto, ON",
      serviceArea: "North America",
      remoteAvailable: true,
      contactEmail: "private@example.com",
      phone: "+1 555 0100",
      whatsapp: "+1 555 0100",
      imessage: "private@example.com",
      instagram: "@artisan",
      website: "https://artisan.example",
      approvalStatus: "approved",
      approvedAt: new Date(),
      standardsAcknowledgedAt: new Date(),
      identityStatus: "verified",
      identityVerifiedAt: new Date(),
      residenceStatus: "verified",
      residenceCountry: "CA",
      residenceVerifiedAt: new Date(),
      verificationBadgeSummary: { identity: true },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    expect(publicVendor.businessName).toBe("Artisan Co");
    expect((publicVendor as any).contactEmail).toBeUndefined();
    expect((publicVendor as any).phone).toBeUndefined();
    expect((publicVendor as any).identityStatus).toBeUndefined();
    expect((publicVendor as any).residenceCountry).toBeUndefined();
  });

  it("keeps robots and sitemap output away from private routes and PII-bearing paths", () => {
    const robots = buildRobotsTxt("https://example.test");
    const sitemap = buildSitemapXml("https://example.test", ["", "/marketplace", "/vendors/akoma", "/listings/kente", "/admin", "/account", "/vendors/private@example.com"]);

    expect(robots).toContain("Disallow: /api/");
    expect(robots).toContain("Disallow: /admin");
    expect(sitemap).toContain("/vendors/akoma");
    expect(sitemap).not.toContain("/admin");
    expect(sitemap).not.toContain("/account");
    expect(sitemap).not.toContain("private@example.com");
  });

  it("keeps public page metadata and JSON-LD limited to non-sensitive listing/storefront fields", () => {
    const listingSource = readFileSync(new URL("../client/src/pages/ListingDetail.tsx", import.meta.url), "utf8");
    const storefrontSource = readFileSync(new URL("../client/src/pages/VendorStorefront.tsx", import.meta.url), "utf8");

    expect(listingSource).toContain("name: item.vendor.businessName");
    expect(listingSource).not.toContain("item.vendor.contactEmail");
    expect(listingSource).not.toContain("item.vendor.phone");
    expect(storefrontSource).not.toContain("storefront.vendor.contactEmail");
    expect(storefrontSource).not.toContain("storefront.vendor.phone");
    expect(storefrontSource).not.toContain("telephone:");
  });
});
