import { loginSchema } from "@/lib/validation/schemas";
import { loginUser } from "@/lib/services/auth";
import { error, ok } from "@/lib/api";

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json());
  if (!parsed.success) return error("Invalid login data", 422);
  try {
    return ok(await loginUser(parsed.data.email, parsed.data.password));
  } catch {
    return error("Invalid email or password", 401);
  }
}
