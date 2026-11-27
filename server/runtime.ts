import type { Server } from "node:http";

export function reportRuntimeError(component: string, error: unknown) {
  // Database/provider messages may contain addresses, queries or credentials.
  console.error(JSON.stringify({
    event: "runtime_error",
    component,
    errorType: error instanceof Error ? error.name : "UnknownError",
  }));
}

export function withDeadline<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Operation deadline exceeded")), timeoutMs);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

export function startSerialLoop(options: {
  task: (signal: AbortSignal) => Promise<void>;
  intervalMs: number;
  maxRunMs: number;
  onError: (error: unknown) => void;
}) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: Promise<void> | undefined;
  let lastSuccessAt = 0;
  let runningSince = 0;
  let failed = false;
  const run = () => {
    runningSince = Date.now();
    const report = (error: unknown) => {
      try { options.onError(error); } catch (reportError) { reportRuntimeError("job_error_reporter", reportError); }
    };
    const watchdog = setTimeout(() => {
      failed = true;
      report(new Error("Serial job deadline exceeded"));
    }, options.maxRunMs);
    watchdog.unref();
    active = Promise.resolve().then(() => options.task(controller.signal))
      .then(() => {
        lastSuccessAt = Date.now();
        failed = false;
      }, error => {
        failed = true;
        report(error);
      }).finally(() => {
        clearTimeout(watchdog);
        runningSince = 0;
        if (!controller.signal.aborted) {
          timer = setTimeout(run, options.intervalMs);
          timer.unref();
        }
      });
  };
  run();
  return {
    healthy(now = Date.now()) {
      return !controller.signal.aborted && !failed && lastSuccessAt > 0 &&
        now - lastSuccessAt <= options.intervalMs + options.maxRunMs &&
        (!runningSince || now - runningSince <= options.maxRunMs);
    },
    async stop() {
      controller.abort();
      clearTimeout(timer);
      await active;
    },
  };
}

export function installShutdown(options: {
  server?: Server;
  drain: () => Promise<void>;
  timeoutMs?: number;
  onStart?: () => void;
}) {
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    options.onStart?.();
    const deadline = setTimeout(() => {
      console.error(JSON.stringify({ event: "shutdown_deadline_exceeded" }));
      options.server?.closeAllConnections();
      process.exit(1);
    }, options.timeoutMs ?? 45_000);
    try {
      const closed = options.server ? new Promise<void>(resolve => {
        options.server!.close(() => resolve());
        options.server!.closeIdleConnections();
      }) : Promise.resolve();
      await Promise.all([closed, options.drain()]);
      clearTimeout(deadline);
      process.exit(0);
    } catch (error) {
      reportRuntimeError("shutdown", error);
      process.exit(1);
    }
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

export async function listenOnPort(server: Server, preferredPort: number, production: boolean) {
  if (!Number.isInteger(preferredPort) || preferredPort < 1 || preferredPort > 65535) {
    throw new Error("PORT must be an integer from 1 to 65535");
  }
  for (let port = preferredPort; port <= Math.min(preferredPort + (production ? 0 : 19), 65535); port++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => reject(error);
        server.once("error", onError);
        server.listen(port, () => {
          server.removeListener("error", onError);
          resolve();
        });
      });
      return port;
    } catch (error) {
      if (production || (error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error;
    }
  }
  throw new Error("No available development port");
}
