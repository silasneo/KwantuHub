import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("./db", () => ({ getDb: vi.fn() }));
vi.mock("./storage", () => ({ checkStorageConnection: vi.fn() }));
import { createReadinessProbe, isWorkerFresh, WORKER_STALE_MS } from "./runtimeReadiness";

afterEach(() => vi.useRealTimers());

describe("runtime readiness", () => {
  it("exposes only bounded non-sensitive dependency states", async () => {
    const probe = createReadinessProbe({
      database: async () => true,
      storage: async () => { throw new Error("secret endpoint/credential"); },
    });
    expect(await probe()).toEqual({
      ready: false, dependencies: { database: "ok", storage: "unavailable" },
    });
  });

  it("times out and reuses stalled checks rather than accumulating probes", async () => {
    vi.useFakeTimers();
    const check = vi.fn(() => new Promise<boolean>(() => undefined));
    const probe = createReadinessProbe({ storage: check });
    const first = probe();
    await vi.advanceTimersByTimeAsync(2000);
    expect((await first).ready).toBe(false);
    const second = probe();
    await vi.advanceTimersByTimeAsync(2000);
    expect((await second).ready).toBe(false);
    expect(check).toHaveBeenCalledTimes(1);
  });

  it("requires a recent successful worker heartbeat and rejects malformed or future data", () => {
    const now = Date.now();
    expect(isWorkerFresh({ healthy: true, updatedAt: now }, now)).toBe(true);
    expect(isWorkerFresh({ healthy: true, updatedAt: now - WORKER_STALE_MS - 1 }, now)).toBe(false);
    expect(isWorkerFresh({ healthy: false, updatedAt: now }, now)).toBe(false);
    expect(isWorkerFresh({ healthy: true, updatedAt: now + 60_000 }, now)).toBe(false);
    expect(isWorkerFresh({ healthy: true, updatedAt: NaN }, now)).toBe(false);
    expect(isWorkerFresh(undefined, now)).toBe(false);
  });
});
