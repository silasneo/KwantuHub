import { describe, expect, it } from "vitest";
import {
  getSendPulseAlertPolicy,
  mapSendPulseDeliveryEvent,
  normalizeEmail,
  shouldEmitDeliveryAlerts,
} from "./sendPulseWebhook";

describe("SendPulse webhook policy", () => {
  it("maps provider lifecycle events to delivery states", () => {
    expect(mapSendPulseDeliveryEvent("delivered")).toEqual({ status: "delivered" });
    expect(mapSendPulseDeliveryEvent("hard-bounce")).toEqual({
      status: "bounced",
      suppressReason: "hard_bounce",
    });
    expect(mapSendPulseDeliveryEvent("spam complaint")).toEqual({
      status: "complained",
      suppressReason: "complaint",
    });
    expect(mapSendPulseDeliveryEvent("unsubscribe")).toEqual({
      status: "complained",
      suppressReason: "unsubscribe",
    });
    expect(mapSendPulseDeliveryEvent("unknown-event")).toBeNull();
  });

  it("normalizes suppression email keys", () => {
    expect(normalizeEmail("  Buyer@Example.COM ")).toBe("buyer@example.com");
  });

  it("alerts vendors and admins when a SendPulse address fails", () => {
    const hardBounce = mapSendPulseDeliveryEvent("hard_bounces");
    expect(hardBounce).not.toBeNull();
    expect(getSendPulseAlertPolicy(hardBounce!, "vendor")).toEqual({
      notifyRecipient: true,
      notifyAdmins: true,
      requiresAddressUpdate: true,
      reason: "hard_bounce",
    });
    expect(getSendPulseAlertPolicy(hardBounce!, "buyer")?.notifyRecipient).toBe(false);
    expect(getSendPulseAlertPolicy({ status: "delivered" }, "vendor")).toBeNull();
  });

  it("does not recursively alert on remediation-alert deliveries", () => {
    expect(shouldEmitDeliveryAlerts("INQUIRY_CREATED")).toBe(true);
    expect(shouldEmitDeliveryAlerts("EMAIL_ADDRESS_ACTION_REQUIRED")).toBe(false);
    expect(shouldEmitDeliveryAlerts("EMAIL_DELIVERY_ALERT")).toBe(false);
  });
});
