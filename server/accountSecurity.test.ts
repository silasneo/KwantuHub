import express from "express";
import { describe, expect, it } from "vitest";
import { accountEmailSchema, isDuplicateEmailError, newPasswordSchema } from "./accountSecurity";
import { getRequestIp } from "./abuseProtection";
import { isAdult, isSafeAvatar, vendorPhone } from "./accountPolicy";

describe("account security validation", () => {
  it("checks real calendar dates and the eighteenth birthday boundary", () => {
    const now = new Date("2026-10-25T12:00:00Z");
    expect(isAdult("2008-10-25", now)).toBe(true);
    for (const date of ["2008-10-26", "2027-01-01", "2000-02-30", "not-a-date", "1899-01-01"]) {
      expect(isAdult(date, now)).toBe(false);
    }
    expect(isAdult("2000-02-29", now)).toBe(true);
  });

  it("validates international phone numbers independently of the configured country allowlist", () => {
    expect(vendorPhone("+12025550123")).toBe("+12025550123");
    expect(vendorPhone("+14165550123")).toBe("+14165550123");
    expect(vendorPhone("+525555123456")).toBe("+525555123456");
    expect(vendorPhone("+2348031234567", "NG")).toBe("+2348031234567");
    expect(vendorPhone("+442079460123")).toBe("+442079460123");
    expect(vendorPhone("+14165550123", "US")).toBeNull();
    for (const number of ["+1555", "2025550123"]) expect(vendorPhone(number)).toBeNull();
  });

  it("limits legacy avatar references to HTTPS or the owned upload format", () => {
    expect(isSafeAvatar("https://example.test/image.jpg")).toBe(true);
    expect(isSafeAvatar("/media/public/avatars/1/1234-abcd.webp")).toBe(true);
    for (const url of ["javascript:alert(1)", "data:image/png;base64,AA==", "http://example.test/a.png", "/media/private/document.pdf"]) {
      expect(isSafeAvatar(url)).toBe(false);
    }
  });

  it("normalizes email before account lookups and creation", () => {
    expect(accountEmailSchema.parse("  Buyer@Example.COM ")).toBe("buyer@example.com");
    expect(accountEmailSchema.safeParse("not an email").success).toBe(false);
  });

  it("enforces the same new-password rule without bcrypt truncation", () => {
    expect(newPasswordSchema.safeParse("short").success).toBe(false);
    expect(newPasswordSchema.safeParse("a".repeat(72)).success).toBe(true);
    expect(newPasswordSchema.safeParse("a".repeat(73)).success).toBe(false);
    expect(newPasswordSchema.safeParse("é".repeat(37)).success).toBe(false);
    expect(newPasswordSchema.parse("  long password  ")).toBe("  long password  ");
  });

  it("only maps the email unique constraint to duplicate email errors", () => {
    const duplicate = Object.assign(new Error("Duplicate"), {
      code: "ER_DUP_ENTRY", sqlMessage: "Duplicate entry for key 'users.users_email_unique'",
    });
    expect(isDuplicateEmailError(new Error("Query failed", { cause: duplicate }))).toBe(true);
    expect(isDuplicateEmailError(Object.assign(new Error("Duplicate"), {
      code: "ER_DUP_ENTRY", sqlMessage: "Duplicate entry for key 'users.openId_unique'",
    }))).toBe(false);
    expect(isDuplicateEmailError(new Error("Connection lost"))).toBe(false);
  });

  it("does not trust forwarded or Cloudflare headers from direct clients", () => {
    const req = Object.create(express.request) as express.Request;
    Object.defineProperty(req, "socket", { value: { remoteAddress: "192.0.2.7" } });
    Object.defineProperty(req, "app", { value: express() });
    req.headers = { "x-forwarded-for": "203.0.113.1", "cf-connecting-ip": "203.0.113.2" };
    expect(getRequestIp(req)).toBe("192.0.2.7");
  });

  it("uses Express's explicit proxy trust configuration", () => {
    const app = express();
    app.set("trust proxy", ["loopback"]);
    const req = Object.create(express.request) as express.Request;
    Object.defineProperty(req, "socket", { value: { remoteAddress: "127.0.0.1" } });
    Object.defineProperty(req, "app", { value: app });
    req.headers = { "x-forwarded-for": "203.0.113.1" };
    expect(getRequestIp(req)).toBe("203.0.113.1");
  });
});
