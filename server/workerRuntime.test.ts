import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("./registration", () => ({ purgeExpiredRegistrations: vi.fn(async () => 0) }));
vi.mock("./runtimeReadiness", () => ({ writeWorkerHeartbeat: vi.fn(async () => undefined) }));
vi.mock("./savedSearchService", () => ({ runSavedSearchAlertSweep: vi.fn(async () => ({ matched: 0, immediate: 0, digests: 0 })) }));
vi.mock("./webhookReconciliation", () => ({ reconcilePendingWebhookEvents: vi.fn(async () => ({ checked: 0 })) }));
import { startNotificationOutboxWorker } from "./notificationWorker";
import { writeWorkerHeartbeat } from "./runtimeReadiness";
import { purgeExpiredRegistrations } from "./registration";

function emptyDatabase() {
  const claim = vi.fn(async () => [{ affectedRows: 0 }]);
  const selects = {
    from: () => selects,
    where: () => selects,
    orderBy: () => selects,
    limit: vi.fn(async () => []),
  };
  const deletion = { where: () => deletion, limit: vi.fn(async (_limit: number) => [{ affectedRows: 0 }]) };
  const db = {
    update: () => ({ set: () => ({ where: claim }) }),
    select: () => selects,
    delete: () => deletion,
  } as unknown as Parameters<typeof startNotificationOutboxWorker>[0];
  return { db, claim, deletion };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("notification runtime integration", () => {
  it("keeps empty-registration cleanup healthy between five-minute runs while refreshing heartbeat every delivery tick", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-25T12:00:00Z"));
    const { db } = emptyDatabase();
    const stop = startNotificationOutboxWorker(db);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(purgeExpiredRegistrations).toHaveBeenCalledTimes(1);
    expect(await vi.mocked(purgeExpiredRegistrations).mock.results[0].value).toBe(0);
    expect(stop.healthy()).toBe(true);
    expect(writeWorkerHeartbeat).toHaveBeenLastCalledWith(true);

    await vi.advanceTimersByTimeAsync(120_000);
    expect(purgeExpiredRegistrations).toHaveBeenCalledTimes(1);
    expect(stop.healthy()).toBe(true);
    expect(writeWorkerHeartbeat).toHaveBeenLastCalledWith(true);
    const heartbeatsAfter135Seconds = vi.mocked(writeWorkerHeartbeat).mock.calls.length;

    await vi.advanceTimersByTimeAsync(150_000);
    expect(purgeExpiredRegistrations).toHaveBeenCalledTimes(1);
    expect(stop.healthy()).toBe(true);
    expect(writeWorkerHeartbeat).toHaveBeenLastCalledWith(true);
    expect(vi.mocked(writeWorkerHeartbeat).mock.calls.length).toBeGreaterThan(heartbeatsAfter135Seconds);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(purgeExpiredRegistrations).toHaveBeenCalledTimes(2);
    expect(stop.healthy()).toBe(true);
    expect(writeWorkerHeartbeat).toHaveBeenLastCalledWith(true);
    await stop();
  });

  it("runs bounded retention and registration cleanup, then drains and invalidates its heartbeat", async () => {
    vi.useFakeTimers();
    const { db, claim, deletion } = emptyDatabase();
    const heartbeat = vi.fn(async () => undefined);
    const stop = startNotificationOutboxWorker(db, { onHeartbeat: heartbeat });
    await vi.advanceTimersByTimeAsync(0);
    expect(claim).toHaveBeenCalledTimes(1);
    expect(deletion.limit.mock.calls.every(([limit]) => limit === 500)).toBe(true);
    expect(purgeExpiredRegistrations).toHaveBeenCalledTimes(1);
    expect(stop.healthy()).toBe(true);
    await stop();
    expect(writeWorkerHeartbeat).toHaveBeenLastCalledWith(false);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(claim).toHaveBeenCalledTimes(1);
    expect(stop.healthy()).toBe(false);
  });

  it("catches database failures, reports only a safe error type, and retries serially", async () => {
    vi.useFakeTimers();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { db, claim } = emptyDatabase();
    claim.mockRejectedValueOnce(new Error("mysql://private-credential"));
    const stop = startNotificationOutboxWorker(db, { onHeartbeat: async () => undefined });
    await vi.advanceTimersByTimeAsync(0);
    expect(log).toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain("private-credential");
    expect(stop.healthy()).toBe(false);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(claim).toHaveBeenCalledTimes(2);
    expect(stop.healthy()).toBe(true);
    await stop();
  });

  it("does not overlap a stalled batch and waits for active work during stop", async () => {
    vi.useFakeTimers();
    const { db, claim } = emptyDatabase();
    let release!: (value: { affectedRows: number }[]) => void;
    claim.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const stop = startNotificationOutboxWorker(db, { onHeartbeat: async () => undefined });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(claim).toHaveBeenCalledTimes(1);
    let drained = false;
    const stopped = stop().then(() => { drained = true; });
    expect(drained).toBe(false);
    release([{ affectedRows: 0 }]);
    await stopped;
    expect(drained).toBe(true);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(claim).toHaveBeenCalledTimes(1);
  });
});
