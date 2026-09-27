import { getCurrentUser } from "@/lib/auth/session";
import type { Role } from "@prisma/client";

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}

export async function requireRole(role: Role) {
  const user = await requireAuth();
  if (user.role !== role) throw new Error("FORBIDDEN");
  return user;
}

export const requireVendor = () => requireRole("VENDOR");
export const requireAdmin = () => requireRole("ADMIN");
