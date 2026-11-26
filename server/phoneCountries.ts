import { getCountries, getCountryCallingCode } from "libphonenumber-js/max";
import { phoneCountrySchema } from "./countryCode";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { adminProcedure, protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { moderationRecords, phoneVerificationCountries } from "../drizzle/schema";

const names = new Intl.DisplayNames(["en"], { type: "region" });
export { phoneCountrySchema };

function describeCountry(countryCode: string) {
  const code = phoneCountrySchema.parse(countryCode);
  return { countryCode: code, name: names.of(code) || code, callingCode: `+${getCountryCallingCode(code)}` };
}

async function database() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Country settings unavailable." });
  return db;
}

export async function requireEnabledPhoneCountry(countryCode: string, purpose = "SMS verification") {
  const db = await database();
  const [country] = await db.select().from(phoneVerificationCountries)
    .where(eq(phoneVerificationCountries.countryCode, countryCode));
  if (!country?.enabled) throw new TRPCError({
    code: "BAD_REQUEST", message: `${purpose} is not available for this country. Choose an enabled country or contact support.`,
  });
}

export const phoneCountryProcedures = {
  phoneCountries: protectedProcedure.query(async () => {
    const db = await database();
    const rows = await db.select().from(phoneVerificationCountries).where(eq(phoneVerificationCountries.enabled, true));
    return rows.map(row => describeCountry(row.countryCode)).sort((a, b) => a.name.localeCompare(b.name));
  }),
};

export const adminPhoneCountryProcedures = {
  phoneCountries: adminProcedure.query(async () => {
    const db = await database();
    const rows = await db.select().from(phoneVerificationCountries);
    return {
      configured: rows.map(row => ({ ...describeCountry(row.countryCode), enabled: row.enabled }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      available: getCountries().map(describeCountry).sort((a, b) => a.name.localeCompare(b.name)),
    };
  }),
  setPhoneCountry: adminProcedure.input(z.object({ countryCode: phoneCountrySchema, enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = await database();
      await db.transaction(async tx => {
        await tx.insert(phoneVerificationCountries).values(input).onDuplicateKeyUpdate({ set: { enabled: input.enabled } });
        await tx.insert(moderationRecords).values({
          actorId: ctx.user.id, entityType: "vendor", entityId: `sms-country:${input.countryCode}`,
          action: input.enabled ? "sms_country_enabled" : "sms_country_disabled",
          reason: "Administrator updated SMS verification country availability.",
        });
      });
      return { success: true };
    }),
};
