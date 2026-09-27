import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      data: {
        status: "ok",
        service: "kwantuhub-api",
        database: "ok",
        timestamp: new Date().toISOString(),
      },
    });
  } catch {
    return NextResponse.json(
      { error: { message: "Database unavailable" } },
      { status: 503 },
    );
  }
}
