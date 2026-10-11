export type InquiryStatus = "open" | "closed";

/** Only open conversations accept new messages. */
export function isInquiryOpen(status: InquiryStatus): boolean {
  return status === "open";
}

/** UI-facing status copy keeps the workflow language consistent. */
export function inquiryStatusLabel(status: InquiryStatus): string {
  return status === "open" ? "Open" : "Resolved";
}
