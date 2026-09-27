import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import {
  createSessionToken,
  hashSessionToken,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
} from "@/lib/auth/config";
import { cookies } from "next/headers";
import type { Role } from "@prisma/client";

export async function registerUser(input: {
  email: string;
  password: string;
  name: string;
  role: Role;
  businessName?: string;
}) {
  const email = input.email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name: input.name.trim(),
      role: input.role,
      vendorProfile:
        input.role === "VENDOR"
          ? {
              create: {
                businessName: input.businessName?.trim() || input.name.trim(),
              },
            }
          : undefined,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      vendorProfile: true,
    },
  });
  await createSession(user.id);
  return user;
}

export async function loginUser(emailInput: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email: emailInput.trim().toLowerCase() },
  });
  if (
    !user ||
    user.status !== "ACTIVE" ||
    !(await bcrypt.compare(password, user.passwordHash))
  )
    throw new Error("INVALID_CREDENTIALS");
  await createSession(user.id);
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export async function createSession(userId: string) {
  const token = createSessionToken();
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000),
    },
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function logoutUser() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token)
    await prisma.session.deleteMany({
      where: { tokenHash: hashSessionToken(token) },
    });
  store.delete(SESSION_COOKIE);
}
