import type { Express } from "express";
import { normalizeStorageKey, storageGetObject } from "../storage";
import { authenticateFromRequest } from "../jwtAuth";
import { verifyEvidenceToken } from "../privateEvidence";
import { getDb } from "../db";
import { vendorVerificationEvidence } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export function registerStorageProxy(app: Express) {
  app.get("/api/private/evidence/:id", async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    const id = Number(req.params.id);
    try {
      const user = await authenticateFromRequest(req);
      if (!user) { res.status(401).send("Sign in to download evidence"); return; }
      if (user.role !== "admin" || !user.emailVerifiedAt || !Number.isSafeInteger(id) || id < 1 ||
        typeof req.query.token !== "string" || !(await verifyEvidenceToken(req.query.token, id, user.id))) {
        res.status(403).send("Evidence access denied or link expired"); return;
      }
      const db = await getDb();
      if (!db) { res.status(503).send("Evidence service unavailable"); return; }
      const [evidence] = await db.select().from(vendorVerificationEvidence).where(eq(vendorVerificationEvidence.id, id));
      if (!evidence || evidence.deletedAt || !evidence.retentionExpiresAt || evidence.retentionExpiresAt <= new Date() || !evidence.fileStoragePath.startsWith("private/verification/")) {
        res.status(404).send("Evidence not available"); return;
      }
      const object = await storageGetObject(evidence.fileStoragePath);
      if (!object.Body) { res.status(404).send("Evidence not available"); return; }
      if (!object.ContentLength || object.ContentLength > 5 * 1024 * 1024) {
        res.status(413).send("Evidence object is too large"); return;
      }
      const extension = object.ContentType === "application/pdf" ? "pdf" : object.ContentType === "image/png" ? "png" : object.ContentType === "image/jpeg" ? "jpg" : "bin";
      res.type("application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="verification-evidence-${id}.${extension}"`);
      res.setHeader("Content-Length", object.ContentLength);
      res.end(Buffer.from(await object.Body.transformToByteArray()));
    } catch (error) {
      if (["NoSuchKey", "NotFound"].includes((error as { name?: string }).name ?? "")) {
        res.status(404).send("Evidence not available"); return;
      }
      console.error("[Storage] Private evidence download failed", error);
      res.status(502).send("Evidence storage unavailable. Retry later.");
    }
  });

  app.get("/media/*", async (req, res) => {
    let key: string;
    try {
      key = normalizeStorageKey((req.params as Record<string, string>)[0] || "");
    } catch {
      res.status(404).send("Media not found");
      return;
    }

    if (!key.startsWith("public/")) {
      res.status(404).send("Media not found");
      return;
    }

    try {
      const object = await storageGetObject(key);
      if (!object.Body) {
        res.status(404).send("Media not found");
        return;
      }
      if (object.ContentLength !== undefined && object.ContentLength > 20 * 1024 * 1024) {
        res.status(413).send("Media object is too large");
        return;
      }
      if (object.ContentType) res.type(object.ContentType);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
      res.setHeader(
        "Cache-Control",
        object.CacheControl || "public, max-age=3600"
      );
      if (object.ETag) res.setHeader("ETag", object.ETag);
      if (object.ContentLength !== undefined) {
        res.setHeader("Content-Length", object.ContentLength);
      }
      const bytes = await object.Body.transformToByteArray();
      res.end(Buffer.from(bytes));
    } catch (error) {
      if ((error as { name?: string }).name === "NoSuchKey") {
        res.status(404).send("Media not found");
        return;
      }
      console.error("[Storage] Public media read failed:", error);
      res.status(502).send("Storage backend unavailable");
    }
  });
}
