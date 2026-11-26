import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  procedure: vi.fn(),
  badges: vi.fn(),
  rows: [] as unknown[],
  getDb: vi.fn(),
}));
vi.mock("./routers", () => ({
  appRouter: {
    createCaller: () =>
      new Proxy(
        {},
        { get: () => new Proxy({}, { get: () => mocks.procedure }) }
      ),
  },
}));
vi.mock("./_core/context", () => ({ createContext: mocks.context }));
vi.mock("./db", () => ({
  getDb: mocks.getDb,
  getVendorProfileByUserId: vi.fn().mockResolvedValue(null),
}));
vi.mock("./vendorTrust", () => ({ getVendorVerificationBadges: mocks.badges }));
vi.mock("./storage", () => ({
  getPublicMediaUrl: (key: string) => `/media/${key}`,
}));
vi.mock("./runtimeReadiness", () => ({
  checkRuntimeReadiness: vi.fn().mockResolvedValue({ ready: true }),
  isRuntimeLive: () => true,
}));

import { apiV1Router, restErrorHandler } from "./apiV1Router";

let server: Server;
let base: string;
beforeEach(async () => {
  mocks.context.mockReset().mockResolvedValue({ user: null });
  mocks.procedure.mockReset().mockResolvedValue({ public: true });
  mocks.badges.mockReset().mockResolvedValue({ contactVerified: false });
  mocks.rows = [];
  mocks.getDb.mockReset().mockImplementation(async () => {
    const chain: Record<string, unknown> = {};
    for (const key of [
      "select",
      "from",
      "innerJoin",
      "leftJoin",
      "where",
      "orderBy",
      "limit",
    ])
      chain[key] = () => chain;
    chain.then = (resolve: (rows: unknown[]) => unknown) =>
      Promise.resolve(mocks.rows).then(resolve);
    return { select: () => chain };
  });
  const app = express();
  app.use(express.json({ limit: "1kb" }));
  app.use("/api/v1", apiV1Router);
  app.use("/api/v1", restErrorHandler);
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing port");
  base = `http://127.0.0.1:${address.port}/api/v1`;
});
afterEach(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
});
async function request(path: string, options?: RequestInit) {
  const response = await fetch(base + path, options);
  return { status: response.status, body: await response.json() };
}

describe("REST asynchronous and validation boundaries", () => {
  it.each([
    "/search",
    "/notifications",
    "/categories",
    "/vendors",
    "/listings",
    "/users/me",
    "/vendors/shop",
    "/storefronts/shop",
    "/buyer/inquiries",
  ])("returns envelopes for malformed JSON on %s", async path => {
    const result = await request(`${path}?input=not-json`);
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({
      status: "error",
      error: { code: "BAD_REQUEST" },
    });
  });
  it.each([
    "-2",
    "0",
    "101",
    "1.5",
    "NaN",
    "Infinity",
    "2&limit=3",
    "2&other=true",
  ])("rejects invalid collection limit %s", async limit => {
    expect((await request(`/listings?limit=${limit}`)).status).toBe(400);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it("rejects ambiguous input and query objects rather than throwing unhandled errors", async () => {
    for (const query of [
      "input={}&limit=1",
      "input=1&input=2",
      "limit[bad]=2",
      "input=",
    ]) {
      expect((await request(`/listings?${query}`)).status).toBe(400);
    }
  });
  it("forwards alias input to the same validated tRPC caller", async () => {
    await request("/search?q=art&page=2");
    expect(mocks.procedure).toHaveBeenCalledWith({ q: "art", page: 2 });
    await request("/marketplace/search?q=art&page=2");
    expect(mocks.procedure).toHaveBeenLastCalledWith({ q: "art", page: 2 });
  });
  it("catches rejected contexts outside operation invocation and conceals diagnostics", async () => {
    mocks.context.mockRejectedValue(
      new Error("private password database host")
    );
    for (const path of [
      "/search",
      "/inquiries",
      "/messages",
      "/moderation/reports",
    ]) {
      const result = await request(path);
      expect(result.status).toBe(500);
      expect(JSON.stringify(result.body)).not.toContain("private password");
    }
  });
  it.each([
    ["PRECONDITION_FAILED", 412],
    ["SERVICE_UNAVAILABLE", 503],
    ["UNAUTHORIZED", 401],
    ["FORBIDDEN", 403],
    ["NOT_FOUND", 404],
  ])("maps %s to HTTP %s", async (code, status) => {
    mocks.procedure.mockRejectedValue({ code, message: "Request unavailable" });
    expect(await request("/search")).toMatchObject({
      status,
      body: { error: { code } },
    });
  });
  it("catches listing query rejections and standardizes parser errors", async () => {
    mocks.procedure.mockRejectedValue(new Error("private connection string"));
    expect(await request("/listings")).toMatchObject({
      status: 500,
      body: { error: { code: "INTERNAL_SERVER_ERROR" } },
    });
    const result = await request("/inquiries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"bad":',
    });
    expect(result).toMatchObject({
      status: 400,
      body: { error: { code: "BAD_REQUEST" } },
    });
    expect(
      (
        await request("/inquiries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: "a".repeat(2000) }),
        })
      ).status
    ).toBe(413);
  });
  it("delegates vendor paging and badge projection to the canonical procedure", async () => {
    const collection = {
      items: [{ id: 4, businessName: "Arts", badges: { contactVerified: false } }],
      pagination: { page: 2, pageSize: 3, total: 4, totalPages: 2 },
    };
    mocks.procedure.mockResolvedValue(collection);
    const result = await request("/vendors?page=2&pageSize=3");
    expect(result.status).toBe(200);
    expect(result.body.data).toEqual(collection);
    expect(mocks.procedure).toHaveBeenCalledWith({ page: 2, pageSize: 3 });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
});
