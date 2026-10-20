import { describe, expect, it } from "vitest";
import { getTrustRate, getTypicalResponseSeconds, isProfileComplete } from "./vendorTrust";

describe("vendor trust policy", () => {
  it("withholds response-rate signals below the minimum sample", () => {
    expect(getTrustRate(2, 2)).toBeNull();
    expect(getTrustRate(3, 3)).toBe(1);
    expect(getTrustRate(6, 10)).toBe(0.6);
  });

  it("withholds typical response time below the minimum sample", () => {
    expect(getTypicalResponseSeconds([3600, 7200], 2)).toBeNull();
    expect(getTypicalResponseSeconds([3600, 7200, 1800], 3)).toBe(4200);
  });

  it("requires standards, service area, location, and description for profile completeness", () => {
    const complete = {
      description: "A diaspora design studio",
      location: "Houston, TX",
      serviceArea: "US and Canada",
      standardsAcknowledgedAt: new Date("2026-10-01T00:00:00Z"),
    };
    expect(isProfileComplete(complete)).toBe(true);
    expect(isProfileComplete({ ...complete, serviceArea: "" })).toBe(false);
    expect(isProfileComplete({ ...complete, standardsAcknowledgedAt: null })).toBe(false);
  });
});
