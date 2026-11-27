import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { authSessions, moderationRecords, users } from "../drizzle/schema";
import { z } from "zod";

export function parseAdminProvisioningArgs(args: string[]) {
  if (
    args.length !== 4 ||
    args[0] !== "--email" ||
    args[2] !== "--confirm-email"
  ) {
    throw new Error(
      "Usage: provision-admin --email ADDRESS --confirm-email ADDRESS"
    );
  }
  const email = z.string().email().max(320).parse(args[1].trim().toLowerCase());
  if (args[3].trim().toLowerCase() !== email)
    throw new Error("Email confirmation does not match");
  return email;
}

export function assertProvisionableAccount(
  user:
    | {
        role: string;
        status: string;
        emailVerifiedAt: Date | null;
        passwordHash: string | null;
      }
    | undefined
) {
  if (
    !user ||
    user.status !== "active" ||
    !user.emailVerifiedAt ||
    !user.passwordHash
  ) {
    throw new Error(
      "Administrator must be an existing active, email-verified password account"
    );
  }
  if (user.role !== "buyer" && user.role !== "admin") {
    throw new Error(
      "Vendor accounts cannot be converted to administrator accounts"
    );
  }
}

export async function provisionAdministrator(
  db: ReturnType<typeof drizzle>,
  email: string
) {
  return db.transaction(async tx => {
    const [user] = await tx
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1)
      .for("update");
    assertProvisionableAccount(user);
    if (user.role === "admin") return { userId: user.id, changed: false };
    await tx
      .update(users)
      .set({ role: "admin" })
      .where(and(eq(users.id, user.id), eq(users.role, "buyer")));
    await tx.delete(authSessions).where(eq(authSessions.userId, user.id));
    await tx
      .insert(moderationRecords)
      .values({
        entityType: "account",
        entityId: String(user.id),
        actorId: user.id,
        action: "administrator_granted",
        reason:
          "Explicit database-operator provisioning command with matching email confirmation; actor is the target account, not a web session.",
      });
    return { userId: user.id, changed: true };
  });
}

export async function revokeAdministrator(
  db: ReturnType<typeof drizzle>,
  email: string
) {
  return db.transaction(async tx => {
    const admins = await tx
      .select()
      .from(users)
      .where(eq(users.role, "admin"))
      .orderBy(users.id)
      .for("update");
    const user = admins.find(account => account.email === email);
    if (!user)
      throw new Error("An existing administrator account is required.");
    if (
      !admins.some(
        account =>
          account.id !== user.id &&
          account.status === "active" &&
          account.emailVerifiedAt
      )
    ) {
      throw new Error(
        "Cannot revoke the last active, email-verified administrator."
      );
    }
    await tx.update(users).set({ role: "buyer" }).where(eq(users.id, user.id));
    await tx.delete(authSessions).where(eq(authSessions.userId, user.id));
    await tx
      .insert(moderationRecords)
      .values({
        entityType: "account",
        entityId: String(user.id),
        actorId: user.id,
        action: "administrator_revoked",
        reason:
          "Explicit database-operator revocation command with matching email confirmation; actor is the target account, not a web session.",
      });
    return { userId: user.id, changed: true };
  });
}
