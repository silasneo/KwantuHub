import { NextResponse } from "next/server";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init);
}

export function error(message: string, status = 400) {
  return NextResponse.json({ error: { message } }, { status });
}

export function handleApiError(err: unknown) {
  if (err instanceof Error && err.message === "UNAUTHORIZED")
    return error("Authentication required", 401);
  if (err instanceof Error && err.message === "FORBIDDEN")
    return error("Forbidden", 403);
  console.error(err);
  return error("Internal server error", 500);
}
