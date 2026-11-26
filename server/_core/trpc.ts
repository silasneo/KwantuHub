import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "@shared/const";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { getDb } from "../db";
import { enforceAuthRateLimit } from "../accountSecurity";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  const verificationAccess = new Set([
    "auth.contactStatus", "auth.requestEmailOtp", "auth.verifyEmailOtp",
    "auth.requestEmailChange", "auth.verifyEmailChange", "auth.changePassword",
    "auth.logout", "auth.phoneCountries",
  ]);
  const existingAdminAccess = ctx.user.role === "admin" && opts.path.startsWith("admin.");
  if (!ctx.user.emailVerifiedAt && !existingAdminAccess && !verificationAccess.has(opts.path)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Verify your email address before accessing account features." });
  }
  if (opts.type === "mutation") {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Account database unavailable." });
    const review = opts.path === "buyer.submitReview";
    const reply = opts.path.endsWith(".replyInquiry");
    await enforceAuthRateLimit(db, `action:${opts.path}`, String(ctx.user.id),
      review ? 5 : reply ? 30 : 60, review ? 60 * 60_000 : reply ? 5 * 60_000 : 60_000);
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  })
);
