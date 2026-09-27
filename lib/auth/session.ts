import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { hashSessionToken, SESSION_COOKIE } from "@/lib/auth/config";

export async function getCurrentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findFirst({
    where: {
      tokenHash: hashSessionToken(token),
      expiresAt: { gt: new Date() },
      user: { status: "ACTIVE" },
    },
    include: {
      user: {
        include: {
          vendorProfile: { include: { storefront: true } },
        },
      },
    },
  });
  return session?.user ?? null;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}
