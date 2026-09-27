import { describe, expect, it } from "vitest";
import {
  hashPassword,
  signToken,
  verifyPassword,
  verifyToken,
} from "./jwtAuth";

describe("jwtAuth service", () => {
  it("hashes and verifies passwords correctly", async () => {
    const raw = "HeritagePassword2026!";
    const hash = await hashPassword(raw);
    expect(hash).not.toBe(raw);

    const matches = await verifyPassword(raw, hash);
    expect(matches).toBe(true);

    const wrong = await verifyPassword("WrongPassword", hash);
    expect(wrong).toBe(false);
  });

  it("signs and verifies scoped JWT tokens", async () => {
    const payload = {
      userId: 42,
      email: "artisan@kwantuhub.local",
      role: "vendor" as const,
    };

    const token = await signToken(payload);
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(20);

    const decoded = await verifyToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.userId).toBe(42);
    expect(decoded?.email).toBe("artisan@kwantuhub.local");
    expect(decoded?.role).toBe("vendor");
  });

  it("rejects tampered tokens", async () => {
    const token = await signToken({
      userId: 1,
      email: "user@kwantuhub.local",
      role: "buyer" as const,
    });
    const tampered = token.slice(0, -6) + "abcdef";
    const decoded = await verifyToken(tampered);
    expect(decoded).toBeNull();
  });
});
