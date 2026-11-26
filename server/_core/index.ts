import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { registerApiDocs } from "../apiDocs";
import { getDb } from "../db";
import { startNotificationOutboxWorker } from "../notificationWorker";
import { registerSendPulseWebhook } from "../sendPulseWebhook";
import { registerDiditWebhook } from "../diditWebhook";
import { registerSeoEndpoints } from "../seoService";
import { apiV1Router, restErrorHandler } from "../apiV1Router";
import { assertServerConfiguration } from "./env";
import { installShutdown, listenOnPort, reportRuntimeError } from "../runtime";
import { markRuntimeDraining } from "../runtimeReadiness";

async function startServer() {
  assertServerConfiguration();
  const app = express();
  const trustedProxies = (process.env.TRUST_PROXY || "").split(",").map(value => value.trim()).filter(Boolean);
  if (trustedProxies.length) app.set("trust proxy", trustedProxies);
  const server = createServer(app);
  registerSendPulseWebhook(app);
  registerDiditWebhook(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "8mb" }));
  app.use(express.urlencoded({ limit: "8mb", extended: true }));
  registerStorageProxy(app);
  // User, vendor, and admin authentication is handled exclusively by JWT cookies.
  registerApiDocs(app);
  registerSeoEndpoints(app);
  app.use("/api/v1", apiV1Router);
  app.use("/api/v1", restErrorHandler);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = Number(process.env.PORT || "3000");
  const port = await listenOnPort(server, preferredPort, process.env.NODE_ENV === "production");

  const db = await getDb();
  let stopWorker: (() => Promise<void>) | undefined;
  if (db && process.env.ENABLE_NOTIFICATION_WORKER !== "false") {
    stopWorker = startNotificationOutboxWorker(db);
    console.log("Notification outbox worker started");
  }

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  installShutdown({
    server,
    onStart: markRuntimeDraining,
    drain: async () => { await stopWorker?.(); },
  });
  console.log(`Server running on http://localhost:${port}/`);
}

startServer().catch(error => {
  reportRuntimeError("server_startup", error);
  process.exit(1);
});
