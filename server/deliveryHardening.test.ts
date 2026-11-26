import { afterEach, describe, expect, it, vi } from "vitest";
import {
  absoluteAppUrl,
  renderTransactionalEmail,
} from "./notificationTemplates";
import {
  emailDeliveryPolicy,
  getEmailPreferenceField,
  renderNotificationEmail,
  toNotificationType,
} from "./notificationWorker";
import {
  SendPulseSendError,
  SendPulseTransactionalEmailAdapter,
} from "./sendPulseAdapter";
import { shouldApplyDeliveryTransition } from "./sendPulseWebhook";
import {
  deriveDiditCheckDecisions,
  normalizeCountryCode,
  readStoredDiditPayload,
} from "./diditWebhook";
import { encryptOtp } from "./contactVerification";
import {
  isWebhookEventDue,
  webhookRetryDelayMs,
  WEBHOOK_MAX_AUTOMATIC_ATTEMPTS,
} from "./webhookReconciliation";
import { savedSearchMarketplaceUrl } from "./savedSearchService";

const APP = "https://kwantuhub.example";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("email templates", () => {
  it("absolutizes same-origin paths and rejects foreign or protocol-relative links", () => {
    expect(absoluteAppUrl("/listings/a-b", APP)).toBe(
      "https://kwantuhub.example/listings/a-b"
    );
    expect(absoluteAppUrl("https://kwantuhub.example/admin", APP)).toBe(
      "https://kwantuhub.example/admin"
    );
    expect(absoluteAppUrl("https://evil.example/x", APP)).toBeNull();
    expect(absoluteAppUrl("//evil.example/x", APP)).toBeNull();
    expect(absoluteAppUrl("/\\evil.example", APP)).toBeNull();
    expect(absoluteAppUrl("javascript:alert(1)", APP)).toBeNull();
    expect(absoluteAppUrl("listings/x", APP)).toBeNull();
  });

  it("escapes content and renders absolute action, item and preference links", () => {
    const email = renderTransactionalEmail({
      title: "New match",
      body: "<b>Hi</b>",
      actionUrl: "/marketplace?q=a&b=c",
      appUrl: APP,
      items: [
        { title: "Chair <x>", url: "/listings/chair" },
        { title: "Bad", url: "https://evil.example" },
      ],
    });
    expect(email.html).toContain("&lt;b&gt;Hi&lt;/b&gt;");
    expect(email.html).toContain(
      'href="https://kwantuhub.example/marketplace?q=a&amp;b=c"'
    );
    expect(email.html).toContain(
      'href="https://kwantuhub.example/listings/chair"'
    );
    expect(email.html).not.toContain("evil.example");
    expect(email.text).toContain("https://kwantuhub.example/profile");
  });

  it("renders saved-search digests with listing links", () => {
    const email = renderNotificationEmail({
      eventType: "SAVED_SEARCH_DIGEST",
      idempotencyKey: "d",
      recipientUserId: 1,
      entityType: "saved_search",
      entityId: 1,
      payload: {
        searchName: "Chairs",
        count: 1,
        actionUrl: "/marketplace?q=chair",
        listings: [{ title: "Oak chair", actionUrl: "/listings/oak" }],
      },
    });
    expect(email.text).toMatch(/\/listings\/oak/);
    expect(email.text).not.toMatch(/: \/listings/);
  });
});

describe("delivery policy", () => {
  it("maps saved-search events to their own type and opt-in preference", () => {
    expect(toNotificationType("SAVED_SEARCH_MATCH")).toBe("saved_search_match");
    expect(toNotificationType("SAVED_SEARCH_DIGEST")).toBe(
      "saved_search_digest"
    );
    expect(getEmailPreferenceField("SAVED_SEARCH_MATCH")).toBe(
      "emailSavedSearches"
    );
    expect(getEmailPreferenceField("SAVED_SEARCH_DIGEST")).toBe(
      "emailSavedSearches"
    );
  });

  it("keeps security mail out of preferences and pause but honours hard bounces", () => {
    for (const eventType of ["CONTACT_VERIFICATION_OTP", "PASSWORD_RESET"]) {
      const policy = emailDeliveryPolicy(eventType);
      expect(policy).toMatchObject({
        category: "security",
        honorsPause: false,
        honorsPreferences: false,
      });
      expect(policy.blockingSuppressions).toContain("hard_bounce");
      expect(policy.blockingSuppressions).not.toContain("unsubscribe");
    }
    expect(emailDeliveryPolicy("SAVED_SEARCH_MATCH")).toMatchObject({
      honorsPause: true,
      honorsPreferences: true,
    });
    expect(
      emailDeliveryPolicy("INQUIRY_CREATED").blockingSuppressions
    ).toContain("unsubscribe");
  });
});

describe("SendPulse send outcome classification", () => {
  const adapter = () =>
    new SendPulseTransactionalEmailAdapter({
      apiBaseUrl: "https://api.sendpulse.test",
      apiKey: "k",
      fromEmail: "a@example.test",
      fromName: "K",
    });
  const message = {
    to: [{ email: "b@example.test" }],
    subject: "s",
    html: "h",
    text: "t",
    idempotencyKey: "i",
  };

  it.each([
    [
      "network failure",
      () => Promise.reject(new TypeError("fetch failed")),
      "ambiguous",
    ],
    [
      "gateway timeout",
      () => Promise.resolve(new Response("", { status: 504 })),
      "ambiguous",
    ],
    [
      "server error",
      () => Promise.resolve(new Response("", { status: 500 })),
      "ambiguous",
    ],
    [
      "unreadable success",
      () => Promise.resolve(new Response("not-json", { status: 200 })),
      "ambiguous",
    ],
    [
      "unavailable",
      () => Promise.resolve(new Response("", { status: 503 })),
      "rejected",
    ],
    [
      "bad request",
      () => Promise.resolve(new Response("", { status: 400 })),
      "rejected",
    ],
  ])("classifies %s", async (_name, response, outcome) => {
    vi.stubGlobal("fetch", vi.fn(response));
    const error = await adapter()
      .send(message)
      .catch(caught => caught);
    expect(error).toBeInstanceOf(SendPulseSendError);
    expect((error as SendPulseSendError).outcome).toBe(outcome);
  });

  it("never invents a provider message ID from the idempotency key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"result":true}', { status: 200 }))
    );
    expect(await adapter().send(message)).toEqual({
      providerMessageId: null,
      accepted: true,
    });
  });
});

describe("SendPulse event precedence", () => {
  it("never downgrades terminal delivery states without newer timestamps", () => {
    expect(
      shouldApplyDeliveryTransition(
        { status: "delivered", providerEventAt: null },
        { status: "sent" }
      )
    ).toBe(false);
    expect(
      shouldApplyDeliveryTransition(
        { status: "sent", providerEventAt: null },
        { status: "bounced" }
      )
    ).toBe(true);
    const t1 = new Date("2026-01-01T00:00:00Z");
    const t2 = new Date("2026-01-01T00:01:00Z");
    expect(
      shouldApplyDeliveryTransition(
        { status: "delivered", providerEventAt: t2 },
        { status: "sent", providerEventAt: t1 }
      )
    ).toBe(false);
    expect(
      shouldApplyDeliveryTransition(
        { status: "delivered", providerEventAt: t1 },
        { status: "complained", providerEventAt: t2 }
      )
    ).toBe(true);
  });
});

describe("webhook reconciliation backoff", () => {
  it("backs off exponentially and stops at the automatic attempt cap", () => {
    const now = new Date("2026-01-01T01:00:00Z");
    expect(webhookRetryDelayMs(1)).toBe(60_000);
    expect(webhookRetryDelayMs(3)).toBe(240_000);
    expect(webhookRetryDelayMs(20)).toBe(3_600_000);
    expect(
      isWebhookEventDue(
        { processingAttempts: 1, updatedAt: new Date(now.getTime() - 61_000) },
        now
      )
    ).toBe(true);
    expect(
      isWebhookEventDue(
        { processingAttempts: 3, updatedAt: new Date(now.getTime() - 61_000) },
        now
      )
    ).toBe(false);
    expect(
      isWebhookEventDue(
        {
          processingAttempts: WEBHOOK_MAX_AUTOMATIC_ATTEMPTS,
          updatedAt: new Date(0),
        },
        now
      )
    ).toBe(false);
  });
});

describe("Didit per-check evidence", () => {
  const approved = (extra: Record<string, unknown>) => ({
    status: "Approved",
    session_id: "s",
    decision: extra,
  });

  it("certifies residence only from an approved proof-of-address in an eligible country", () => {
    const payload = approved({
      id_verification: { status: "Approved" },
      poa_verification: { status: "Approved", country_code: "CAN" },
    });
    expect(
      deriveDiditCheckDecisions(
        payload,
        { countryCode: null },
        { activeOnboarding: false, identityMatches: false }
      )
    ).toEqual([
      expect.objectContaining({ checkType: "identity", outcome: "verified" }),
      expect.objectContaining({
        checkType: "residence",
        outcome: "verified",
        countryCode: "CA",
      }),
    ]);
    expect(
      deriveDiditCheckDecisions(
        payload,
        { countryCode: "US" },
        { activeOnboarding: false, identityMatches: false }
      )
    ).toContainEqual(
      expect.objectContaining({
        checkType: "residence",
        outcome: "rejected",
        countryCode: "CA",
      })
    );
  });

  it("never derives residence from the requested session label alone", () => {
    const decisions = deriveDiditCheckDecisions(
      approved({ id_verification: { status: "Approved" } }),
      { countryCode: "US" },
      { activeOnboarding: false, identityMatches: false }
    );
    expect(decisions.map(decision => decision.checkType)).toEqual(["identity"]);
    expect(
      deriveDiditCheckDecisions(
        approved({ poa_verification: { status: "Approved" } }),
        { countryCode: "US" },
        { activeOnboarding: false, identityMatches: false }
      )
    ).toEqual([]);
  });

  it("withholds identity certification for onboarding sessions whose name/DOB did not match", () => {
    const payload = approved({ id_verification: { status: "Approved" } });
    expect(
      deriveDiditCheckDecisions(
        payload,
        { countryCode: null },
        { activeOnboarding: true, identityMatches: false }
      )
    ).toEqual([]);
    expect(
      deriveDiditCheckDecisions(
        payload,
        { countryCode: null },
        { activeOnboarding: true, identityMatches: true }
      )
    ).toEqual([
      expect.objectContaining({ checkType: "identity", outcome: "verified" }),
    ]);
  });

  it("records independent declined checks", () => {
    const decisions = deriveDiditCheckDecisions(
      {
        status: "Declined",
        decision: {
          id_verifications: [{ status: "Approved" }],
          poa_verifications: [{ status: "Declined" }],
        },
      },
      { countryCode: null },
      { activeOnboarding: false, identityMatches: false }
    );
    expect(decisions).toEqual([
      expect.objectContaining({ checkType: "identity", outcome: "verified" }),
      expect.objectContaining({ checkType: "residence", outcome: "rejected" }),
    ]);
  });

  it("normalizes countries and replays encrypted early callbacks", () => {
    expect(normalizeCountryCode("usa")).toBe("US");
    expect(normalizeCountryCode("GBR")).toBeNull();
    const stored = {
      session_id: "s",
      status: "Approved",
      signatureVersion: "raw",
      encryptedPayload: encryptOtp(
        JSON.stringify({ session_id: "s", status: "Approved" })
      ),
    };
    expect(readStoredDiditPayload(stored)).toEqual({
      payload: { session_id: "s", status: "Approved" },
      signatureVersion: "raw",
    });
    expect(readStoredDiditPayload({ session_id: "s" })).toBeNull();
  });
});

describe("saved-search links", () => {
  it("builds a marketplace URL from saved criteria", () => {
    expect(
      savedSearchMarketplaceUrl(
        {
          query: "oak chair",
          listingType: "product",
          location: null,
          minPrice: 10,
          maxPrice: null,
          currency: "USD",
          remoteOnly: false,
          verifiedVendorOnly: true,
        } as Parameters<typeof savedSearchMarketplaceUrl>[0],
        "furniture"
      )
    ).toBe(
      "/marketplace?q=oak+chair&category=furniture&type=product&min=10&currency=USD&verified=true&sort=newest"
    );
  });
});
