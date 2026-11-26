import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";
import { and, eq } from "drizzle-orm";
import {
  notificationDeliveries,
  notificationOutbox,
  notifications,
  notificationWebhookEvents,
  systemSettings,
  users,
  vendorProfiles,
  vendorVerificationSessions,
  vendorVerificationDecisions,
  moderationRecords,
} from "../drizzle/schema";

const testUrl = process.env.DELIVERY_TEST_DATABASE_URL;

describe.skipIf(!testUrl)("delivery reliability with isolated MySQL", () => {
  let pool: mysql.Pool;
  let db: any;
  let worker: typeof import("./notificationWorker");
  let sendPulse: typeof import("./sendPulseWebhook");
  let didit: typeof import("./diditWebhook");
  let reconcile: typeof import("./webhookReconciliation").reconcilePendingWebhookEvents;
  let SendPulseSendError: typeof import("./sendPulseAdapter").SendPulseSendError;

  beforeAll(async () => {
    if (!testUrl || !new URL(testUrl).pathname.endsWith("_delivery_test")) {
      throw new Error(
        "DELIVERY_TEST_DATABASE_URL must select a dedicated database ending in _delivery_test."
      );
    }
    process.env.DATABASE_URL = testUrl;
    pool = mysql.createPool(testUrl);
    db = drizzle(pool);
    await migrate(db, { migrationsFolder: "drizzle" });
    worker = await import("./notificationWorker");
    sendPulse = await import("./sendPulseWebhook");
    didit = await import("./diditWebhook");
    ({ reconcilePendingWebhookEvents: reconcile } = await import(
      "./webhookReconciliation"
    ));
    ({ SendPulseSendError } = await import("./sendPulseAdapter"));
  }, 60_000);

  afterAll(async () => {
    didit?.setDiditDecisionRecorder(null);
    await pool?.end();
  });

  async function createUser() {
    const [result] = await db
      .insert(users)
      .values({
        openId: `delivery-${randomUUID()}`,
        name: "Delivery Test",
        email: `${randomUUID()}@example.test`,
      });
    return result.insertId as number;
  }

  async function enqueue(userId: number) {
    const idempotencyKey = `delivery-test:${randomUUID()}`;
    await worker.enqueueNotificationEvent(db, {
      eventType: "INQUIRY_CREATED",
      idempotencyKey,
      recipientUserId: userId,
      entityType: "inquiry",
      entityId: 1,
      payload: { subject: "Hello", actionUrl: "/dashboard" },
    });
    const [row] = await db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.idempotencyKey, idempotencyKey));
    return row as typeof notificationOutbox.$inferSelect;
  }

  function fakeAdapter(
    send: (
      ...args: any[]
    ) => Promise<{ providerMessageId: string | null; accepted: boolean }>
  ) {
    return {
      provider: "sendpulse",
      isConfigured: () => true,
      send: vi.fn(send),
    } as any;
  }

  const runFor = (
    row: { id: number },
    adapter: unknown,
    extra: Record<string, unknown> = {}
  ) =>
    worker.processNotificationOutboxBatch(db, {
      emailAdapter: adapter as any,
      limit: 50,
      ...extra,
    });
  const outbox = async (id: number) =>
    (
      await db
        .select()
        .from(notificationOutbox)
        .where(eq(notificationOutbox.id, id))
    )[0];
  const delivery = async (id: number) =>
    (
      await db
        .select()
        .from(notificationDeliveries)
        .where(
          and(
            eq(notificationDeliveries.outboxId, id),
            eq(notificationDeliveries.channel, "email")
          )
        )
    )[0];

  it("defers while paused without burning attempts, then resumes without duplicating in-app notifications", async () => {
    const userId = await createUser();
    const row = await enqueue(userId);
    await db
      .insert(systemSettings)
      .values({ settingKey: "email_delivery_paused", booleanValue: true })
      .onDuplicateKeyUpdate({ set: { booleanValue: true } });
    const adapter = fakeAdapter(async () => ({
      providerMessageId: `msg-${randomUUID()}`,
      accepted: true,
    }));
    try {
      expect((await runFor(row, adapter)).deferred).toBeGreaterThanOrEqual(1);
      const paused = await outbox(row.id);
      expect(paused).toMatchObject({ status: "queued", attempts: 0 });
      expect(paused.availableAt.getTime()).toBeGreaterThan(Date.now());
      expect((await delivery(row.id)).failureCode).toBe("delivery_paused");
    } finally {
      await db
        .update(systemSettings)
        .set({ booleanValue: false })
        .where(eq(systemSettings.settingKey, "email_delivery_paused"));
    }
    await runFor(row, adapter, { now: new Date(Date.now() + 120_000) });
    expect((await outbox(row.id)).status).toBe("completed");
    expect((await delivery(row.id)).status).toBe("sent");
    expect(adapter.send).toHaveBeenCalledTimes(1);
    const inApp = await db
      .select()
      .from(notifications)
      .where(eq(notifications.recipientUserId, userId));
    expect(inApp).toHaveLength(1);
  });

  it("does not send twice when a lease expires while the original send is still running", async () => {
    const userId = await createUser();
    const row = await enqueue(userId);
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const adapter = fakeAdapter(async () => {
      await gate;
      return { providerMessageId: `msg-${randomUUID()}`, accepted: true };
    });
    const first = runFor(row, adapter);
    await vi.waitFor(() => expect(adapter.send).toHaveBeenCalledTimes(1), {
      timeout: 5_000,
    });
    await db
      .update(notificationOutbox)
      .set({ leaseExpiresAt: new Date(Date.now() - 1_000) })
      .where(eq(notificationOutbox.id, row.id));
    try {
      const second = await runFor(row, adapter);
      expect(second.reclaimed).toBeGreaterThanOrEqual(1);
      expect(second.deferred).toBeGreaterThanOrEqual(1);
    } finally {
      release();
    }
    expect((await first).leasesLost).toBe(1);
    expect((await delivery(row.id)).status).toBe("sent");
    await runFor(row, adapter, { now: new Date(Date.now() + 10 * 60_000) });
    expect((await outbox(row.id)).status).toBe("completed");
    expect(adapter.send).toHaveBeenCalledTimes(1);
  });

  it("requires manual reconciliation instead of resending an ambiguous provider outcome", async () => {
    const row = await enqueue(await createUser());
    const adapter = fakeAdapter(async () => {
      throw new SendPulseSendError("SendPulse request timed out", "ambiguous");
    });
    expect(
      (await runFor(row, adapter)).needsReconciliation
    ).toBeGreaterThanOrEqual(1);
    const dead = await outbox(row.id);
    expect(dead.status).toBe("dead");
    expect(dead.lastError).toMatch(/^MANUAL_RECONCILIATION_REQUIRED:/);
    expect((await delivery(row.id)).failureCode).toBe("send_outcome_unknown");
    await db
      .update(notificationOutbox)
      .set({ status: "failed", availableAt: new Date(Date.now() - 1_000) })
      .where(eq(notificationOutbox.id, row.id));
    await runFor(row, adapter);
    expect(adapter.send).toHaveBeenCalledTimes(1);
    expect((await outbox(row.id)).status).toBe("dead");
  });

  it("retries a provider rejection and sends once it is accepted", async () => {
    const row = await enqueue(await createUser());
    const adapter = fakeAdapter(async () => ({
      providerMessageId: null,
      accepted: false,
    }));
    await runFor(row, adapter);
    expect(await outbox(row.id)).toMatchObject({ status: "failed" });
    expect((await delivery(row.id)).failureCode).toBe("provider_rejected");
    adapter.send.mockImplementation(async () => ({
      providerMessageId: `msg-${randomUUID()}`,
      accepted: true,
    }));
    await runFor(row, adapter, { now: new Date(Date.now() + 10 * 60_000) });
    expect((await delivery(row.id)).status).toBe("sent");
    expect(adapter.send).toHaveBeenCalledTimes(2);
  });

  it("keeps early SendPulse callbacks retryable and applies them once correlated", async () => {
    const row = await enqueue(await createUser());
    const messageId = `early-${randomUUID()}`;
    const parsed = sendPulse.parseSendPulseEvent({
      event_id: `evt-${randomUUID()}`,
      event: "delivered",
      message_id: messageId,
      timestamp: Math.floor(Date.now() / 1000),
    });
    expect(await sendPulse.receiveSendPulseEvent(db, parsed)).toBe("pending");
    const [event] = await db
      .select()
      .from(notificationWebhookEvents)
      .where(
        and(
          eq(notificationWebhookEvents.provider, "sendpulse"),
          eq(notificationWebhookEvents.providerEventId, parsed.providerEventId)
        )
      );
    expect(event).toMatchObject({
      processingStatus: "failed",
      lastError: sendPulse.AWAITING_DELIVERY,
    });

    const adapter = fakeAdapter(async () => ({
      providerMessageId: messageId,
      accepted: true,
    }));
    await runFor(row, adapter);
    expect((await delivery(row.id)).status).toBe("sent");
    const result = await reconcile(db, {
      now: new Date(Date.now() + 10 * 60_000),
      limit: 500,
    });
    expect(result.processed).toBeGreaterThanOrEqual(1);
    expect((await delivery(row.id)).status).toBe("delivered");
    expect(await sendPulse.receiveSendPulseEvent(db, parsed)).toBe("duplicate");
  });

  it("stores early Didit callbacks encrypted, replays them, and records per-check evidence monotonically", async () => {
    const userId = await createUser();
    const [vendor] = await db
      .insert(vendorProfiles)
      .values({
        userId,
        businessName: "Didit Shop",
        contactEmail: "shop@example.test",
      });
    const providerSessionId = `didit-${randomUUID()}`;
    const now = Math.floor(Date.now() / 1000);
    const approved = {
      event_id: `didit-evt-${randomUUID()}`,
      session_id: providerSessionId,
      status: "Approved",
      timestamp: now,
      decision: { id_verification: { status: "Approved", first_name: "A" } },
    };
    expect(await didit.applyDiditEvent(approved, "v2", { db })).toMatchObject({
      status: "deferred",
    });
    const scope = and(
      eq(notificationWebhookEvents.provider, "didit"),
      eq(notificationWebhookEvents.providerEventId, approved.event_id)
    );
    const [stored] = await db
      .select()
      .from(notificationWebhookEvents)
      .where(scope);
    expect(stored.processingStatus).toBe("failed");
    expect(JSON.stringify(stored.payload)).not.toContain("first_name");

    await db.insert(vendorVerificationSessions).values({
      vendorId: vendor.insertId,
      userId,
      provider: "didit",
      providerSessionId,
      sessionType: "combined_na_vendor",
      status: "submitted",
    });
    const recorded: unknown[] = [];
    didit.setDiditDecisionRecorder(async (_tx, input) => {
      recorded.push(input);
    });
    await reconcile(db, {
      now: new Date(Date.now() + 10 * 60_000),
      limit: 500,
    });
    const [processed] = await db
      .select()
      .from(notificationWebhookEvents)
      .where(scope);
    expect(processed.processingStatus).toBe("processed");
    expect(JSON.stringify(processed.payload)).not.toContain("encryptedPayload");
    const [session] = await db
      .select()
      .from(vendorVerificationSessions)
      .where(
        eq(vendorVerificationSessions.providerSessionId, providerSessionId)
      );
    expect(session.status).toBe("approved");
    expect(session.metadata).toMatchObject({
      providerStatus: "approved",
      checkOutcomes: [{ checkType: "identity", outcome: "verified" }],
    });
    expect(recorded).toEqual([
      expect.objectContaining({
        decisions: [
          expect.objectContaining({
            checkType: "identity",
            outcome: "verified",
          }),
        ],
      }),
    ]);
    const [profile] = await db
      .select()
      .from(vendorProfiles)
      .where(eq(vendorProfiles.id, vendor.insertId));
    expect(profile.identityStatus).toBe("verified");
    expect(profile.residenceStatus).not.toBe("verified");

    const older = {
      event_id: `didit-evt-${randomUUID()}`,
      session_id: providerSessionId,
      status: "In Review",
      timestamp: now - 60,
    };
    expect(await didit.applyDiditEvent(older, "v2", { db })).toMatchObject({
      status: "ignored",
    });
    const [after] = await db
      .select()
      .from(vendorVerificationSessions)
      .where(eq(vendorVerificationSessions.id, session.id));
    expect(after.status).toBe("approved");
    expect(await didit.applyDiditEvent(approved, "v2", { db })).toMatchObject({
      status: "duplicate",
    });
  });

  it("resumes after provider configuration is restored without consuming deferral attempts", async () => {
    const row = await enqueue(await createUser());
    const adapter = fakeAdapter(async () => ({
      providerMessageId: `msg-${randomUUID()}`,
      accepted: true,
    }));
    adapter.isConfigured = () => false;
    await runFor(row, adapter);
    expect(await outbox(row.id)).toMatchObject({
      status: "queued",
      attempts: 0,
    });
    expect(adapter.send).not.toHaveBeenCalled();
    adapter.isConfigured = () => true;
    await runFor(row, adapter, { now: new Date(Date.now() + 120_000) });
    expect((await outbox(row.id)).status).toBe("completed");
    expect(adapter.send).toHaveBeenCalledTimes(1);
  });

  it("requires audited provider reconciliation before an administrator can retry an uncertain send", async () => {
    const { recoverNotificationDelivery } = await import(
      "./notificationRecovery"
    );
    const actorId = await createUser();
    const row = await enqueue(await createUser());
    const adapter = fakeAdapter(async () => {
      throw new SendPulseSendError("Unknown provider result", "ambiguous");
    });
    await runFor(row, adapter);
    const item = await delivery(row.id);
    await expect(
      recoverNotificationDelivery(db, actorId, item.id)
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await db
      .update(notificationDeliveries)
      .set({ failureCode: "send_in_progress" })
      .where(eq(notificationDeliveries.id, item.id));
    await expect(
      recoverNotificationDelivery(db, actorId, item.id, {
        outcome: "not_sent",
        notes: "Checked provider",
      })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await db
      .update(notificationDeliveries)
      .set({ failureCode: "send_outcome_unknown" })
      .where(eq(notificationDeliveries.id, item.id));
    await recoverNotificationDelivery(db, actorId, item.id, {
      outcome: "not_sent",
      notes: "Confirmed provider has no accepted request.",
    });
    adapter.send.mockImplementation(async () => ({
      providerMessageId: `msg-${randomUUID()}`,
      accepted: true,
    }));
    await runFor(row, adapter, { now: new Date(Date.now() + 2_000) });
    expect(adapter.send).toHaveBeenCalledTimes(2);
    expect((await delivery(row.id)).status).toBe("sent");
    expect(
      await db
        .select()
        .from(moderationRecords)
        .where(eq(moderationRecords.entityId, String(item.id)))
    ).toMatchObject([
      expect.objectContaining({ action: "delivery_confirmed_not_sent" }),
    ]);
    await expect(
      recoverNotificationDelivery(db, actorId, item.id)
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("records a confirmed provider send without resending the uncertain delivery", async () => {
    const { recoverNotificationDelivery } = await import(
      "./notificationRecovery"
    );
    const actorId = await createUser();
    const row = await enqueue(await createUser());
    const adapter = fakeAdapter(async () => {
      throw new SendPulseSendError("Unknown provider result", "ambiguous");
    });
    await runFor(row, adapter);
    const item = await delivery(row.id);
    const reconciliation = {
      outcome: "sent" as const,
      notes: "Confirmed accepted request in the provider dashboard.",
    };
    await expect(
      recoverNotificationDelivery(db, actorId, item.id, reconciliation)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const providerMessageId = `confirmed-${randomUUID()}`;
    await recoverNotificationDelivery(db, actorId, item.id, {
      ...reconciliation,
      providerMessageId,
    });
    await runFor(row, adapter, { now: new Date(Date.now() + 120_000) });
    expect(adapter.send).toHaveBeenCalledTimes(1);
    expect(await delivery(row.id)).toMatchObject({
      status: "sent",
      providerMessageId,
      failureCode: null,
    });
    expect((await outbox(row.id)).status).toBe("completed");
    expect(
      await db
        .select()
        .from(moderationRecords)
        .where(eq(moderationRecords.entityId, String(item.id)))
    ).toMatchObject([
      expect.objectContaining({ action: "delivery_confirmed_sent", actorId }),
    ]);
  });

  it("keeps append-only provider decisions while older sessions cannot overwrite newer checks", async () => {
    didit.setDiditDecisionRecorder(null);
    const userId = await createUser();
    const [vendor] = await db
      .insert(vendorProfiles)
      .values({ userId, businessName: "Ordered provider fixture" });
    const insertSession = async () => {
      const providerSessionId = randomUUID();
      const [result] = await db.insert(vendorVerificationSessions).values({
        userId,
        vendorId: vendor.insertId,
        provider: "didit",
        providerSessionId,
        sessionType: "identity_document",
        status: "created",
        countryCode: "CA",
        expiresAt: new Date(Date.now() + 86_400_000),
      });
      return { id: result.insertId, providerSessionId };
    };
    const older = await insertSession();
    const current = await insertSession();
    const eventAt = Math.floor(Date.now() / 1000);
    const event = (sessionId: string, status: string, timestamp = eventAt) => ({
      event_id: randomUUID(),
      session_id: sessionId,
      status,
      timestamp,
      decision: { id_verification: { status } },
    });
    await didit.applyDiditEvent(
      event(older.providerSessionId, "Approved"),
      "v2",
      { db }
    );
    expect(
      (
        await db
          .select()
          .from(vendorProfiles)
          .where(eq(vendorProfiles.id, vendor.insertId))
      )[0].identityStatus
    ).toBe("unverified");
    await didit.applyDiditEvent(
      event(current.providerSessionId, "Approved"),
      "v2",
      { db }
    );
    expect(
      (
        await db
          .select()
          .from(vendorProfiles)
          .where(eq(vendorProfiles.id, vendor.insertId))
      )[0]
    ).toMatchObject({
      identityStatus: "verified",
      identityVerificationSessionId: current.id,
    });
    await didit.applyDiditEvent(
      event(current.providerSessionId, "Declined", eventAt + 1),
      "v2",
      { db }
    );
    expect(
      (
        await db
          .select()
          .from(vendorProfiles)
          .where(eq(vendorProfiles.id, vendor.insertId))
      )[0].identityStatus
    ).toBe("rejected");
    expect(
      await db
        .select()
        .from(vendorVerificationDecisions)
        .where(eq(vendorVerificationDecisions.sessionId, current.id))
    ).toHaveLength(2);
  });
});
