import { describe, expect, it } from "vitest";
import {
  countUnreadMessages,
  getConversationMetrics,
  getConversationState,
  inquiryStatusLabel,
  isInquiryOpen,
} from "./inquiryWorkflow";

describe("inquiry workflow policy", () => {
  it("allows replies only while an inquiry is open", () => {
    expect(isInquiryOpen("open")).toBe(true);
    expect(isInquiryOpen("closed")).toBe(false);
  });

  it("uses resolved language for closed conversations", () => {
    expect(inquiryStatusLabel("open")).toBe("Open");
    expect(inquiryStatusLabel("closed")).toBe("Resolved");
    expect(inquiryStatusLabel("archived")).toBe("Archived");
  });

  it("counts only unread messages from the other participant", () => {
    const now = new Date();
    expect(
      countUnreadMessages(
        [
          { senderId: 1, readAt: null },
          { senderId: 2, readAt: null },
          { senderId: 2, readAt: now },
        ],
        2
      )
    ).toBe(1);
  });

  it("identifies which participant is expected to respond next", () => {
    const now = new Date();
    expect(getConversationState("open", [{ senderId: 1, createdAt: now }], 1, 1)).toBe(
      "awaiting_vendor"
    );
    expect(getConversationState("open", [{ senderId: 1, createdAt: now }], 1, 7)).toBe(
      "awaiting_buyer"
    );
    expect(getConversationState("closed", [{ senderId: 1, createdAt: now }], 1, 1)).toBe(
      "resolved"
    );
    expect(getConversationState("archived", [{ senderId: 1, createdAt: now }], 1, 1)).toBe(
      "archived"
    );
  });

  it("measures the first vendor response and latest activity", () => {
    const first = new Date("2026-10-11T10:00:00.000Z");
    const reply = new Date("2026-10-11T10:07:30.000Z");
    const metrics = getConversationMetrics(
      [
        { senderId: 1, createdAt: first },
        { senderId: 2, createdAt: reply },
      ],
      1
    );
    expect(metrics.responseTimeSeconds).toBe(450);
    expect(metrics.lastMessageAt).toEqual(reply);
  });
});
