import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
  name: z.string().min(2).max(100),
  role: z.enum(["BUYER", "VENDOR"]).default("BUYER"),
  businessName: z.string().max(160).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(72),
});

export const listingQuerySchema = z.object({
  q: z.string().trim().max(160).optional(),
  category: z.string().trim().max(120).optional(),
  type: z.enum(["PRODUCT", "SERVICE"]).optional(),
  location: z.string().trim().max(120).optional(),
  price: z.string().trim().max(80).optional(),
  remote: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  verified: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  sort: z.enum(["newest", "oldest", "title"]).default("newest"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(12),
});

export const listingInputSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(10).max(5000),
  categoryId: z.string().cuid(),
  listingType: z.enum(["PRODUCT", "SERVICE"]),
  priceIndication: z.string().trim().max(80).optional(),
  location: z.string().trim().max(120).optional(),
  remoteAvailable: z.boolean().default(false),
  slug: z
    .string()
    .trim()
    .min(3)
    .max(180)
    .regex(/^[a-z0-9-]+$/),
});
