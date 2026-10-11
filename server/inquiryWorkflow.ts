export type InquiryStatus = "open" | "closed";

/** Only open conversations accept new messages. */
export function isInquiryOpen(status: InquiryStatus): boolean {
  return status === "open";
}

/** UI-facing status copy keeps the workflow language consistent. */
export function inquiryStatusLabel(status: InquiryStatus): string {
  return status === "open" ? "Open" : "Resolved";
}

export type ReadStateMessage = {
  senderId: number;
  readAt: Date | null;
};

/** Count only unread messages authored by the other conversation participant. */
export function countUnreadMessages(
  messages: ReadStateMessage[],
  participantId: number
): number {
  return messages.filter(
    message => message.senderId !== participantId && message.readAt === null
  ).length;
}
