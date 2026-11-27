import { isSupportedCountry } from "libphonenumber-js/max";
import { z } from "zod";

export const phoneCountrySchema = z.string().length(2).transform((value, context) => {
  if (isSupportedCountry(value)) return value;
  context.addIssue({ code: "custom", message: "Choose a supported ISO country code." });
  return z.NEVER;
});
