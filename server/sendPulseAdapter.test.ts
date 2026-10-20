import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSendPulseEmailPayload,
  getSendPulseConfig,
  isSendPulseConfigured,
  SendPulseTransactionalEmailAdapter,
} from "./sendPulseAdapter";

afterEach(() => vi.restoreAllMocks());

describe("SendPulse adapter", () => {
  it("reads API-key credentials and sender aliases from server-only env", () => {
    const config = getSendPulseConfig({
      SENDPULSE_API_KEY: "api-key",
      SENDPULSE_API_FROM_EMAIL: "devtest@sendpulseemail.com",
      SENDPULSE_API_FROM_NAME: "KwantuHub Test",
      SENDPULSE_API_BASE_URL: "https://api.sendpulse.test/",
    });
    expect(config).toEqual({
      apiBaseUrl: "https://api.sendpulse.test",
      clientId: undefined,
      clientSecret: undefined,
      apiKey: "api-key",
      fromEmail: "devtest@sendpulseemail.com",
      fromName: "KwantuHub Test",
    });
    expect(isSendPulseConfigured(config)).toBe(true);
  });

  it("builds SendPulse SMTP payload with base64 HTML", () => {
    const payload = buildSendPulseEmailPayload(
      {
        to: [{ email: "buyer@example.com", name: "Buyer" }],
        subject: "New inquiry",
        html: "<p>Hello</p>",
        text: "Hello",
        idempotencyKey: "outbox:1:email",
      },
      {
        apiBaseUrl: "https://api.sendpulse.com",
        apiKey: "api-key",
        fromEmail: "hello@kwantuhub.com",
        fromName: "KwantuHub",
      }
    );
    expect(payload.email.from).toEqual({ name: "KwantuHub", email: "hello@kwantuhub.com" });
    expect(payload.email.to[0].email).toBe("buyer@example.com");
    expect(Buffer.from(payload.email.html, "base64").toString("utf8")).toBe("<p>Hello</p>");
  });

  it("verifies API-key auth through SendPulse user info", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: true, user: { id: 7 } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new SendPulseTransactionalEmailAdapter({
      apiBaseUrl: "https://api.sendpulse.test",
      apiKey: "api-key",
      fromEmail: "hello@kwantuhub.com",
      fromName: "KwantuHub",
    });

    await expect(adapter.verifyAuth()).resolves.toEqual({ result: true, user: { id: 7 } });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.sendpulse.test/user/info",
      expect.objectContaining({ headers: { authorization: "Bearer api-key", accept: "application/json" } })
    );
  });

  it("does not report configuration when sender or credentials are missing", () => {
    expect(isSendPulseConfigured({ apiBaseUrl: "https://api.sendpulse.com", fromName: "KwantuHub" })).toBe(false);
    expect(isSendPulseConfigured({ apiBaseUrl: "https://api.sendpulse.com", fromEmail: "hello@kwantuhub.com", fromName: "KwantuHub" })).toBe(false);
  });

  it("surfaces a bounded provider failure without leaking the request body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "provider temporarily unavailable", secret: "do-not-log" }), { status: 503 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new SendPulseTransactionalEmailAdapter({
      apiBaseUrl: "https://api.sendpulse.test",
      apiKey: "api-key",
      fromEmail: "hello@kwantuhub.com",
      fromName: "KwantuHub",
    });

    await expect(adapter.send({
      to: [{ email: "buyer@example.com" }],
      subject: "Inquiry",
      html: "<p>Inquiry</p>",
      text: "Inquiry",
      idempotencyKey: "rest-provider-failure-test",
    })).rejects.toThrow("SendPulse email request failed (503): provider temporarily unavailable");
  });
});
