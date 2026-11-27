import { SignJWT, jwtVerify } from "jose";
import { ENV } from "./_core/env";

function signingKey() {
  if (!ENV.cookieSecret) throw new Error("Evidence download signing is not configured.");
  return new TextEncoder().encode(ENV.cookieSecret);
}

export async function evidenceDownloadUrl(evidenceId: number, userId: number) {
  const token = await new SignJWT({ evidenceId })
    .setProtectedHeader({ alg: "HS256" }).setSubject(String(userId))
    .setAudience("private-evidence").setIssuedAt().setExpirationTime("5m")
    .sign(signingKey());
  return `/api/private/evidence/${evidenceId}?token=${encodeURIComponent(token)}`;
}

export async function verifyEvidenceToken(token: string, evidenceId: number, userId: number) {
  try {
    const { payload } = await jwtVerify(token, signingKey(), { algorithms: ["HS256"], audience: "private-evidence" });
    return payload.sub === String(userId) && payload.evidenceId === evidenceId;
  } catch { return false; }
}
