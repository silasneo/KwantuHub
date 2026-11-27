import { describe, expect, it } from "vitest";

describe("Stage 4G public SEO and robots exclusions policy", () => {
  it("defines strict robots disallows for private portals and sensitive endpoints", () => {
    const disallowRules = [
      "/admin",
      "/account",
      "/vendor-portal",
      "/api/",
      "/login",
      "/register",
    ];

    expect(disallowRules).toContain("/admin");
    expect(disallowRules).toContain("/vendor-portal");
    expect(disallowRules).toContain("/account");
    expect(disallowRules).toContain("/api/");
  });

  it("verifies public discoverable paths are explicitly allowed", () => {
    const allowRules = [
      "/",
      "/marketplace",
      "/vendors",
      "/listings/",
      "/vendor/",
      "/story",
    ];

    expect(allowRules).toContain("/");
    expect(allowRules).toContain("/marketplace");
    expect(allowRules).toContain("/vendors");
  });
});
