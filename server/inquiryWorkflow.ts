export type InquiryStatus = "open" | "closed" | "archived";

/** Only open conversations accept new messages. */
export function isInquiryOpen(status: InquiryStatus): boolean {
  return status === "open";
}

/** UI-facing status copy keeps the workflow language consistent. */
export function inquiryStatusLabel(status: InquiryStatus): string {
  if (status === "open") return "Open";
  if (status === "archived") return "Archived";
  return "Resolved";
}

export type ConversationMessage = {
  senderId: number;
  createdAt: Date;
};

export function getConversationMetrics(
  messages: ConversationMessage[],
  buyerId: number
) {
  const firstBuyerMessage = messages.find(message => message.senderId === buyerId);
  const firstVendorMessage = messages.find(message => message.senderId !== buyerId);
  const responseTimeSeconds =
    firstBuyerMessage && firstVendorMessage
      ? Math.max(
          0,
          Math.round(
            (firstVendorMessage.createdAt.getTime() - firstBuyerMessage.createdAt.getTime()) /
              1000
          )
        )
      : null;
  return {
    lastMessageAt: messages.at(-1)?.createdAt || null,
    responseTimeSeconds,
  };
}

/** Describe whose response is currently pending without exposing workflow internals. */
export function getConversationState(
  status: InquiryStatus,
  messages: ConversationMessage[],
  buyerId: number,
  viewerId: number
): "open" | "awaiting_vendor" | "awaiting_buyer" | "resolved" | "archived" {
  if (status === "archived") return "archived";
  if (status === "closed") return "resolved";
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage) return "open";
  const viewerIsBuyer = viewerId === buyerId;
  const awaitingBuyer = lastMessage.senderId === buyerId;
  return viewerIsBuyer === awaitingBuyer ? "awaiting_vendor" : "awaiting_buyer";
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
