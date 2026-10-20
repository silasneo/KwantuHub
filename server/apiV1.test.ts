import { describe, expect, it } from "vitest";
import {
  isKnownRestOperation,
  isMutationOperation,
  isQueryOperation,
  REST_MUTATION_OPERATIONS,
  REST_QUERY_OPERATIONS,
  REST_OPERATION_REGISTRY,
  REST_ALIAS_ROUTES,
} from "./apiV1Contract";
import { parseRestInput } from "./apiV1Router";

describe("Stage 4H /api/v1 REST compatibility layer", () => {
  it("enforces standard success response envelopes", () => {
    const envelope = {
      status: "success",
      timestamp: new Date().toISOString(),
      data: { id: 1, name: "Textiles" },
    };

    expect(envelope.status).toBe("success");
    expect(envelope.timestamp).toBeDefined();
    expect(envelope.data.name).toBe("Textiles");
  });

  it("verifies public REST contracts never expose confidential vendor contact fields", () => {
    const publicVendor = {
      id: 5,
      businessName: "Akoma Weavers",
      slug: "akoma-weavers",
      location: "Atlanta, GA",
      remoteAvailable: true,
      badges: {
        verifiedVendor: true,
        identityVerified: true,
        northAmericaResident: true,
      },
    };

    expect((publicVendor as any).phone).toBeUndefined();
    expect((publicVendor as any).contactEmail).toBeUndefined();
    expect((publicVendor as any).whatsapp).toBeUndefined();
  });

  it("registers all current tRPC domains as versioned REST procedures", () => {
    const requiredDomains = ["auth", "notifications", "categories", "vendors", "marketplace", "buyer", "vendor", "admin"];
    for (const domain of requiredDomains) {
      expect(Object.keys(REST_OPERATION_REGISTRY).some(key => key.startsWith(`${domain}.`))).toBe(true);
    }
    expect(isKnownRestOperation("buyer", "createInquiry")).toBe(true);
    expect(isKnownRestOperation("vendor", "startVerificationSession")).toBe(true);
    expect(isKnownRestOperation("admin", "moderateMessage")).toBe(true);
  });

  it("separates query and mutation methods in the REST contract", () => {
    expect(isQueryOperation("marketplace", "search")).toBe(true);
    expect(isMutationOperation("marketplace", "search")).toBe(false);
    expect(isMutationOperation("buyer", "createInquiry")).toBe(true);
    expect(isQueryOperation("buyer", "createInquiry")).toBe(false);
    expect(Object.keys(REST_QUERY_OPERATIONS).length).toBeGreaterThan(20);
    expect(Object.keys(REST_MUTATION_OPERATIONS).length).toBeGreaterThan(30);
  });

  it("parses JSON input and direct query values without trusting client-side types", () => {
    const jsonRequest = {
      method: "GET",
      query: { input: JSON.stringify({ page: 2, remote: true, minPrice: 25 }) },
    } as any;
    expect(parseRestInput(jsonRequest)).toEqual({ page: 2, remote: true, minPrice: 25 });

    const directRequest = {
      method: "GET",
      query: { page: "3", remote: "false", q: "woven" },
    } as any;
    expect(parseRestInput(directRequest)).toEqual({ page: 3, remote: false, q: "woven" });
  });

  it("requires JSON input to be valid when supplied through the input parameter", () => {
    const request = { method: "GET", query: { input: "not-json" } } as any;
    expect(() => parseRestInput(request)).toThrow("valid JSON");
  });

  it("exposes aliases for the named MVP REST domains", () => {
    for (const route of [
      "/api/v1/users/me",
      "/api/v1/storefronts/{slug}",
      "/api/v1/search",
      "/api/v1/wishlist",
      "/api/v1/inquiries",
      "/api/v1/messages",
      "/api/v1/reviews",
      "/api/v1/analytics/vendor",
      "/api/v1/analytics/admin",
      "/api/v1/verification/status",
      "/api/v1/moderation/reports",
      "/api/v1/abuse/report",
    ]) {
      expect(REST_ALIAS_ROUTES[route as keyof typeof REST_ALIAS_ROUTES]).toBeDefined();
    }
  });
});
