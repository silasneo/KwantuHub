import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/max";
import { z } from "zod";
import { decryptOtp } from "./contactVerification";
import { phoneCountrySchema } from "./countryCode";

export const TERMS_VERSION = "2026-10-25";
export const personalDetailsSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  city: z.string().trim().min(2).max(160),
  address: z.string().trim().min(5).max(500),
  countryCode: phoneCountrySchema,
});

export function isAdult(date: string, now = new Date()) {
  const birth = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(birth.getTime()) || birth.toISOString().slice(0, 10) !== date) return false;
  const cutoff = new Date(Date.UTC(now.getUTCFullYear() - 18, now.getUTCMonth(), now.getUTCDate()));
  return birth <= cutoff && birth.getUTCFullYear() >= 1900;
}

export function vendorPhone(value: string, country?: CountryCode) {
  const phone = parsePhoneNumberFromString(value, country);
  if (!value.trim().startsWith("+") || !phone?.isValid() ||
      !phone.country || (country && phone.country !== country)) return null;
  return phone.number;
}

export function readIdentity(ciphertext: string) {
  return personalDetailsSchema.parse(JSON.parse(decryptOtp(ciphertext)));
}

export function isSafeAvatar(value: string) {
  if (/^\/media\/public\/avatars\/\d+\/[a-f0-9-]+\.webp$/.test(value)) return true;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}
