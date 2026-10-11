import { describe, expect, it } from "vitest";
import { countUnreadMessages, inquiryStatusLabel, isInquiryOpen } from "./inquiryWorkflow";

describe("inquiry workflow policy", () => {
  it("allows replies only while an inquiry is open", () => {
    expect(isInquiryOpen("open")).toBe(true);
    expect(isInquiryOpen("closed")).toBe(false);
  });

  it("uses resolved language for closed conversations", () => {
    expect(inquiryStatusLabel("open")).toBe("Open");
    expect(inquiryStatusLabel("closed")).toBe("Resolved");
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
});
