import { NextResponse } from "next/server";
import { registerSchema } from "@/lib/validation/schemas";
import { registerUser } from "@/lib/services/auth";
import { error } from "@/lib/api";

export async function POST(request: Request) {
  try {
    const parsed = registerSchema.safeParse(await request.json());
    if (!parsed.success) return error("Invalid registration data", 422);
    const user = await registerUser(parsed.data);
    return NextResponse.json({ data: user }, { status: 201 });
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    )
      return error("An account with that email already exists", 409);
    return error("Unable to register", 400);
  }
}
