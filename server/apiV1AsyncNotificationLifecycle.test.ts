import { describe, expect, it } from "vitest";

const BASE_URL = process.env.TEST_API_URL || "http://127.0.0.1:3000";
const DEMO_PASSWORD = "DemoPass123!";

async function login(email: string) {
  const response = await fetch(`${BASE_URL}/api/trpc/auth.login?batch=1`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ "0": { json: { email, password: DEMO_PASSWORD } } }),
  });
  expect(response.status).toBe(200);
  const setCookie = response.headers.get("set-cookie");
  expect(setCookie).toContain("kwantu_jwt=");
  return setCookie!.split(";")[0]!;
}

describe("Stage 4H async notification lifecycle and admin retry envelopes", () => {
  it("serves delivery summaries and returns standardized error envelopes on invalid retries", async () => {
    const adminCookie = await login("admin@kwantuhub.local");

    // 1. Fetch current delivery summary through REST
    const summaryResponse = await fetch(`${BASE_URL}/api/v1/admin/notificationDeliverySummary`, {
      headers: { Cookie: adminCookie, Accept: "application/json" },
    });
    expect(summaryResponse.status).toBe(200);
    const summaryBody = await summaryResponse.json();
    expect(summaryBody.status).toBe("success");
    expect(Array.isArray(summaryBody.data.byStatus)).toBe(true);

    // 2. Fetch deliveries filtered by status through REST
    const deliveriesResponse = await fetch(`${BASE_URL}/api/v1/admin/notificationDeliveries?status=failed`, {
      headers: { Cookie: adminCookie, Accept: "application/json" },
    });
    expect(deliveriesResponse.status).toBe(200);
    const deliveriesBody = await deliveriesResponse.json();
    expect(deliveriesBody.status).toBe("success");
    expect(Array.isArray(deliveriesBody.data)).toBe(true);

    // 3. Retry a nonexistent delivery ID to verify standard 404 error envelope
    const invalidRetry = await fetch(`${BASE_URL}/api/v1/admin/retryNotificationDelivery`, {
      method: "POST",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ deliveryId: 999999999 }),
    });
    expect(invalidRetry.status).toBe(404);
    const retryBody = await invalidRetry.json();
    expect(retryBody.status).toBe("error");
    expect(retryBody.error.code).toBe("NOT_FOUND");
    expect(retryBody.error.message).toContain("Delivery not found");

    // 4. Attempt retry without admin session to verify 401 error envelope
    const unauthenticatedRetry = await fetch(`${BASE_URL}/api/v1/admin/retryNotificationDelivery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deliveryId: 1 }),
    });
    expect(unauthenticatedRetry.status).toBe(401);
  });
});
