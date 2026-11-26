import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  user: null as any, evidence: null as any, read: vi.fn(),
}));
vi.mock("./jwtAuth", () => ({ authenticateFromRequest: async () => state.user }));
vi.mock("./db", () => ({ getDb: async () => ({
  select: () => ({ from: () => ({ where: async () => state.evidence ? [state.evidence] : [] }) }),
}) }));
vi.mock("./storage", async importOriginal => ({
  ...await importOriginal<typeof import("./storage")>(), storageGetObject: state.read,
}));
import { ENV } from "./_core/env";
import { evidenceDownloadUrl, verifyEvidenceToken } from "./privateEvidence";
import { registerStorageProxy } from "./_core/storageProxy";

describe("browser-reachable authenticated evidence downloads", () => {
  let server: Server;
  let origin: string;
  beforeAll(async () => {
    ENV.cookieSecret = "private-evidence-test-secret-at-least-32-characters";
    const app = express();
    registerStorageProxy(app);
    server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    vi.useRealTimers();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });
  beforeEach(() => {
    vi.clearAllMocks();
    state.user = { id: 7, role: "admin", emailVerifiedAt: new Date() };
    state.evidence = { id: 2, fileStoragePath: "private/verification/3/example.pdf", retentionExpiresAt: new Date(Date.now() + 60_000) };
    state.read.mockResolvedValue({
      ContentType: "application/pdf", ContentLength: 4,
      Body: { transformToByteArray: async () => Buffer.from("%PDF") },
    });
  });

  it("uses expiring user-bound links, never the internal Garage origin", async () => {
    const url = await evidenceDownloadUrl(2, 7);
    expect(url).toMatch(/^\/api\/private\/evidence\/2\?token=/);
    expect(url).not.toContain("garage");
    const token = new URL(url, origin).searchParams.get("token")!;
    expect(await verifyEvidenceToken(token, 2, 7)).toBe(true);
    expect(await verifyEvidenceToken(token, 2, 8)).toBe(false);
    expect(await verifyEvidenceToken(token, 3, 7)).toBe(false);
    expect(await verifyEvidenceToken(`${token}x`, 2, 7)).toBe(false);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 6 * 60_000);
    expect(await verifyEvidenceToken(token, 2, 7)).toBe(false);
    vi.useRealTimers();
  });

  it("downloads with restrictive attachment headers and a live admin session", async () => {
    const response = await fetch(origin + await evidenceDownloadUrl(2, 7));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="verification-evidence-2.pdf"');
    expect(await response.text()).toBe("%PDF");
    expect(state.read).toHaveBeenCalledOnce();
    expect(state.read).toHaveBeenCalledWith(state.evidence.fileStoragePath);
  });

  it("denies anonymous, non-admin, unverified and transferred token access", async () => {
    const url = origin + await evidenceDownloadUrl(2, 7);
    state.user = null;
    expect((await fetch(url)).status).toBe(401);
    state.user = { id: 7, role: "vendor", emailVerifiedAt: new Date() };
    expect((await fetch(url)).status).toBe(403);
    state.user = { id: 7, role: "admin", emailVerifiedAt: null };
    expect((await fetch(url)).status).toBe(403);
    state.user = { id: 8, role: "admin", emailVerifiedAt: new Date() };
    expect((await fetch(url)).status).toBe(403);
    expect(state.read).not.toHaveBeenCalled();
  });

  it("denies expired/missing evidence and private bucket enumeration", async () => {
    const url = origin + await evidenceDownloadUrl(2, 7);
    state.evidence.retentionExpiresAt = new Date(Date.now() - 1);
    expect((await fetch(url)).status).toBe(404);
    state.evidence = null;
    expect((await fetch(url)).status).toBe(404);
    expect((await fetch(`${origin}/media/private/verification/3/example.pdf`)).status).toBe(404);
    expect(state.read).not.toHaveBeenCalled();
  });

  it("handles object size and storage failures without leaking backend details", async () => {
    const url = origin + await evidenceDownloadUrl(2, 7);
    state.read.mockResolvedValueOnce({ ContentLength: 6 * 1024 * 1024, Body: {} });
    expect((await fetch(url)).status).toBe(413);
    state.read.mockRejectedValueOnce(Object.assign(new Error("Missing"), { name: "NoSuchKey" }));
    expect((await fetch(url)).status).toBe(404);
    state.read.mockRejectedValueOnce(new Error("internal storage credentials"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await fetch(url);
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("credentials");
    error.mockRestore();
  });
});
