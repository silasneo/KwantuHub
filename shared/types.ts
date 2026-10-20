/**
 * Unified type exports
 * Import shared types from this single entry point.
 */

export type * from "../drizzle/schema";
export * from "./_core/errors";

export type NorthAmericaCountry = "US" | "CA" | "MX";

export const NORTH_AMERICA_COUNTRIES: Record<NorthAmericaCountry, string> = {
  US: "United States",
  CA: "Canada",
  MX: "Mexico",
};
