import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { parse as parseCookie } from "cookie";
import type { Request, Response } from "express";
import { getDb, getUserByEmail, getUserById } from "./db";
import { users, type User } from "../drizzle/schema";
import { eq } from "drizzle-orm";

export const JWT_COOKIE_NAME = "kwantu_jwt";
const JWT_SECRET_STRING =
  process.env.JWT_SECRET || "kwantuhub-dev-jwt-secret-diaspora-2026-key";
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_STRING);

export interface JwtPayload {
  userId: number;
  email: string;
  role: "buyer" | "vendor" | "admin";
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
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return {
      userId: Number(payload.userId),
      email: String(payload.email),
      role: payload.role as "buyer" | "vendor" | "admin",
    };
  } catch {
    return null;
  }
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
  // 1. Try JWT cookie first (Scoped SOW requirement)
  const cookies = req.cookies || parseCookie(req.headers.cookie || "");
  const token = cookies[JWT_COOKIE_NAME];
  if (token) {
    const payload = await verifyToken(token);
    if (payload?.userId) {
      const user = await getUserById(payload.userId);
      if (user && user.status === "active") {
        return user;
      }
    }
  }

  return null;
}
