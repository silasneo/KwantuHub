import { describe, expect, it } from "vitest";
import { listingQuerySchema, registerSchema } from "../lib/validation/schemas";

describe("registration validation", () => {
  it("accepts buyer and vendor registrations with strong-enough passwords", () => {
    expect(
      registerSchema.parse({
        email: "buyer@example.com",
        password: "password123",
        name: "Buyer",
        role: "BUYER",
      }).role,
    ).toBe("BUYER");
    expect(
      registerSchema.parse({
        email: "vendor@example.com",
        password: "password123",
        name: "Vendor",
        role: "VENDOR",
        businessName: "Vendor Studio",
      }).role,
    ).toBe("VENDOR");
  });
  it("rejects admin self-registration and weak passwords", () => {
    expect(
      registerSchema.safeParse({
        email: "admin@example.com",
        password: "password123",
        name: "Admin",
        role: "ADMIN",
      }).success,
    ).toBe(false);
    expect(
      registerSchema.safeParse({
        email: "buyer@example.com",
        password: "short",
        name: "Buyer",
        role: "BUYER",
      }).success,
    ).toBe(false);
  });
});

describe("listing query validation", () => {
  it("coerces pagination and parses complete search state", () => {
    const query = listingQuerySchema.parse({
      category: "fashion-textiles",
      type: "PRODUCT",
      remote: "true",
      verified: "true",
      sort: "title",
      page: "2",
      pageSize: "24",
    });
    expect(query).toMatchObject({
      remote: true,
      verified: true,
      sort: "title",
      page: 2,
      pageSize: 24,
    });
  });
  it("rejects unsupported sort values and oversized pages", () => {
    expect(listingQuerySchema.safeParse({ sort: "popular" }).success).toBe(
      false,
    );
    expect(listingQuerySchema.safeParse({ pageSize: "100" }).success).toBe(
      false,
    );
  });
});
