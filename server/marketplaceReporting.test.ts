import { describe, expect, it } from "vitest";
import {
  generateAggregateCsv,
  sanitizeReportOutput,
  type AggregateReportRow,
} from "./marketplaceReporting";

describe("Stage 4F aggregate reporting and data privacy sanitization", () => {
  it("generates valid RFC-compliant CSV with aggregate metrics", () => {
    const rows: AggregateReportRow[] = [
      {
        domain: "Listing Quality",
        metric: "High Quality Ratio",
        value: 45,
        rate: "75%",
        note: "Listings with score >= 75",
      },
      {
        domain: "Review Integrity",
        metric: "Suspicious Review Count",
        value: 2,
        rate: "3%",
        note: "Reviews flagged by burst/duplicate checks",
      },
    ];

    const csv = generateAggregateCsv(rows);
    expect(csv).toContain("Domain,Metric,Value,Rate,Note");
    expect(csv).toContain('"Listing Quality","High Quality Ratio",45,"75%"');
    expect(csv).toContain('"Review Integrity","Suspicious Review Count",2,"3%"');
  });

  it("strictly strips private notes, raw message bodies, and identity evidence from report payloads", () => {
    const input = {
      domain: "Lead Conversion",
      metric: "Total Deals Won",
      value: 12,
      vendorPrivateNotes: "Buyer offered $100 off the books",
      messageBody: "Raw confidential buyer inquiry content",
      identityEvidence: "passport_scan_s3_key_12345",
      phone: "+15551234567",
      email: "buyer@private.com",
    };

    const sanitized = sanitizeReportOutput(input);
    expect(sanitized.domain).toBe("Lead Conversion");
    expect(sanitized.value).toBe(12);
    expect((sanitized as any).vendorPrivateNotes).toBeUndefined();
    expect((sanitized as any).messageBody).toBeUndefined();
    expect((sanitized as any).identityEvidence).toBeUndefined();
    expect((sanitized as any).phone).toBeUndefined();
    expect((sanitized as any).email).toBeUndefined();
  });
});
