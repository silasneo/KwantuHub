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
});
