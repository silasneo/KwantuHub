import { describe, expect, it } from "vitest";
import {
  calculateRetryDelay,
  getEmailPreferenceField,
  notificationCopy,
  toNotificationType,
} from "./notificationWorker";

describe("notification worker policy", () => {
  it("maps event types to persisted notification types", () => {
    expect(toNotificationType("INQUIRY_CREATED")).toBe("inquiry_created");
    expect(toNotificationType("INQUIRY_REPLY_RECEIVED")).toBe("inquiry_reply_received");
    expect(getEmailPreferenceField("INQUIRY_REPLY_RECEIVED")).toBe("emailReplies");
    expect(getEmailPreferenceField("VENDOR_APPROVED")).toBe("emailAccount");
  });

  it("builds stable inquiry notification copy", () => {
    expect(
      notificationCopy({
        eventType: "INQUIRY_CREATED",
        idempotencyKey: "test",
        recipientUserId: 2,
        entityType: "inquiry",
        entityId: 9,
        payload: { subject: "Question about a listing" },
      })
    ).toEqual({
      title: "New inquiry received",
      body: "Question about a listing",
    });
  });

  it("uses bounded exponential retry delays", () => {
    expect(calculateRetryDelay(1)).toBe(60_000);
    expect(calculateRetryDelay(3)).toBe(240_000);
    expect(calculateRetryDelay(99)).toBe(1_920_000);
  });
});
