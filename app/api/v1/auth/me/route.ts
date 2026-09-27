import { getCurrentUser } from "@/lib/auth/session";
import { error, ok } from "@/lib/api";
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return error("Authentication required", 401);
  return ok({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    vendorProfile: user.vendorProfile,
  });
}
