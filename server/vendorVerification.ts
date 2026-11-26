export type NorthAmericaCountry = "US" | "CA" | "MX";

export const NORTH_AMERICA_COUNTRIES: Record<NorthAmericaCountry, string> = {
  US: "United States",
  CA: "Canada",
  MX: "Mexico",
};

export function isNorthAmericaCountry(country: string | null | undefined): country is NorthAmericaCountry {
  return country === "US" || country === "CA" || country === "MX";
}

export type VerificationBadgeSummary = {
  contactVerified: boolean;
  identityVerified: boolean;
  residenceVerified: boolean;
  kwantuApproved: boolean;
  countryCode: NorthAmericaCountry | null;
  issuedAt: string | null;
  expiresAt: string | null;
};

export function deriveVendorBadges(input: {
  emailVerified: boolean;
  phoneVerified: boolean;
  identityStatus: string;
  residenceStatus: string;
  residenceCountry: string | null;
  approvalStatus: string;
  expiresAt?: Date | string | null;
  identityVerifiedAt?: Date | string | null;
  residenceVerifiedAt?: Date | string | null;
  identityExpiresAt?: Date | string | null;
  residenceExpiresAt?: Date | string | null;
  approvalAt?: Date | string | null;
}): VerificationBadgeSummary {
  const contactVerified = Boolean(input.emailVerified && input.phoneVerified);
  const current = (at: Date | string | null | undefined, expiry: Date | string | null | undefined) =>
    Boolean(at && expiry && Number.isFinite(new Date(at).getTime()) && new Date(at).getTime() <= Date.now() && new Date(expiry).getTime() > Date.now());
  const identityExpiry = input.identityExpiresAt || input.expiresAt;
  const residenceExpiry = input.residenceExpiresAt || input.expiresAt;
  const identityVerified = input.identityStatus === "verified" && current(input.identityVerifiedAt, identityExpiry);
  const residenceVerified =
    input.residenceStatus === "verified" && current(input.residenceVerifiedAt, residenceExpiry) && isNorthAmericaCountry(input.residenceCountry);
  const kwantuApproved = input.approvalStatus === "approved" && Boolean(input.approvalAt) && identityVerified;
  const countryCode = residenceVerified && isNorthAmericaCountry(input.residenceCountry)
    ? input.residenceCountry
    : null;
  const dates = [
    ...(identityVerified ? [{ issued: new Date(input.identityVerifiedAt!), expiry: new Date(identityExpiry!) }] : []),
    ...(residenceVerified ? [{ issued: new Date(input.residenceVerifiedAt!), expiry: new Date(residenceExpiry!) }] : []),
  ];
  return {
    contactVerified,
    identityVerified,
    residenceVerified,
    kwantuApproved,
    countryCode,
    issuedAt: dates.length ? new Date(Math.max(...dates.map(date => date.issued.getTime()))).toISOString() : null,
    expiresAt: dates.length ? new Date(Math.min(...dates.map(date => date.expiry.getTime()))).toISOString() : null,
  };
}

export function sanitizeEvidenceSummary(filename: string, evidenceType: string) {
  const ext = filename.split(".").pop()?.toLowerCase() || "file";
  return `${evidenceType.replace(/_/g, " ").toUpperCase()} [.${ext}]`;
}
