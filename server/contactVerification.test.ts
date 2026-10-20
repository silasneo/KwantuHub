import { describe, expect, it } from "vitest";
import {
  decryptOtp,
  encryptOtp,
  hashOtp,
  hashVerificationTarget,
  isOtpExpired,
  maskContact,
  normalizeEmail,
  normalizePhone,
} from "./contactVerification";
import { hashIp } from "./abuseProtection";

describe("Stage 4A contact verification and anti-abuse policy", () => {
  it("normalizes and masks email addresses cleanly", () => {
    expect(normalizeEmail("  Kwantu.Buyer@Example.COM ")).toBe("kwantu.buyer@example.com");
    expect(maskContact("email", "kwantu.buyer@example.com")).toBe("kw***@example.com");
  });

  it("normalizes international phone numbers and masks them safely", () => {
    expect(normalizePhone("+1 (713) 555-0148")).toBe("+17135550148");
    expect(normalizePhone("7135550148")).toBe("+7135550148");
    expect(normalizePhone("123")).toBeNull();
    expect(maskContact("phone", "+17135550148")).toBe("+17••••48");
  });

  it("encrypts and decrypts OTP codes round-trip without plain leakage", () => {
    const code = "482910";
    const ciphertext = encryptOtp(code);
    expect(ciphertext).not.toContain(code);
    expect(decryptOtp(ciphertext)).toBe(code);
  });

  it("creates deterministic hashes for targets, OTPs, and client IPs", () => {
    const targetA = hashVerificationTarget("kwantu.buyer@example.com");
    const targetB = hashVerificationTarget("kwantu.buyer@example.com");
    expect(targetA).toBe(targetB);

    const otpHashA = hashOtp("email_ownership", "123456");
    const otpHashB = hashOtp("email_ownership", "123456");
    expect(otpHashA).toBe(otpHashB);

    const ipHash = hashIp("198.51.100.24");
    expect(ipHash).toHaveLength(64);
  });

  it("evaluates challenge expiration correctly", () => {
    const past = new Date(Date.now() - 5_000);
    const future = new Date(Date.now() + 60_000);
    expect(isOtpExpired(past)).toBe(true);
    expect(isOtpExpired(future)).toBe(false);
  });
});
