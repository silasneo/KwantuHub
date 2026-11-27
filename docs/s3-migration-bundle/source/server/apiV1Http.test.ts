import { describe, expect, it } from "vitest";

const BASE_URL = process.env.TEST_API_URL || "http://127.0.0.1:3000";

async function fetchJson(path: string, options: RequestInit = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const body = await response.json();
  return { status: response.status, body };
}

describe("Stage 4H real HTTP REST envelopes and error mapping", () => {
  it("returns standard success envelope for /api/v1/health", async () => {
    const { status, body } = await fetchJson("/api/v1/health");
    expect(status).toBe(200);
    expect(body.status).toBe("success");
    expect(body.timestamp).toBeDefined();
    expect(body.data.platform).toBe("KwantuHub");
  });

  it("returns standard error envelope with 401 for unauthenticated protected route", async () => {
    const { status, body } = await fetchJson("/api/v1/buyer/inquiries");
    expect(status).toBe(401);
    expect(body.status).toBe("error");
    expect(body.timestamp).toBeDefined();
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(body.error.message).toBeDefined();
  });

  it("returns standard error envelope with 404 for unknown REST procedure", async () => {
    const { status, body } = await fetchJson("/api/v1/nonexistent/endpoint");
    expect(status).toBe(404);
    expect(body.status).toBe("error");
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns 405 Method Not Allowed when method does not match procedure type", async () => {
    const { status, body } = await fetchJson("/api/v1/marketplace/search", { method: "POST" });
    expect(status).toBe(405);
    expect(body.status).toBe("error");
    expect(body.error.code).toBe("METHOD_NOT_ALLOWED");
  });

  it("returns 400 Bad Request for malformed JSON in query input parameter", async () => {
    const { status, body } = await fetchJson("/api/v1/categories?input=not-valid-json");
    expect(status).toBe(400);
    expect(body.status).toBe("error");
    expect(body.error.code).toBe("BAD_REQUEST");
  });
});
