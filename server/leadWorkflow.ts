export type LeadStage =
  | "new_inquiry"
  | "contacted"
  | "quote_sent"
  | "deal_won"
  | "deal_lost";

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  new_inquiry: "New Inquiry",
  contacted: "Contacted",
  quote_sent: "Quote / Details Sent",
  deal_won: "Deal Won (Success)",
  deal_lost: "Deal Lost / Closed",
};

export const ALLOWED_TRANSITIONS: Record<LeadStage, LeadStage[]> = {
  new_inquiry: ["contacted", "quote_sent", "deal_lost"],
  contacted: ["quote_sent", "deal_won", "deal_lost"],
  quote_sent: ["deal_won", "deal_lost"],
  deal_won: ["contacted"], // allow re-engagement
  deal_lost: ["new_inquiry", "contacted"], // allow re-opening
};

export function canTransitionLead(from: LeadStage, to: LeadStage): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function computeLeadFunnel(stages: LeadStage[]) {
  const counts: Record<LeadStage, number> = {
    new_inquiry: 0,
    contacted: 0,
    quote_sent: 0,
    deal_won: 0,
    deal_lost: 0,
  };

  for (const s of stages) {
    if (counts[s] !== undefined) counts[s]++;
  }

  const total = stages.length;
  const won = counts.deal_won;
  const conversionRate = total > 0 ? won / total : 0;

  return {
    total,
    counts,
    won,
    lost: counts.deal_lost,
    active: counts.new_inquiry + counts.contacted + counts.quote_sent,
    conversionRate: Math.round(conversionRate * 100) / 100,
  };
}
