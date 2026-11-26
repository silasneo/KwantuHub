import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { startNotificationOutboxWorker } from "./notificationWorker";
import { assertRuntimeConfiguration } from "./_core/env";
import { createServer } from "node:http";
import { installShutdown, listenOnPort, reportRuntimeError, withDeadline } from "./runtime";
import { isRuntimeLive, markRuntimeDraining } from "./runtimeReadiness";

async function startWorker() {
  assertRuntimeConfiguration();
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is required to start the notification worker");
  await withDeadline(db.execute(sql`SELECT 1`), 5_000);

  const stopWorker = startNotificationOutboxWorker(db);
  const healthServer = createServer((req, res) => {
    if (req.url !== "/live" && req.url !== "/ready") {
      res.writeHead(404).end();
      return;
    }
    const healthy = isRuntimeLive() && (req.url === "/live" || stopWorker.healthy());
    res.writeHead(healthy ? 200 : 503, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify({ status: healthy ? "ok" : "unavailable" }));
  });
  await listenOnPort(healthServer, Number(process.env.WORKER_HEALTH_PORT || "3001"), true);
  installShutdown({ server: healthServer, onStart: markRuntimeDraining, drain: stopWorker });
  console.log("Notification outbox worker started");
}

startWorker().catch(error => {
  reportRuntimeError("worker_startup", error);
  process.exit(1);
});
