import { describe, expect, it } from "vitest";

const BASE_URL = process.env.TEST_API_URL || "http://127.0.0.1:3000";
const DEMO_PASSWORD = "DemoPass123!";

type JsonResponse = { status: number; body: any; headers: Headers };

async function request(path: string, options: RequestInit = {}): Promise<JsonResponse> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  return { status: response.status, body: await response.json(), headers: response.headers };
}

async function login(email: string) {
  const response = await request("/api/trpc/auth.login?batch=1", {
    method: "POST",
    body: JSON.stringify({ "0": { json: { email, password: DEMO_PASSWORD } } }),
  });
  expect(response.status).toBe(200);
  const setCookie = response.headers.get("set-cookie");
  expect(setCookie).toContain("kwantu_jwt=");
  return setCookie!.split(";")[0]!;
}

describe("Stage 4H live REST role and privacy acceptance", () => {
  it("serves a buyer inquiry collection with a success envelope and no vendor contact PII", async () => {
    const cookie = await login("demo.buyer@kwantuhub.local");
    const response = await request("/api/v1/buyer/inquiries", { headers: { Cookie: cookie } });
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("success");
    expect(Array.isArray(response.body.data)).toBe(true);
    for (const inquiry of response.body.data) {
      expect(inquiry.vendor?.contactEmail).toBeUndefined();
      expect(inquiry.vendor?.phone).toBeUndefined();
      expect(inquiry.vendor?.whatsapp).toBeUndefined();
      expect(inquiry.vendorPrivateNotes).toBeUndefined();
    }
  });

  it("serves vendor verification status only to the authenticated vendor session", async () => {
    const vendorCookie = await login("demo.vendor.eki@kwantuhub.local");
    const allowed = await request("/api/v1/vendor/verificationStatus", { headers: { Cookie: vendorCookie } });
    expect(allowed.status).toBe(200);
    expect(allowed.body.status).toBe("success");
    expect(allowed.body.data.sessions).toBeDefined();
    expect(JSON.stringify(allowed.body)).not.toContain("identityEvidence");

    const denied = await request("/api/v1/vendor/verificationStatus");
    expect(denied.status).toBe(401);
    expect(denied.body.error.code).toBe("UNAUTHORIZED");
  });

  it("serves admin analytics to admin sessions and denies it to buyer sessions", async () => {
    const adminCookie = await login("admin@kwantuhub.local");
    const adminResponse = await request("/api/v1/admin/analytics", { headers: { Cookie: adminCookie } });
    expect(adminResponse.status).toBe(200);
    expect(adminResponse.body.status).toBe("success");
    expect(adminResponse.body.data.email).toBeUndefined();
    expect(adminResponse.body.data.phone).toBeUndefined();

    const buyerCookie = await login("demo.buyer@kwantuhub.local");
    const buyerResponse = await request("/api/v1/admin/analytics", { headers: { Cookie: buyerCookie } });
    expect(buyerResponse.status).toBe(403);
    expect(buyerResponse.body.status).toBe("error");
    expect(buyerResponse.body.error.code).toBe("FORBIDDEN");
  });

  it("returns only approved/public data from the REST vendor collection", async () => {
    const response = await request("/api/v1/vendors");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("success");
    for (const vendor of response.body.data) {
      expect(vendor.approvalStatus).toBe("approved");
      expect(vendor.contactEmail).toBeUndefined();
      expect(vendor.phone).toBeUndefined();
      expect(vendor.whatsapp).toBeUndefined();
      expect(vendor.identityStatus).toBeUndefined();
      expect(vendor.residenceCountry).toBeUndefined();
    }
  });

  it("covers the buyer, vendor, notification, and admin read contracts", async () => {
    const buyerCookie = await login("demo.buyer@kwantuhub.local");
    for (const path of [
      "/api/v1/buyer/wishlist",
      "/api/v1/buyer/reviews",
      "/api/v1/notifications/list?limit=20&unreadOnly=false",
    ]) {
      const response = await request(path, { headers: { Cookie: buyerCookie } });
      expect(response.status, path).toBe(200);
      expect(response.body.status, path).toBe("success");
    }

    const vendorCookie = await login("demo.vendor.eki@kwantuhub.local");
    for (const path of [
      "/api/v1/vendor/listings",
      "/api/v1/vendor/inquiries",
      "/api/v1/vendor/analytics",
      "/api/v1/vendor/leadFunnel",
    ]) {
      const response = await request(path, { headers: { Cookie: vendorCookie } });
      expect(response.status, path).toBe(200);
      expect(response.body.status, path).toBe("success");
    }

    const adminCookie = await login("admin@kwantuhub.local");
    for (const path of [
      "/api/v1/admin/moderation",
      "/api/v1/admin/conversationReports",
      "/api/v1/admin/notificationDeliverySummary",
      "/api/v1/admin/verificationSessions",
      "/api/v1/admin/leadConversionSummary",
    ]) {
      const response = await request(path, { headers: { Cookie: adminCookie } });
      expect(response.status, path).toBe(200);
      expect(response.body.status, path).toBe("success");
    }
  });

  it("returns validation envelopes for buyer and admin mutations without changing data", async () => {
    const buyerCookie = await login("demo.buyer@kwantuhub.local");
    const buyerResponse = await request("/api/v1/buyer/createInquiry", {
      method: "POST",
      headers: { Cookie: buyerCookie },
      body: JSON.stringify({}),
    });
    expect(buyerResponse.status).toBe(400);
    expect(buyerResponse.body.status).toBe("error");
    expect(buyerResponse.body.error.code).toBe("BAD_REQUEST");

    const adminCookie = await login("admin@kwantuhub.local");
    const adminResponse = await request("/api/v1/admin/moderateMessage", {
      method: "POST",
      headers: { Cookie: adminCookie },
      body: JSON.stringify({}),
    });
    expect(adminResponse.status).toBe(400);
    expect(adminResponse.body.status).toBe("error");
    expect(adminResponse.body.error.code).toBe("BAD_REQUEST");
  });

  it("returns a standardized 429 envelope after repeated contact-reveal attempts", async () => {
    const buyerCookie = await login("demo.buyer@kwantuhub.local");
    let lastResponse: JsonResponse | undefined;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      lastResponse = await request("/api/v1/marketplace/revealContact", {
        method: "POST",
        headers: { Cookie: buyerCookie },
        body: JSON.stringify({ listingId: 1 }),
      });
    }

    expect(lastResponse?.status).toBe(429);
    expect(lastResponse?.body.status).toBe("error");
    expect(lastResponse?.body.error.code).toBe("TOO_MANY_REQUESTS");
  });

  it("returns ownership-safe 404/403 envelopes for cross-role resources", async () => {
    const buyerCookie = await login("demo.buyer@kwantuhub.local");
    const vendorMutation = await request("/api/v1/vendor/replyInquiry", {
      method: "POST",
      headers: { Cookie: buyerCookie },
      body: JSON.stringify({ inquiryId: 1, message: "cross-role access must fail" }),
    });
    expect(vendorMutation.status).toBe(403);
    expect(vendorMutation.body.status).toBe("error");
    expect(vendorMutation.body.error.code).toBe("FORBIDDEN");

    const adminCookie = await login("admin@kwantuhub.local");
    const missingDelivery = await request("/api/v1/admin/retryNotificationDelivery", {
      method: "POST",
      headers: { Cookie: adminCookie },
      body: JSON.stringify({ deliveryId: 999999999 }),
    });
    expect(missingDelivery.status).toBe(404);
    expect(missingDelivery.body.status).toBe("error");
    expect(missingDelivery.body.error.code).toBe("NOT_FOUND");
  });
});
