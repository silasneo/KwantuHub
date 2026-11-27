import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { parse as parseCookie } from "cookie";
import type { Request, Response } from "express";
import { getDb } from "./db";
import { authSessions, users, type User } from "../drizzle/schema";
import { and, eq, gt, lte } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";

export const JWT_COOKIE_NAME = "kwantu_jwt";
const JWT_SECRET_STRING = process.env.JWT_SECRET || randomBytes(32).toString("base64url");
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_STRING);

export interface JwtPayload {
  userId: number;
  email: string;
  role: "buyer" | "vendor" | "admin";
  sessionId?: string;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function publicUser(user: User) {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

export async function signToken(payload: JwtPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(payload.sessionId ?? randomBytes(32).toString("hex"))
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, { algorithms: ["HS256"] });
    if (!Number.isSafeInteger(payload.userId) || Number(payload.userId) <= 0 ||
      typeof payload.email !== "string" ||
      !["buyer", "vendor", "admin"].includes(String(payload.role)) ||
      typeof payload.jti !== "string" || !/^[a-f0-9]{64}$/.test(payload.jti)) return null;
    return {
      userId: Number(payload.userId),
      email: String(payload.email),
      role: payload.role as "buyer" | "vendor" | "admin",
      sessionId: payload.jti,
    };
  } catch {
    return null;
  }
}

function sessionKey(sessionId: string) {
  return createHash("sha256").update(sessionId).digest("hex");
}

export async function issueAuthSession(user: User, res: Response) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Account database unavailable." });
  const sessionId = randomBytes(32).toString("hex");
  const token = await signToken({ userId: user.id, email: user.email!, role: user.role, sessionId });
  await db.transaction(async tx => {
    const [current] = await tx.select().from(users).where(eq(users.id, user.id)).for("update");
    if (!current || current.status !== "active" || current.passwordHash !== user.passwordHash) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Account changed. Please sign in again." });
    }
    await tx.insert(authSessions).values({
      id: sessionKey(sessionId), userId: user.id,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
    });
  });
  await db.delete(authSessions).where(lte(authSessions.expiresAt, new Date())).limit(100);
  setAuthCookie(res, token);
}

function requestToken(req: Request): string | undefined {
  const cookies = req.cookies || parseCookie(req.headers.cookie || "");
  return cookies[JWT_COOKIE_NAME];
}

export async function revokeRequestSession(req: Request) {
  const token = requestToken(req);
  if (!token) return;
  const payload = await verifyToken(token);
  if (!payload?.sessionId) return;
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not end the session. Please retry." });
  await db.delete(authSessions).where(and(
    eq(authSessions.id, sessionKey(payload.sessionId)), eq(authSessions.userId, payload.userId)
  ));
}

export function setAuthCookie(res: Response, token: string) {
  res.cookie(JWT_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(JWT_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

export async function authenticateFromRequest(
  req: Request
): Promise<User | null> {
  const token = requestToken(req);
  if (token) {
    const payload = await verifyToken(token);
    if (payload?.sessionId) {
      const db = await getDb();
      if (!db) throw new Error("Account database unavailable.");
      const [row] = await db.select({ user: users }).from(authSessions)
        .innerJoin(users, eq(users.id, authSessions.userId))
        .where(and(
          eq(authSessions.id, sessionKey(payload.sessionId)),
          eq(authSessions.userId, payload.userId),
          gt(authSessions.expiresAt, new Date()),
          eq(users.status, "active")
        )).limit(1);
      return row?.user ?? null;
    }
  }

  return null;
}
