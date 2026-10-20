import { Router, type Request, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";
import { getDb, getVendorProfileByUserId } from "./db";
import { categories, listings, storefronts, vendorProfiles } from "../drizzle/schema";
import { deriveVendorBadges } from "./vendorVerification";
import {
  isKnownRestOperation,
  isMutationOperation,
  isQueryOperation,
  REST_OPERATION_REGISTRY,
  REST_ALIAS_ROUTES,
  REST_QUERY_OPERATIONS,
  REST_MUTATION_OPERATIONS,
  type RestOperation,
} from "./apiV1Contract";

export const apiV1Router = Router();

export type RestErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "TOO_MANY_REQUESTS"
  | "METHOD_NOT_ALLOWED"
  | "INTERNAL_SERVER_ERROR";

export function sendEnvelope<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({
    status: "success",
    timestamp: new Date().toISOString(),
    data,
  });
}

export function sendError(
  res: Response,
  code: RestErrorCode,
  message: string,
  status = statusForError(code),
  details?: unknown,
) {
  return res.status(status).json({
    status: "error",
    timestamp: new Date().toISOString(),
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
  });
}

function statusForError(code: RestErrorCode): number {
  switch (code) {
    case "BAD_REQUEST": return 400;
    case "UNAUTHORIZED": return 401;
    case "FORBIDDEN": return 403;
    case "NOT_FOUND": return 404;
    case "CONFLICT": return 409;
    case "TOO_MANY_REQUESTS": return 429;
    case "METHOD_NOT_ALLOWED": return 405;
    default: return 500;
  }
}

function parseJsonInput(raw: unknown): unknown {
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    throw Object.assign(new Error("The input query parameter must contain valid JSON."), {
      code: "BAD_REQUEST" as const,
    });
  }
}

function coerceQueryValue(value: string | string[]): unknown {
  if (Array.isArray(value)) return value.map(coerceQueryValue);
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (value.startsWith("{") || value.startsWith("[")) {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
}

export function parseRestInput(req: Request): unknown {
  if (req.method === "GET" || req.method === "DELETE") {
    const rawInput = req.query.input;
    if (typeof rawInput === "string") return parseJsonInput(rawInput);
    const query = { ...req.query } as Record<string, string | string[]>;
    delete query.input;
    const entries = Object.entries(query);
    return entries.length === 0
      ? undefined
      : Object.fromEntries(entries.map(([key, value]) => [key, coerceQueryValue(value)]));
  }
  return req.body && Object.keys(req.body).length > 0 ? req.body : undefined;
}

function getTrpcError(error: unknown): { code: RestErrorCode; message: string; details?: unknown } {
  const candidate = error as { code?: string; message?: string; cause?: { code?: string; message?: string } };
  const rawCode = candidate?.code || candidate?.cause?.code;
  const code = [
    "BAD_REQUEST", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "CONFLICT",
    "TOO_MANY_REQUESTS", "METHOD_NOT_ALLOWED", "INTERNAL_SERVER_ERROR",
  ].includes(String(rawCode)) ? String(rawCode) as RestErrorCode : "INTERNAL_SERVER_ERROR";
  const message = code === "INTERNAL_SERVER_ERROR"
    ? "An unexpected server error occurred."
    : candidate?.message || candidate?.cause?.message || "Request failed.";
  return { code, message };
}

async function invokeOperation(req: Request, res: Response, operation: RestOperation, input: unknown) {
  const [domain, procedure] = operation.split(".");
  const context = await createContext({ req, res } as never);
  const caller = appRouter.createCaller(context) as unknown as Record<string, Record<string, (value?: unknown) => Promise<unknown>>>;
  const domainCaller = caller[domain];
  const procedureCaller = domainCaller?.[procedure];
  if (typeof procedureCaller !== "function") {
    return sendError(res, "NOT_FOUND", `REST procedure ${operation} is not available.`);
  }
  try {
    const data = await procedureCaller(input);
    return sendEnvelope(res, data);
  } catch (error) {
    const mapped = getTrpcError(error);
    return sendError(res, mapped.code, mapped.message, statusForError(mapped.code), mapped.details);
  }
}

function operationFromPath(req: Request): { operation?: RestOperation; allowedMethod?: string } {
  const domain = req.params.domain;
  const procedure = req.params.procedure;
  const key = `${domain}.${procedure}`;
  if (!isKnownRestOperation(domain, procedure)) return {};
  return {
    operation: key as RestOperation,
    allowedMethod: isQueryOperation(domain, procedure) ? "GET" : "POST",
  };
}

// Public contract introspection allows SDK consumers to discover the supported parity surface.
apiV1Router.get("/contract", (_req, res) => {
  sendEnvelope(res, {
    version: "1.0.0",
    envelope: {
      success: { status: "success", timestamp: "ISO-8601", data: "any" },
      error: { status: "error", timestamp: "ISO-8601", error: { code: "string", message: "string" } },
    },
    queries: REST_QUERY_OPERATIONS,
    mutations: REST_MUTATION_OPERATIONS,
    aliases: REST_ALIAS_ROUTES,
  });
});

// Public health endpoint.
apiV1Router.get("/health", (_req, res) => {
  sendEnvelope(res, { status: "healthy", version: "v1.0.0", platform: "KwantuHub" });
});

// Public category endpoint retained as a friendly REST alias.
apiV1Router.get("/categories", async (req, res) => {
  try {
    parseRestInput(req);
  } catch (error: any) {
    return sendError(res, "BAD_REQUEST", error.message || "Invalid input query parameter");
  }
  const db = await getDb();
  if (!db) return sendError(res, "INTERNAL_SERVER_ERROR", "Database unavailable");
  const cats = await db.select().from(categories).where(eq(categories.isActive, true)).orderBy(categories.sortOrder);
  return sendEnvelope(res, cats);
});

// Public listing collection alias. Search clients should prefer /api/v1/marketplace/search.
apiV1Router.get("/listings", async (req, res) => {
  const db = await getDb();
  if (!db) return sendError(res, "INTERNAL_SERVER_ERROR", "Database unavailable");
  const published = await db
    .select({ listing: listings, category: categories, storefront: storefronts })
    .from(listings)
    .innerJoin(categories, eq(listings.categoryId, categories.id))
    .leftJoin(storefronts, eq(listings.storefrontId, storefronts.id))
    .where(eq(listings.status, "published"))
    .orderBy(desc(listings.publishedAt))
    .limit(Math.min(Number(req.query.limit) || 50, 100));
  return sendEnvelope(res, published);
});

apiV1Router.get("/listings/:slug", (req, res) =>
  invokeOperation(req, res, "marketplace.getListing", { slug: req.params.slug }),
);

// Public approved vendor collection alias.
apiV1Router.get("/vendors", async (_req, res) => {
  const db = await getDb();
  if (!db) return sendError(res, "INTERNAL_SERVER_ERROR", "Database unavailable");
  const approved = await db
    .select({ vendor: vendorProfiles, storefront: storefronts })
    .from(vendorProfiles)
    .innerJoin(storefronts, eq(storefronts.vendorId, vendorProfiles.id))
    .where(eq(vendorProfiles.approvalStatus, "approved"))
    .orderBy(desc(vendorProfiles.createdAt))
    .limit(100);
  const formatted = approved.map(item => ({
    id: item.vendor.id,
    businessName: item.vendor.businessName,
    approvalStatus: item.vendor.approvalStatus,
    slug: item.storefront.slug,
    headline: item.storefront.headline,
    description: item.storefront.description,
    location: item.storefront.location,
    remoteAvailable: item.storefront.remoteAvailable,
    logoUrl: item.storefront.logoUrl,
    badges: deriveVendorBadges({
      approvalStatus: item.vendor.approvalStatus,
      emailVerified: Boolean(item.vendor.contactEmail),
      identityStatus: item.vendor.identityStatus,
      residenceStatus: item.vendor.residenceStatus,
      residenceCountry: item.vendor.residenceCountry,
      phoneVerified: Boolean(item.vendor.phone),
    }),
  }));
  return sendEnvelope(res, formatted);
});

apiV1Router.get("/vendors/:slug", (req, res) =>
  invokeOperation(req, res, "marketplace.getStorefront", { slug: req.params.slug }),
);

apiV1Router.get("/users/me", (req, res) => invokeOperation(req, res, "auth.me", undefined));
apiV1Router.get("/users/contact-status", (req, res) => invokeOperation(req, res, "auth.contactStatus", undefined));
apiV1Router.get("/storefronts/:slug", (req, res) =>
  invokeOperation(req, res, "marketplace.getStorefront", { slug: req.params.slug }),
);
apiV1Router.get("/notifications", (req, res) => invokeOperation(req, res, "notifications.list", parseRestInput(req)));
apiV1Router.get("/notifications/unread-count", (req, res) => invokeOperation(req, res, "notifications.unreadCount", undefined));
apiV1Router.get("/preferences/notifications", (req, res) => invokeOperation(req, res, "notifications.getPreferences", undefined));
apiV1Router.post("/preferences/notifications", (req, res) => invokeOperation(req, res, "notifications.updatePreferences", parseRestInput(req)));

// Friendly top-level aliases for the primary marketplace domains.
apiV1Router.get("/search", (req, res) => invokeOperation(req, res, "marketplace.search", parseRestInput(req)));
apiV1Router.get("/wishlist", (req, res) => invokeOperation(req, res, "buyer.wishlist", parseRestInput(req)));
apiV1Router.post("/wishlist", (req, res) => invokeOperation(req, res, "buyer.toggleWishlist", parseRestInput(req)));
apiV1Router.get("/inquiries", async (req, res) => {
  const context = await createContext({ req, res } as never);
  const vendorProfile = context.user ? await getVendorProfileByUserId(context.user.id) : null;
  const operation: RestOperation = context.user?.role === "admin"
    ? "admin.conversationReports"
    : vendorProfile
      ? "vendor.inquiries"
      : "buyer.inquiries";
  return invokeOperation(req, res, operation, parseRestInput(req));
});
apiV1Router.post("/inquiries", (req, res) => invokeOperation(req, res, "buyer.createInquiry", parseRestInput(req)));
apiV1Router.get("/messages", async (req, res) => {
  const context = await createContext({ req, res } as never);
  const vendorProfile = context.user ? await getVendorProfileByUserId(context.user.id) : null;
  const operation: RestOperation = context.user?.role === "admin"
    ? "admin.conversationMessages"
    : vendorProfile
      ? "vendor.inquiries"
      : "buyer.inquiries";
  return invokeOperation(req, res, operation, parseRestInput(req));
});
apiV1Router.get("/reviews", (req, res) => invokeOperation(req, res, "marketplace.reviews", parseRestInput(req)));
apiV1Router.post("/reviews", (req, res) => invokeOperation(req, res, "buyer.submitReview", parseRestInput(req)));
apiV1Router.get("/analytics/vendor", (req, res) => invokeOperation(req, res, "vendor.analytics", parseRestInput(req)));
apiV1Router.get("/analytics/admin", (req, res) => invokeOperation(req, res, "admin.analytics", parseRestInput(req)));
apiV1Router.get("/verification/status", (req, res) => invokeOperation(req, res, "vendor.verificationStatus", parseRestInput(req)));
apiV1Router.post("/verification/session", (req, res) => invokeOperation(req, res, "vendor.startVerificationSession", parseRestInput(req)));
apiV1Router.post("/verification/evidence", (req, res) => invokeOperation(req, res, "vendor.submitManualEvidence", parseRestInput(req)));
apiV1Router.get("/moderation/reports", (req, res) => invokeOperation(req, res, "admin.conversationReports", parseRestInput(req)));
apiV1Router.post("/moderation/reports", async (req, res) => {
  const context = await createContext({ req, res } as never);
  const vendorProfile = context.user ? await getVendorProfileByUserId(context.user.id) : null;
  const operation: RestOperation = context.user?.role === "admin"
    ? "admin.updateConversationReport"
    : vendorProfile
      ? "vendor.reportConversation"
      : "buyer.reportConversation";
  return invokeOperation(req, res, operation, parseRestInput(req));
});
apiV1Router.post("/abuse/report", async (req, res) => {
  const context = await createContext({ req, res } as never);
  const vendorProfile = context.user ? await getVendorProfileByUserId(context.user.id) : null;
  const operation: RestOperation = vendorProfile ? "vendor.reportConversation" : "buyer.reportConversation";
  return invokeOperation(req, res, operation, parseRestInput(req));
});

// Generic parity route. Every known tRPC procedure is exposed as /api/v1/{domain}/{procedure}.
apiV1Router.all("/:domain/:procedure", async (req, res) => {
  const { operation, allowedMethod } = operationFromPath(req);
  if (!operation || !allowedMethod) return sendError(res, "NOT_FOUND", "REST endpoint not found.");
  if (req.method !== allowedMethod) {
    res.setHeader("Allow", allowedMethod);
    return sendError(res, "METHOD_NOT_ALLOWED", `Use ${allowedMethod} for this procedure.`);
  }
  return invokeOperation(req, res, operation, parseRestInput(req));
});

apiV1Router.use((_req, res) => sendError(res, "NOT_FOUND", "REST endpoint not found."));
