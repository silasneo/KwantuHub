import { describe, expect, it } from "vitest";
import { openapiDocument } from "./openapi";

describe("KwantuHub OpenAPI document", () => {
  it("documents the public vendor and marketplace procedures", () => {
    expect(openapiDocument.openapi).toBe("3.0.3");
    expect(openapiDocument.paths["/api/trpc/vendors.list"]).toBeDefined();
    expect(openapiDocument.paths["/api/trpc/marketplace.search"]).toBeDefined();
    expect(openapiDocument.paths["/api/trpc/auth.login"]).toBeDefined();
  });

  it("declares JWT cookie security", () => {
    expect(
      openapiDocument.components.securitySchemes.KwantuJwtCookie
    ).toMatchObject({
      type: "apiKey",
      in: "cookie",
      name: "kwantu_jwt",
    });
  });

  it("documents filtered vendor and admin analytics", () => {
    expect(openapiDocument.paths["/api/trpc/vendor.analytics"]).toBeDefined();
    expect(openapiDocument.paths["/api/trpc/admin.analytics"]).toBeDefined();
    expect(openapiDocument.paths["/api/trpc/auth.contactStatus"]).toBeDefined();
    expect(openapiDocument.paths["/api/trpc/auth.requestEmailOtp"]).toBeDefined();
    expect(openapiDocument.paths["/api/trpc/auth.verifyEmailOtp"]).toBeDefined();
    expect(openapiDocument.paths["/api/trpc/auth.requestPhoneOtp"]).toBeDefined();
    expect(openapiDocument.paths["/api/trpc/auth.verifyPhoneOtp"]).toBeDefined();
  });

  it("documents the versioned REST compatibility layer and error envelope", () => {
    expect(openapiDocument.paths["/api/v1/contract"]).toBeDefined();
    expect(openapiDocument.paths["/api/v1/{domain}/{procedure}"]).toMatchObject({
      get: expect.any(Object),
      post: expect.any(Object),
    });
    expect(openapiDocument.components.schemas.RestSuccessEnvelope).toBeDefined();
    expect(openapiDocument.components.schemas.RestErrorEnvelope).toBeDefined();
    expect(openapiDocument.components.parameters.RestInput).toBeDefined();
  });
});
