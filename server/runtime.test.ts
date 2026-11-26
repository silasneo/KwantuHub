import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { listenOnPort, startSerialLoop, withDeadline } from "./runtime";

afterEach(() => vi.useRealTimers());

describe("serial runtime jobs", () => {
  it("runs immediately, never overlaps, and drains without scheduling another batch", async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const task = vi.fn((_signal: AbortSignal) => new Promise<void>(resolve => { finish = resolve; }));
    const loop = startSerialLoop({ task, intervalMs: 100, maxRunMs: 1000, onError: vi.fn() });
    await vi.advanceTimersByTimeAsync(500);
    expect(task).toHaveBeenCalledTimes(1);
    expect(loop.healthy()).toBe(false);
    let drained = false;
    const stopping = loop.stop().then(() => { drained = true; });
    expect(drained).toBe(false);
    expect(task.mock.calls[0][0].aborted).toBe(true);
    finish();
    await stopping;
    await vi.advanceTimersByTimeAsync(2000);
    expect(task).toHaveBeenCalledTimes(1);
  });

  describe("bounded process shutdown", () => {
    const runtimeModule = pathToFileURL(resolve("server", "runtime.ts")).href;
    const run = promisify(execFile);
    it("awaits a drain before exiting successfully", async () => {
      const { stdout } = await run(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
        import { installShutdown } from ${JSON.stringify(runtimeModule)};
        installShutdown({
          timeoutMs: 2000,
          drain: async () => {
            await new Promise(resolve => setTimeout(resolve, 30));
            console.log("drained");
          }
        });
        process.emit("SIGTERM");
      `], { timeout: 10_000 });
      expect(stdout).toContain("drained");
    });

    it("exits nonzero when an active job cannot drain within the budget", async () => {
      try {
        await run(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
          import { installShutdown } from ${JSON.stringify(runtimeModule)};
          installShutdown({ timeoutMs: 40, drain: () => new Promise(() => {}) });
          process.emit("SIGTERM");
        `], { timeout: 10_000 });
        throw new Error("Expected a nonzero shutdown");
      } catch (error) {
        expect(error).toMatchObject({ code: 1 });
        expect((error as { stderr: string }).stderr).toContain("shutdown_deadline_exceeded");
      }
    });
  });

  it("reports rejected jobs and recovers on the next serial run", async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const task = vi.fn().mockRejectedValueOnce(new Error("private provider detail")).mockResolvedValue(undefined);
    const loop = startSerialLoop({ task, intervalMs: 100, maxRunMs: 500, onError });
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(loop.healthy()).toBe(false);
    await vi.advanceTimersByTimeAsync(100);
    expect(loop.healthy()).toBe(true);
    await loop.stop();
    expect(loop.healthy()).toBe(false);
  });

  it("marks stalled jobs unhealthy without allowing overlapping retries", async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const task = vi.fn().mockResolvedValueOnce(undefined).mockImplementationOnce(
      () => new Promise<void>(resolve => { finish = resolve; })
    );
    const loop = startSerialLoop({ task, intervalMs: 100, maxRunMs: 500, onError: vi.fn() });
    await vi.advanceTimersByTimeAsync(50);
    expect(loop.healthy()).toBe(true);
    await vi.advanceTimersByTimeAsync(600);
    expect(loop.healthy()).toBe(false);
    expect(task).toHaveBeenCalledTimes(2);
    finish();
    await loop.stop();
  });

  it("bounds waiting and handles a later rejection", async () => {
    vi.useFakeTimers();
    let reject!: (error: Error) => void;
    const pending = new Promise<void>((_resolve, rejectPromise) => { reject = rejectPromise; });
    const result = expect(withDeadline(pending, 20)).rejects.toThrow("deadline");
    await vi.advanceTimersByTimeAsync(20);
    await result;
    reject(new Error("late error"));
    await vi.advanceTimersByTimeAsync(0);
  });
});

describe("production listener", () => {
  it("rejects an occupied configured port instead of selecting another port", async () => {
    const occupied = createServer();
    await new Promise<void>(resolve => occupied.listen(0, resolve));
    const address = occupied.address();
    if (!address || typeof address === "string") throw new Error("No test port");
    const app = createServer();
    try {
      await expect(listenOnPort(app, address.port, true)).rejects.toMatchObject({ code: "EADDRINUSE" });
      expect(app.listening).toBe(false);
    } finally {
      await new Promise<void>(resolve => occupied.close(() => resolve()));
    }
  });

  it.each([0, -1, 65536, NaN, 1.5])("rejects invalid port %s", async port => {
    await expect(listenOnPort(createServer(), port, true)).rejects.toThrow("PORT");
  });
});
