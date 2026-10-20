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
}): VerificationBadgeSummary {
  const contactVerified = Boolean(input.emailVerified && input.phoneVerified);
  const identityVerified = input.identityStatus === "verified";
  const residenceVerified =
    input.residenceStatus === "verified" && isNorthAmericaCountry(input.residenceCountry);
  const kwantuApproved = input.approvalStatus === "approved";
  const countryCode = isNorthAmericaCountry(input.residenceCountry)
    ? input.residenceCountry
    : null;

  return {
    contactVerified,
    identityVerified,
    residenceVerified,
    kwantuApproved,
    countryCode,
    issuedAt: identityVerified || residenceVerified ? new Date().toISOString() : null,
    expiresAt: input.expiresAt ? new Date(input.expiresAt).toISOString() : null,
  };
}

export function sanitizeEvidenceSummary(filename: string, evidenceType: string) {
  const ext = filename.split(".").pop()?.toLowerCase() || "file";
  return `${evidenceType.replace(/_/g, " ").toUpperCase()} [.${ext}]`;
}
