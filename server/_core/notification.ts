import { TRPCError } from "@trpc/server";

export type NotificationPayload = {
  title: string;
  content: string;
};

/** Compatibility endpoint: owner notifications were a template-only Forge service. */
export async function notifyOwner(
  _payload: NotificationPayload
): Promise<boolean> {
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message:
      "Owner notifications are not supported. Use the marketplace notification inbox.",
  });
}
