import { sql, type SQL } from "drizzle-orm";
import { listings } from "../drizzle/schema";

/** MySQL 8.4 adapter for discoveryFilters.parsePriceIndication. */
export function numericPriceExpressions(price: SQL | typeof listings.priceIndication = listings.priceIndication): {
  min: SQL<number | null>;
  max: SQL<number | null>;
  currency: SQL<string | null>;
} {
  const text = sql`UPPER(REGEXP_REPLACE(CAST(${price} AS CHAR CHARACTER SET utf8mb4), ${"^[[:space:]]+|[[:space:]]+$"}, ''))`;
  const amount = "(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:[.][0-9]+)?";
  const marker = "(?:(?:USD|CAD|CA[$]|US[$]|[$])[[:space:]]*)?";
  const grammar = `^${marker}(${amount})(?:[[:space:]]*(?:-|–|—|TO)[[:space:]]*${marker}(${amount}))?[[:space:]]*(?:USD|CAD)?$`;
  const valid = sql`REGEXP_LIKE(${text}, ${grammar}) AND NOT (
    REGEXP_LIKE(${text}, ${"CAD|CA[$]"}) AND REGEXP_LIKE(${text}, ${"USD|US[$]"})
  )`;
  const numbers = sql`REGEXP_REPLACE(
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${text}, 'USD', ''), 'CAD', ''), 'US$', ''), 'CA$', ''), '$', ''), ',', ''),
    ${"[[:space:]]*(?:-|–|—|TO)[[:space:]]*"}, '|'
  )`;
  // Validate the entire indication before extracting endpoints; DOUBLE avoids cent rounding.
  const first = sql`CAST(TRIM(SUBSTRING_INDEX(${numbers}, '|', 1)) AS DOUBLE)`;
  const last = sql`CAST(TRIM(SUBSTRING_INDEX(${numbers}, '|', -1)) AS DOUBLE)`;
  const ordered = sql`${valid} AND ${first} <= ${last}`;
  return {
    min: sql<number | null>`CASE WHEN ${ordered} THEN ${first} ELSE NULL END`,
    max: sql<number | null>`CASE WHEN ${ordered} THEN ${last} ELSE NULL END`,
    currency: sql<string | null>`CASE WHEN ${ordered} THEN CASE WHEN REGEXP_LIKE(${text}, ${"CAD|CA[$]"}) THEN 'CAD' ELSE 'USD' END ELSE NULL END`,
  };
}
