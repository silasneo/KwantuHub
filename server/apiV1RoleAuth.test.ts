import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

function mockContext(role: "user" | "admin" | null, overrides: Partial<User> = {}): TrpcContext {
  const user = role
    ? ({
        id: role === "admin" ? 1 : 2,
        openId: `${role}-open-id`,
        email: `${role}@example.com`,
        name: `${role} User`,
        loginMethod: "jwt",
        role,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
        ...overrides,
      } as User)
    : null;

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
      ip: "127.0.0.1",
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
      cookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("Stage 4H role-based REST authorization contracts", () => {
  it("rejects unauthenticated access to buyer inquiries", async () => {
    const ctx = mockContext(null);
    const caller = appRouter.createCaller(ctx);
    await expect(caller.buyer.inquiries()).rejects.toThrow();
  });

  it("rejects unauthenticated access to vendor verification status", async () => {
    const ctx = mockContext(null);
    const caller = appRouter.createCaller(ctx);
    await expect(caller.vendor.verificationStatus()).rejects.toThrow();
  });

  it("rejects normal buyer access to admin analytics", async () => {
    const ctx = mockContext("user");
    const caller = appRouter.createCaller(ctx);
    await expect(caller.admin.analytics()).rejects.toThrow();
  });

  it("allows public discovery access without authentication", async () => {
    const ctx = mockContext(null);
    const caller = appRouter.createCaller(ctx);
    const categories = await caller.categories.list();
    expect(Array.isArray(categories)).toBe(true);
  });
});
