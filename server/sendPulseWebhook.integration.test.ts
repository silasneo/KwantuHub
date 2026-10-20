import { describe, expect, it } from "vitest";
import {
  isValidSendPulseWebhookToken,
  mapSendPulseDeliveryEvent,
  parseSendPulseEvents,
} from "./sendPulseWebhook";

describe("SendPulse SMTP staging webhook payloads", () => {
  const stagingPayload = [
    {
      event: "delivered",
      timestamp: 1791744300,
      message_id: 1149317311,
      recipient: "buyer@example.com",
      sender: "notifications@kwantuhub.com",
      subject: "New inquiry reply",
    },
    {
      event: "hard_bounces",
      timestamp: 1791744301,
      task_id: 17076325,
      email: "invalid@example.com",
      smtp_server_response_code: 550,
      smtp_server_response_subcode: "5.1.1",
    },
  ];

  it("parses SendPulse’s documented array payload and maps both events", () => {
    const parsed = parseSendPulseEvents(Buffer.from(JSON.stringify(stagingPayload)));
    expect(parsed).toHaveLength(2);
    expect(parsed[0].providerMessageId).toBe("1149317311");
    expect(parsed[0].email).toBe("buyer@example.com");
    expect(mapSendPulseDeliveryEvent(parsed[0].eventType)).toEqual({ status: "delivered" });
    expect(parsed[1].providerMessageId).toBe("17076325");
    expect(parsed[1].email).toBe("invalid@example.com");
    expect(mapSendPulseDeliveryEvent(parsed[1].eventType)).toEqual({ status: "bounced", suppressReason: "hard_bounce" });
  });

  it("protects the unsigned provider endpoint with an opaque URL token", () => {
    expect(isValidSendPulseWebhookToken("staging-token", "staging-token")).toBe(true);
    expect(isValidSendPulseWebhookToken("wrong-token", "staging-token")).toBe(false);
    expect(isValidSendPulseWebhookToken(undefined, "staging-token")).toBe(false);
  });
});
