import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from "node:crypto";
import { ENV } from "./_core/env";

export type VerificationChannel = "email" | "phone";
export type VerificationPurpose = "email_ownership" | "phone_ownership";

export const OTP_TTL_MS = 10 * 60_000;
export const OTP_RESEND_COOLDOWN_MS = 60_000;
export const OTP_MAX_ATTEMPTS = 5;

function secretKey() {
  return createHash("sha256")
    .update(ENV.cookieSecret || "kwantuhub-development-secret")
    .digest();
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function normalizePhone(phone: string) {
  const trimmed = phone.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits || digits.length < 10 || digits.length > 15) return null;
  return `${hasPlus ? "+" : "+"}${digits}`;
}

export function hashVerificationTarget(target: string) {
  return createHash("sha256").update(target).digest("hex");
}

export function generateOtp() {
  return String(randomInt(100000, 1000000));
}

export function hashOtp(purpose: VerificationPurpose, code: string) {
  return createHash("sha256")
    .update(`${purpose}:${code}:${ENV.cookieSecret || "kwantuhub-development-secret"}`)
    .digest("hex");
}

export function encryptOtp(code: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map(value => value.toString("base64url")).join(".");
}

export function decryptOtp(ciphertext: string) {
  const [ivEncoded, tagEncoded, encryptedEncoded] = ciphertext.split(".");
  if (!ivEncoded || !tagEncoded || !encryptedEncoded) throw new Error("Invalid OTP ciphertext");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    secretKey(),
    Buffer.from(ivEncoded, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedEncoded, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function verificationTarget(channel: VerificationChannel, value: string) {
  return channel === "email" ? normalizeEmail(value) : normalizePhone(value);
}

export function isOtpExpired(expiresAt: Date | string, now = Date.now()) {
  return new Date(expiresAt).getTime() <= now;
}

export function maskContact(channel: VerificationChannel, value: string) {
  if (channel === "email") {
    const [name, domain] = value.split("@");
    if (!domain) return "your email address";
    return `${(name || "").slice(0, 2)}***@${domain}`;
  }
  return `${value.slice(0, 3)}••••${value.slice(-2)}`;
}
