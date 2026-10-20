import { describe, expect, it } from "vitest";
import {
  canTransitionLead,
  computeLeadFunnel,
  LEAD_STAGE_LABELS,
  type LeadStage,
} from "./leadWorkflow";

describe("Stage 4E vendor lead workflow and conversion logic", () => {
  it("enforces allowed lead stage transitions", () => {
    expect(canTransitionLead("new_inquiry", "contacted")).toBe(true);
    expect(canTransitionLead("contacted", "quote_sent")).toBe(true);
    expect(canTransitionLead("quote_sent", "deal_won")).toBe(true);
    expect(canTransitionLead("new_inquiry", "deal_won")).toBe(false); // must contact/quote first
  });

  it("calculates lead conversion funnel accurately", () => {
    const stages: LeadStage[] = [
      "new_inquiry",
      "contacted",
      "quote_sent",
      "deal_won",
      "deal_won",
      "deal_lost",
    ];

    const funnel = computeLeadFunnel(stages);
    expect(funnel.total).toBe(6);
    expect(funnel.won).toBe(2);
    expect(funnel.lost).toBe(1);
    expect(funnel.active).toBe(3);
    expect(funnel.conversionRate).toBe(0.33);
  });

  it("provides human-readable labels for all lead stages", () => {
    expect(LEAD_STAGE_LABELS.new_inquiry).toBe("New Inquiry");
    expect(LEAD_STAGE_LABELS.deal_won).toBe("Deal Won (Success)");
  });
});
