import crypto from "node:crypto";

export const SESSION_COOKIE = "kwantu_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export function createSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function hashSessionToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
