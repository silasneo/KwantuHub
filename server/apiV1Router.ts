import {
  Router,
  type Request,
  type Response,
  type RequestHandler,
  type ErrorRequestHandler,
} from "express";
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";
import { getDb, getVendorProfileByUserId } from "./db";
import {
  categories,
  listings,
  storefronts,
  vendorProfiles,
} from "../drizzle/schema";
import { getVendorVerificationBadges } from "./vendorTrust";
import {
  publicListingEligibility,
  publicVendorEligibility,
} from "./publicEligibility";
import { getPublicMediaUrl } from "./storage";
import { checkRuntimeReadiness, isRuntimeLive } from "./runtimeReadiness";
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
function safeHandler(handler: RequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve()
      .then(() => handler(req, res, next))
      .catch(next);
  };
}
const routes = {
  get: (path: string | string[], handler: RequestHandler) =>
    apiV1Router.get(path, safeHandler(handler)),
  post: (path: string, handler: RequestHandler) =>
    apiV1Router.post(path, safeHandler(handler)),
  all: (path: string, handler: RequestHandler) =>
    apiV1Router.all(path, safeHandler(handler)),
};

export type RestErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "TOO_MANY_REQUESTS"
  | "METHOD_NOT_ALLOWED"
  | "PRECONDITION_FAILED"
  | "SERVICE_UNAVAILABLE"
  | "PAYLOAD_TOO_LARGE"
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
  details?: unknown
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
    case "BAD_REQUEST":
      return 400;
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "CONFLICT":
      return 409;
    case "TOO_MANY_REQUESTS":
      return 429;
    case "METHOD_NOT_ALLOWED":
      return 405;
    case "PRECONDITION_FAILED":
      return 412;
    case "SERVICE_UNAVAILABLE":
      return 503;
    case "PAYLOAD_TOO_LARGE":
      return 413;
    default:
      return 500;
  }
}

function parseJsonInput(raw: unknown): unknown {
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    throw Object.assign(
      new Error("The input query parameter must contain valid JSON."),
      {
        code: "BAD_REQUEST" as const,
      }
    );
  }
}

function coerceQueryValue(value: string | string[]): unknown {
  if (Array.isArray(value)) return value.map(coerceQueryValue);
  if (typeof value !== "string") {
    throw Object.assign(
      new Error("Query parameters must be scalar values or JSON in input."),
      { code: "BAD_REQUEST" }
    );
  }
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (value.startsWith("{") || value.startsWith("[")) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

export function parseRestInput(req: Request): unknown {
  if (req.method === "GET" || req.method === "DELETE") {
    const rawInput = req.query.input;
    if (rawInput !== undefined) {
      if (
        typeof rawInput !== "string" ||
        !rawInput.length ||
        Object.keys(req.query).length !== 1
      ) {
        throw Object.assign(
          new Error(
            "Use one JSON input parameter or direct query parameters, not both."
          ),
          { code: "BAD_REQUEST" }
        );
      }
      return parseJsonInput(rawInput);
    }
    const query = { ...req.query } as Record<string, string | string[]>;
    delete query.input;
    const entries = Object.entries(query);
    return entries.length === 0
      ? undefined
      : Object.fromEntries(
          entries.map(([key, value]) => [key, coerceQueryValue(value)])
        );
  }
  return req.body && Object.keys(req.body).length > 0 ? req.body : undefined;
}

function getTrpcError(error: unknown): {
  code: RestErrorCode;
  message: string;
  details?: unknown;
} {
  const candidate = error as {
    code?: string;
    message?: string;
    cause?: { code?: string; message?: string };
  };
  const rawCode = candidate?.code || candidate?.cause?.code;
  const code = [
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "TOO_MANY_REQUESTS",
    "METHOD_NOT_ALLOWED",
    "PRECONDITION_FAILED",
    "SERVICE_UNAVAILABLE",
    "PAYLOAD_TOO_LARGE",
    "INTERNAL_SERVER_ERROR",
  ].includes(String(rawCode))
    ? (String(rawCode) as RestErrorCode)
    : "INTERNAL_SERVER_ERROR";
  const message =
    code === "INTERNAL_SERVER_ERROR"
      ? "An unexpected server error occurred."
      : candidate?.message || candidate?.cause?.message || "Request failed.";
  return { code, message };
}

export const restErrorHandler: ErrorRequestHandler = (
  error,
  _req,
  res,
  next
) => {
  if (res.headersSent) return next(error);
  if (error?.type === "entity.parse.failed") {
    sendError(res, "BAD_REQUEST", "Request body must contain valid JSON.");
    return;
  }
  if (error?.type === "entity.too.large") {
    sendError(res, "PAYLOAD_TOO_LARGE", "Request body is too large.");
    return;
  }
  if (error instanceof z.ZodError) {
    sendError(
      res,
      "BAD_REQUEST",
      "Invalid request parameters.",
      400,
      error.issues
    );
    return;
  }
  const mapped = getTrpcError(error);
  sendError(res, mapped.code, mapped.message);
};

async function invokeOperation(
  req: Request,
  res: Response,
  operation: RestOperation,
  input: unknown
) {
  const [domain, procedure] = operation.split(".");
  const context = await createContext({ req, res } as never);
  const caller = appRouter.createCaller(context) as unknown as Record<
    string,
    Record<string, (value?: unknown) => Promise<unknown>>
  >;
  const domainCaller = caller[domain];
  const procedureCaller = domainCaller?.[procedure];
  if (typeof procedureCaller !== "function") {
    return sendError(
      res,
      "NOT_FOUND",
      `REST procedure ${operation} is not available.`
    );
  }
  try {
    const data = await procedureCaller(input);
    return sendEnvelope(res, data);
  } catch (error) {
    const mapped = getTrpcError(error);
    return sendError(
      res,
      mapped.code,
      mapped.message,
      statusForError(mapped.code),
      mapped.details
    );
  }
}

function operationFromPath(req: Request): {
  operation?: RestOperation;
  allowedMethod?: string;
} {
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
routes.get("/contract", (_req, res) => {
  sendEnvelope(res, {
    version: "1.0.0",
    envelope: {
      success: { status: "success", timestamp: "ISO-8601", data: "any" },
      error: {
        status: "error",
        timestamp: "ISO-8601",
        error: { code: "string", message: "string" },
      },
    },
    queries: REST_QUERY_OPERATIONS,
    mutations: REST_MUTATION_OPERATIONS,
    aliases: REST_ALIAS_ROUTES,
  });
});

routes.get("/live", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  sendEnvelope(
    res,
    { status: isRuntimeLive() ? "ok" : "draining" },
    isRuntimeLive() ? 200 : 503
  );
});

// Keep /health as a readiness alias for existing operators.
routes.get(["/health", "/ready"], async (_req, res) => {
  const result = await checkRuntimeReadiness();
  res.setHeader("Cache-Control", "no-store");
  sendEnvelope(
    res,
    {
      platform: "KwantuHub",
      status: result.ready ? "ready" : "unavailable",
      dependencies: result.dependencies,
    },
    result.ready ? 200 : 503
  );
});

// Public category endpoint retained as a friendly REST alias.
routes.get("/categories", (req, res) =>
  invokeOperation(req, res, "categories.list", parseRestInput(req))
);

// Public listing collection alias. Search clients should prefer /api/v1/marketplace/search.
routes.get("/listings", async (req, res) => {
  const input = z
    .object({
      limit: z.number().int().min(1).max(100).optional(),
      page: z.number().int().min(1).max(10000).optional(),
      pageSize: z.number().int().min(1).max(48).optional(),
    })
    .strict()
    .parse(parseRestInput(req) ?? {});
  return invokeOperation(req, res, "marketplace.search", {
    page: input.page, pageSize: input.pageSize ?? Math.min(input.limit ?? 12, 48),
  });
});

routes.get("/listings/:slug", (req, res) =>
  invokeOperation(req, res, "marketplace.getListing", {
    ...z
      .object({ preview: z.boolean().optional() })
      .strict()
      .parse(parseRestInput(req) ?? {}),
    slug: req.params.slug,
  })
);

// Public aliases use the same paging and eligibility as the typed API.
routes.get("/vendors", (req, res) =>
  invokeOperation(req, res, "vendors.list", parseRestInput(req))
);

routes.get("/vendors/:slug", (req, res) =>
  invokeOperation(req, res, "marketplace.getStorefront", {
    ...z
      .object({ preview: z.boolean().optional(), page: z.number().int().min(1).max(10000).optional(), pageSize: z.number().int().min(1).max(50).optional() })
      .strict()
      .parse(parseRestInput(req) ?? {}),
    slug: req.params.slug,
  })
);

routes.get("/users/me", (req, res) =>
  invokeOperation(req, res, "auth.me", parseRestInput(req))
);
routes.get("/users/contact-status", (req, res) =>
  invokeOperation(req, res, "auth.contactStatus", parseRestInput(req))
);
routes.get("/storefronts/:slug", (req, res) =>
  invokeOperation(req, res, "marketplace.getStorefront", {
    ...z
      .object({ preview: z.boolean().optional(), page: z.number().int().min(1).max(10000).optional(), pageSize: z.number().int().min(1).max(50).optional() })
      .strict()
      .parse(parseRestInput(req) ?? {}),
    slug: req.params.slug,
  })
);
routes.get("/notifications", (req, res) =>
  invokeOperation(req, res, "notifications.list", parseRestInput(req))
);
routes.get("/notifications/unread-count", (req, res) =>
  invokeOperation(req, res, "notifications.unreadCount", parseRestInput(req))
);
routes.get("/preferences/notifications", (req, res) =>
  invokeOperation(req, res, "notifications.getPreferences", parseRestInput(req))
);
routes.post("/preferences/notifications", (req, res) =>
  invokeOperation(
    req,
    res,
    "notifications.updatePreferences",
    parseRestInput(req)
  )
);

// Friendly top-level aliases for the primary marketplace domains.
routes.get("/search", (req, res) =>
  invokeOperation(req, res, "marketplace.search", parseRestInput(req))
);
routes.get("/wishlist", (req, res) =>
  invokeOperation(req, res, "buyer.wishlist", parseRestInput(req))
);
routes.post("/wishlist", (req, res) =>
  invokeOperation(req, res, "buyer.toggleWishlist", parseRestInput(req))
);
routes.get("/inquiries", async (req, res) => {
  const context = await createContext({ req, res } as never);
  const vendorProfile = context.user
    ? await getVendorProfileByUserId(context.user.id)
    : null;
  const operation: RestOperation =
    context.user?.role === "admin"
      ? "admin.conversationReports"
      : vendorProfile
        ? "vendor.inquiries"
        : "buyer.inquiries";
  return invokeOperation(req, res, operation, parseRestInput(req));
});
routes.post("/inquiries", (req, res) =>
  invokeOperation(req, res, "buyer.createInquiry", parseRestInput(req))
);
routes.get("/messages", async (req, res) => {
  const context = await createContext({ req, res } as never);
  const vendorProfile = context.user
    ? await getVendorProfileByUserId(context.user.id)
    : null;
  const operation: RestOperation =
    context.user?.role === "admin"
      ? "admin.conversationMessages"
      : vendorProfile
        ? "vendor.messages"
        : "buyer.messages";
  return invokeOperation(req, res, operation, parseRestInput(req));
});
routes.get("/reviews", (req, res) =>
  invokeOperation(req, res, "marketplace.reviews", parseRestInput(req))
);
routes.post("/reviews", (req, res) =>
  invokeOperation(req, res, "buyer.submitReview", parseRestInput(req))
);
routes.get("/analytics/vendor", (req, res) =>
  invokeOperation(req, res, "vendor.analytics", parseRestInput(req))
);
routes.get("/analytics/admin", (req, res) =>
  invokeOperation(req, res, "admin.analytics", parseRestInput(req))
);
routes.get("/verification/status", (req, res) =>
  invokeOperation(req, res, "vendor.verificationStatus", parseRestInput(req))
);
routes.post("/verification/session", (req, res) =>
  invokeOperation(
    req,
    res,
    "vendor.startVerificationSession",
    parseRestInput(req)
  )
);
routes.post("/verification/evidence", (req, res) =>
  invokeOperation(req, res, "vendor.submitManualEvidence", parseRestInput(req))
);
routes.get("/moderation/reports", (req, res) =>
  invokeOperation(req, res, "admin.conversationReports", parseRestInput(req))
);
routes.post("/moderation/reports", async (req, res) => {
  const context = await createContext({ req, res } as never);
  const vendorProfile = context.user
    ? await getVendorProfileByUserId(context.user.id)
    : null;
  const operation: RestOperation =
    context.user?.role === "admin"
      ? "admin.updateConversationReport"
      : vendorProfile
        ? "vendor.reportConversation"
        : "buyer.reportConversation";
  return invokeOperation(req, res, operation, parseRestInput(req));
});
routes.post("/abuse/report", async (req, res) => {
  const context = await createContext({ req, res } as never);
  const vendorProfile = context.user
    ? await getVendorProfileByUserId(context.user.id)
    : null;
  const operation: RestOperation = vendorProfile
    ? "vendor.reportConversation"
    : "buyer.reportConversation";
  return invokeOperation(req, res, operation, parseRestInput(req));
});

// Generic parity route. Every known tRPC procedure is exposed as /api/v1/{domain}/{procedure}.
routes.all("/:domain/:procedure", async (req, res) => {
  const { operation, allowedMethod } = operationFromPath(req);
  if (!operation || !allowedMethod)
    return sendError(res, "NOT_FOUND", "REST endpoint not found.");
  if (req.method !== allowedMethod) {
    res.setHeader("Allow", allowedMethod);
    return sendError(
      res,
      "METHOD_NOT_ALLOWED",
      `Use ${allowedMethod} for this procedure.`
    );
  }
  return invokeOperation(req, res, operation, parseRestInput(req));
});

apiV1Router.use((_req, res) =>
  sendError(res, "NOT_FOUND", "REST endpoint not found.")
);
apiV1Router.use(restErrorHandler);
