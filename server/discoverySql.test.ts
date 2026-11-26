import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mysql, { type Connection, type RowDataPacket } from "mysql2/promise";
import { sql } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { numericPriceExpressions } from "./discoverySql";
import { parsePriceIndication } from "../shared/discoveryFilters";

describe.skipIf(!process.env.DISCOVERY_SQL_DATABASE_URL)("MySQL discovery grammar parity (read-only)", () => {
  let connection: Connection;
  beforeAll(async () => { connection = await mysql.createConnection(process.env.DISCOVERY_SQL_DATABASE_URL!); });
  afterAll(async () => { await connection?.end(); });
  it("matches shared parsing for amounts, currencies, ranges, and rejected text", async () => {
    const examples = [
      null, "", "0", "$50.25-100.75", " USD 1,000.01 ", "CAD 50", "CAD50", "CA$50.123", "US$50 TO US$100",
      "50–100", "50—100", "$50 - $100 USD", "50 CAD", "USD 50-CAD 100", "CAD 50 USD",
      "Inquire", "from $50", "$50/hour", "100-50", "-10", "50-100-200", "12,34", "1.2.3", "1e5",
      "USD 50\n", "\tCAD\t10.50 - 99.99", "$19.9999", "0.00000000001", "50-50", "50 USD-CAD 100",
    ];
    for (const value of examples) {
      const price = numericPriceExpressions(sql`${value}`);
      const query = new MySqlDialect().sqlToQuery(sql`SELECT ${price.min} AS minimum, ${price.max} AS maximum, ${price.currency} AS currency`);
      const [rows] = await connection.query<RowDataPacket[]>(query.sql, query.params);
      const expected = parsePriceIndication(value);
      expect(rows[0], String(value)).toMatchObject({
        minimum: expected?.min ?? null,
        maximum: expected?.max ?? null,
        currency: expected?.currency ?? null,
      });
    }
  });
});
