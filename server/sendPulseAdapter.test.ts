import { describe, expect, it } from "vitest";
import {
  buildSendPulseEmailPayload,
  getSendPulseConfig,
  isSendPulseConfigured,
} from "./sendPulseAdapter";

describe("SendPulse adapter", () => {
  it("reads server-only credentials and sender settings", () => {
    const config = getSendPulseConfig({
      SENDPULSE_CLIENT_ID: "client",
      SENDPULSE_CLIENT_SECRET: "secret",
      SENDPULSE_FROM_EMAIL: "hello@kwantuhub.com",
      SENDPULSE_FROM_NAME: "KwantuHub",
    });
    expect(config).toEqual({
      clientId: "client",
      clientSecret: "secret",
      apiKey: undefined,
      fromEmail: "hello@kwantuhub.com",
      fromName: "KwantuHub",
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
        clientId: "client",
        clientSecret: "secret",
        fromEmail: "hello@kwantuhub.com",
        fromName: "KwantuHub",
      }
    );
    expect(payload.email.from).toEqual({
      name: "KwantuHub",
      email: "hello@kwantuhub.com",
    });
    expect(payload.email.to[0].email).toBe("buyer@example.com");
    expect(Buffer.from(payload.email.html, "base64").toString("utf8")).toBe(
      "<p>Hello</p>"
    );
  });

  it("does not report configuration when sender or credentials are missing", () => {
    expect(isSendPulseConfigured({ fromName: "KwantuHub" })).toBe(false);
    expect(
      isSendPulseConfigured({ fromEmail: "hello@kwantuhub.com", fromName: "KwantuHub" })
    ).toBe(false);
  });
});
