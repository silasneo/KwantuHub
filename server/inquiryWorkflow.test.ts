import { describe, expect, it } from "vitest";
import { inquiryStatusLabel, isInquiryOpen } from "./inquiryWorkflow";

describe("inquiry workflow policy", () => {
  it("allows replies only while an inquiry is open", () => {
    expect(isInquiryOpen("open")).toBe(true);
    expect(isInquiryOpen("closed")).toBe(false);
  });

  it("uses resolved language for closed conversations", () => {
    expect(inquiryStatusLabel("open")).toBe("Open");
    expect(inquiryStatusLabel("closed")).toBe("Resolved");
  });
});
