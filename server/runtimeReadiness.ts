import { sql } from "drizzle-orm";
import { readFile, mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { getDb } from "./db";
import { checkStorageConnection } from "./storage";
import { withDeadline } from "./runtime";

const HEARTBEAT_KEY = "runtime_notification_worker";
export const WORKER_STALE_MS = 120_000;
let draining = false;
export function markRuntimeDraining() { draining = true; }
export function isRuntimeLive() { return !draining; }

export function isWorkerFresh(value: { healthy: boolean; updatedAt: number } | undefined, now = Date.now()) {
  const age = value ? now - value.updatedAt : Infinity;
  return value?.healthy === true && Number.isFinite(age) && age >= -5_000 && age <= WORKER_STALE_MS;
}

function heartbeatPath() {
  return process.env.WORKER_HEARTBEAT_FILE || resolve("data", "runtime", `${HEARTBEAT_KEY}.json`);
}
export async function writeWorkerHeartbeat(healthy: boolean) {
  const path = heartbeatPath();
  await mkdir(dirname(path), { recursive: true });
  const next = `${path}.${process.pid}.next`;
  await writeFile(next, JSON.stringify({ healthy, updatedAt: Date.now() }), { mode: 0o600 });
  await rename(next, path);
}

export function createReadinessProbe(checks: Record<string, () => Promise<boolean>>) {
  const active = new Map<string, Promise<boolean>>();
  return async () => {
    const entries = await Promise.all(Object.entries(checks).map(async ([name, check]) => {
      let pending = active.get(name);
      if (!pending) {
        pending = Promise.resolve().then(check).catch(() => false);
        active.set(name, pending);
        void pending.finally(() => active.delete(name));
      }
      const ok = await withDeadline(pending, 2_000).catch(() => false);
      return [name, ok ? "ok" : "unavailable"] as const;
    }));
    const dependencies = Object.fromEntries(entries);
    return { ready: !draining && entries.every(([, status]) => status === "ok"), dependencies };
  };
}

export const checkRuntimeReadiness = createReadinessProbe({
  database: async () => {
    const db = await getDb();
    if (!db) return false;
    await db.execute(sql`SELECT 1`);
    return true;
  },
  storage: async () => { await checkStorageConnection(); return true; },
  worker: async () => {
    return isWorkerFresh(JSON.parse(await readFile(heartbeatPath(), "utf8")));
  },
  emailPolicy: async () => {
    const { loadDisposableDomains } = await import("./emailPolicy");
    await loadDisposableDomains();
    return true;
  },
});
