import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createHmac, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";
import { eq } from "drizzle-orm";
import superjson from "superjson";
import {
  accountOnboarding, accountResetTokens, authRateLimits, authSessions, categories,
  inquiries, listings, moderationRecords, notificationOutbox, notificationWebhookEvents, phoneVerificationCountries, users, vendorProfiles, vendorVerificationSessions, verificationChallenges,
  pendingRegistrations, emailDomainOverrides,
} from "../drizzle/schema";

const testUrl = process.env.ACCOUNT_TEST_DATABASE_URL;

describe.skipIf(!testUrl)("account security with isolated MySQL and HTTP", () => {
  let db: ReturnType<typeof drizzle>;
  let pool: mysql.Pool;
  let server: Server;
  let origin: string;
  let appRouter: typeof import("./routers").appRouter;
  let getDb: typeof import("./db").getDb;
  let enforceAuthRateLimit: typeof import("./accountSecurity").enforceAuthRateLimit;
  let authenticateFromRequest: typeof import("./jwtAuth").authenticateFromRequest;
  let signToken: typeof import("./jwtAuth").signToken;
  const createdIds: number[] = [];
  const sentEmails: { text: string; to: { email: string }[] }[] = [];
  const providerCalls: { url: string; body: Record<string, unknown> }[] = [];
  let providerFailure = false;
  let originalFetch: typeof fetch;
  let lastKycId: string;

  beforeAll(async () => {
    if (!testUrl || !new URL(testUrl).pathname.endsWith("_account_test")) {
      throw new Error("ACCOUNT_TEST_DATABASE_URL must select a dedicated database ending in _account_test.");
    }
    process.env.DATABASE_URL = testUrl;
    process.env.TURNSTILE_SECRET_KEY = "";
    process.env.TURNSTILE_MODE = "disabled";
    process.env.SENDPULSE_API_KEY = "account-test-key";
    process.env.SENDPULSE_API_FROM_EMAIL = "noreply@example.test";
    process.env.TWILIO_ACCOUNT_SID = "test-sid";
    process.env.TWILIO_AUTH_TOKEN = "test-token";
    process.env.TWILIO_VERIFY_SERVICE_SID = "test-service";
    process.env.DIDIT_API_KEY = "test-didit-key";
    process.env.DIDIT_WORKFLOW_ID = "test-workflow";
    process.env.DIDIT_WEBHOOK_SECRET = "test-webhook-secret";
    pool = mysql.createPool(testUrl);
    db = drizzle(pool);
    await migrate(db, { migrationsFolder: "drizzle" });
    ({ appRouter } = await import("./routers"));
    const { emailDns } = await import("./emailPolicy");
    vi.spyOn(emailDns, "mx").mockResolvedValue([{ exchange: "mail.example.test", priority: 10 }]);
    ({ getDb } = await import("./db"));
    ({ enforceAuthRateLimit } = await import("./accountSecurity"));
    ({ authenticateFromRequest, signToken } = await import("./jwtAuth"));
    originalFetch = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (/^https:\/\/(?:api.sendpulse.com|verify.twilio.com|verification.didit.me)\//.test(url)) {
        if (providerFailure) return new Response(JSON.stringify({ message: "Provider unavailable" }), { status: 503 });
        if (url.endsWith("/smtp/emails")) {
          const body = JSON.parse(String(init?.body));
          sentEmails.push(body.email);
          return new Response(JSON.stringify({ result: true, id: randomUUID() }), { status: 200 });
        }
        if (url.endsWith("/v3/session/")) {
          lastKycId = randomUUID();
          providerCalls.push({ url, body: JSON.parse(String(init?.body)) });
          return new Response(JSON.stringify({ session_id: lastKycId, url: `https://verify.example.test/${lastKycId}` }), { status: 200 });
        }
        if (url.endsWith("/sms/send")) {
          providerCalls.push({ url, body: JSON.parse(String(init?.body)) });
          return new Response(JSON.stringify({ result: true }), { status: 200 });
        }
        if (url.includes("VerificationCheck")) return new Response(JSON.stringify({
          status: new URLSearchParams(String(init?.body)).get("Code") === "123456" ? "approved" : "pending",
        }), { status: 200 });
        return new Response(JSON.stringify({ status: "pending" }), { status: 200 });
      }
      return originalFetch(input, init);
    });
    const { createContext } = await import("./_core/context");
    const app = express();
    const { registerDiditWebhook } = await import("./diditWebhook");
    registerDiditWebhook(app);
    app.use(express.json());
    app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
    server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 60_000);

  beforeEach(async () => {
    await db.delete(authRateLimits);
    providerFailure = false;
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (db) {
      await db.delete(notificationWebhookEvents);
      for (const id of createdIds) await db.delete(users).where(eq(users.id, id));
      await db.delete(authRateLimits);
    }
    const appDb = getDb ? await getDb() : null;
    if (appDb) await appDb.$client.end();
    if (pool) await pool.end();
    vi.restoreAllMocks();
  });

  async function createUser(status: "active" | "suspended" = "active") {
    const { hashPassword } = await import("./jwtAuth");
    const email = `${randomUUID()}@example.test`;
    const [result] = await db.insert(users).values({
      openId: `account-test-${randomUUID()}`, name: "Account Test", email,
      passwordHash: await hashPassword("OriginalPass123!"), status,
    });
    createdIds.push(result.insertId);
    return { id: result.insertId, email };
  }

  async function call(procedure: string, input?: unknown, cookie?: string, query = false, headers: Record<string, string> = {}) {
    const url = `${origin}/api/trpc/${procedure}`;
    const payload = JSON.stringify(superjson.serialize(input));
    const response = await fetch(query ? `${url}?input=${encodeURIComponent(payload)}` : url, {
      method: query ? "GET" : "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...headers },
      ...(query ? {} : { body: payload }),
    });
    const body = await response.json();
    return {
      status: response.status,
      cookie: response.headers.get("set-cookie")?.split(";")[0],
      data: body.result ? superjson.deserialize(body.result.data) : undefined,
      error: body.error?.json,
    };
  }

  async function diditEvent(payload: Record<string, unknown>, valid = true) {
    const body = JSON.stringify(payload);
    return fetch(`${origin}/api/webhooks/kyc/didit`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-signature": valid
        ? createHmac("sha256", "test-webhook-secret").update(body).digest("hex") : "invalid" },
      body,
    });
  }

  it("normalizes login, issues sessions and revokes a copied token at logout", async () => {
    const user = await createUser();
    const login = await call("auth.login", { email: `  ${user.email.toUpperCase()} `, password: "OriginalPass123!" });
    expect(login.status).toBe(200);
    expect(login.cookie).toBeTruthy();
    expect((await call("auth.me", undefined, login.cookie, true)).data).toMatchObject({ id: user.id });
    expect((await call("auth.logout", undefined, login.cookie)).status).toBe(200);
    expect((await call("auth.me", undefined, login.cookie, true)).data).toBeNull();
  });

  it("logs out only the current session, not another device", async () => {
    const user = await createUser();
    const first = await call("auth.login", { email: user.email, password: "OriginalPass123!" });
    const second = await call("auth.login", { email: user.email, password: "OriginalPass123!" });
    await call("auth.logout", undefined, first.cookie);
    expect((await call("auth.me", undefined, first.cookie, true)).data).toBeNull();
    expect((await call("auth.me", undefined, second.cookie, true)).data).toMatchObject({ id: user.id });
  });

  it("revokes all sessions when changing a password and only accepts the new password", async () => {
    const user = await createUser();
    const first = await call("auth.login", { email: user.email, password: "OriginalPass123!" });
    const second = await call("auth.login", { email: user.email, password: "OriginalPass123!" });
    expect((await call("auth.changePassword", {
      currentPassword: "OriginalPass123!", newPassword: "ReplacementPass123!",
    }, first.cookie)).status).toBe(200);
    for (const cookie of [first.cookie, second.cookie]) {
      expect((await call("auth.me", undefined, cookie, true)).data).toBeNull();
    }
    expect((await call("auth.login", { email: user.email, password: "OriginalPass123!" })).status).toBe(401);
    expect((await call("auth.login", { email: user.email, password: "ReplacementPass123!" })).status).toBe(200);
  });

  it("rejects suspended login without issuing a cookie", async () => {
    const user = await createUser("suspended");
    const result = await call("auth.login", { email: user.email, password: "OriginalPass123!" });
    expect(result.status).toBe(403);
    expect(result.cookie).toBeUndefined();
  });

  it("permanently revokes old sessions on admin suspension, even after reinstatement", async () => {
    const user = await createUser();
    const login = await call("auth.login", { email: user.email, password: "OriginalPass123!" });
    const { setAccountStatus } = await import("./accountSecurity");
    const appDb = (await getDb())!;
    await setAccountStatus(appDb, user.id, "suspended");
    expect((await call("auth.me", undefined, login.cookie, true)).data).toBeNull();
    await setAccountStatus(appDb, user.id, "active");
    expect((await call("auth.me", undefined, login.cookie, true)).data).toBeNull();
  });

  it("rejects signed but unregistered and expired database sessions", async () => {
    const user = await createUser();
    const token = await signToken({ userId: user.id, email: user.email, role: "buyer" });
    expect(await authenticateFromRequest({
      headers: { cookie: `kwantu_jwt=${token}` },
    } as express.Request)).toBeNull();
    const login = await call("auth.login", { email: user.email, password: "OriginalPass123!" });
    await db.update(authSessions).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(authSessions.userId, user.id));
    expect((await call("auth.me", undefined, login.cookie, true)).data).toBeNull();
  });

  it("rate-limits wrong logins by normalized account across requests", async () => {
    const user = await createUser();
    for (let attempt = 1; attempt <= 4; attempt++) {
      const response = await call("auth.login", { email: user.email, password: "WrongPass123!" });
      expect(response.status).toBe(401);
      expect(response.error.message.includes("Warning:")).toBe(attempt >= 3);
    }
    expect((await call("auth.login", { email: user.email.toUpperCase(), password: "WrongPass123!" })).status).toBe(429);
    expect((await call("auth.login", { email: user.email, password: "OriginalPass123!" })).status).toBe(429);
    expect((await call("auth.login", { email: user.email, password: "WrongPass123!" }, undefined, false, {
      "x-forwarded-for": "203.0.113.19", "cf-connecting-ip": "203.0.113.20",
    })).status).toBe(429);
  });

  it("warns on the ninth incorrect login per IP and locks on the fifteenth across distinct emails", async () => {
    for (let attempt = 1; attempt <= 14; attempt++) {
      const response = await call("auth.login", { email: `${randomUUID()}@example.test`, password: "WrongPass123!" });
      expect(response.status).toBe(401);
      expect(response.error.message.includes("Warning:")).toBe(attempt >= 9);
    }
    const blocked = await call("auth.login", { email: `${randomUUID()}@example.test`, password: "WrongPass123!" });
    expect(blocked.status).toBe(429);
    expect(blocked.error.message).toMatch(/Try again in \d+ minute/);
  }, 15_000);

  it("counts only failures and holds a full six-hour lockout without extending it on retries", async () => {
    const { checkLoginAttempt } = await import("./accountSecurity");
    const start = Date.UTC(2026, 10, 1, 1, 2, 3);
    let now = start;
    const verify = vi.fn().mockResolvedValue(true);
    for (let attempt = 0; attempt < 20; attempt++) {
      await checkLoginAttempt(db, "policy@example.test", "192.0.2.30", verify, () => now);
    }
    verify.mockResolvedValue(false);
    for (let attempt = 1; attempt <= 4; attempt++) {
      await expect(checkLoginAttempt(db, "policy@example.test", "192.0.2.30", verify, () => now))
        .rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }
    now += 60 * 60_000;
    await expect(checkLoginAttempt(db, "policy@example.test", "192.0.2.30", verify, () => now))
      .rejects.toMatchObject({ code: "TOO_MANY_REQUESTS", message: expect.stringContaining("360 minute") });
    const callsAtLock = verify.mock.calls.length;
    verify.mockResolvedValue(true);
    now += 5 * 60 * 60_000;
    await expect(checkLoginAttempt(db, "POLICY@example.test", "192.0.2.31", verify, () => now))
      .rejects.toMatchObject({ code: "TOO_MANY_REQUESTS", message: expect.stringContaining("60 minute") });
    expect(verify).toHaveBeenCalledTimes(callsAtLock);
    now += 60 * 60_000;
    await expect(checkLoginAttempt(db, "policy@example.test", "192.0.2.30", verify, () => now)).resolves.toBeUndefined();
  });

  it("serializes concurrent wrong logins and expires subthreshold failure history", async () => {
    const { checkLoginAttempt } = await import("./accountSecurity");
    let now = Date.UTC(2026, 10, 2);
    const verify = vi.fn().mockResolvedValue(false);
    const attempts = await Promise.allSettled(Array.from({ length: 8 }, () =>
      checkLoginAttempt(db, "parallel@example.test", "192.0.2.40", verify, () => now)));
    expect(verify).toHaveBeenCalledTimes(5);
    expect(attempts.filter(result => result.status === "rejected" && result.reason.code === "TOO_MANY_REQUESTS")).toHaveLength(4);
    for (let attempt = 0; attempt < 2; attempt++) await expect(
      checkLoginAttempt(db, "expiry@example.test", "192.0.2.41", async () => false, () => now)
    ).rejects.toMatchObject({ message: "Invalid email or password." });
    now += 6 * 60 * 60_000;
    await expect(checkLoginAttempt(db, "expiry@example.test", "192.0.2.41", async () => false, () => now))
      .rejects.toMatchObject({ message: "Invalid email or password." });
  });

  it("shares atomic limits across independent connections and expires old windows", async () => {
    const now = Math.floor(Date.now() / 60_000) * 60_000 + 100;
    const secondPool = mysql.createPool(testUrl!);
    try {
      const otherDb = drizzle(secondPool);
      const results = await Promise.allSettled(Array.from({ length: 20 }, (_, index) =>
        enforceAuthRateLimit(index % 2 ? db : otherDb, "parallel_test", "same_account", 5, 60_000, now)
      ));
      expect(results.filter(result => result.status === "fulfilled")).toHaveLength(5);
      await expect(enforceAuthRateLimit(otherDb, "parallel_test", "same_account", 5, 60_000, now + 60_000)).resolves.toBeUndefined();
    } finally {
      await secondPool.end();
    }
  });

  it("rejects unnormalized writes and permits separate pending flows without reserving accounts", async () => {
    const user = await createUser();
    await expect(db.insert(users).values({
      openId: `account-test-${randomUUID()}`, email: `  ${user.email.toUpperCase()} `,
    })).rejects.toThrow();
    await expect(db.insert(users).values({
      openId: `account-test-${randomUUID()}`, email: `  ${randomUUID()}@example.test `,
    })).rejects.toThrow();
    const email = `${randomUUID()}@example.test`;
    const input = { firstName: "New", lastName: "Buyer", email, role: "buyer", termsAccepted: true };
    const results = await Promise.all([call("auth.register", input), call("auth.register", { ...input, email: email.toUpperCase() })]);
    expect(results.map(result => result.status)).toEqual([200, 200]);
    expect(await db.select().from(users).where(eq(users.email, email))).toHaveLength(0);
    expect((await call("auth.me", undefined, results[0].cookie, true)).data).toBeNull();
    expect((await call("auth.requestRegistrationOtp", undefined, results[0].cookie)).status).toBe(200);
    const firstCode = lastEmailCode();
    expect((await call("auth.requestRegistrationOtp", undefined, results[1].cookie)).status).toBe(200);
    const secondCode = lastEmailCode();
    const completed = await call("auth.completeRegistration", { code: firstCode, password: "OwnerChosen123!" }, results[0].cookie);
    expect(completed.status).toBe(200);
    const [created] = await db.select().from(users).where(eq(users.email, email));
    createdIds.push(created.id);
    expect(created.emailVerifiedAt).toBeTruthy();
    expect(created.avatarUrl).toBeNull();
    expect((await call("auth.completeRegistration", { code: secondCode, password: "AttackerPass123!" }, results[1].cookie)).status).toBe(409);
    expect((await call("auth.login", { email, password: "AttackerPass123!" })).status).toBe(401);
    expect((await call("auth.login", { email, password: "OwnerChosen123!" })).status).toBe(200);
  });

  it("rejects supplying passwords before the email-verification handoff", async () => {
    for (const password of ["short", "é".repeat(37)]) {
      expect((await call("auth.register", {
        firstName: "Invalid", lastName: "Password", email: `${randomUUID()}@example.test`, password, termsAccepted: true,
      })).status).toBe(400);
    }
  });

  it("fails migration preflight on normalized duplicates without changing source emails", async () => {
    const connection = await pool.getConnection();
    try {
      await connection.query("CREATE TEMPORARY TABLE users (email varchar(320))");
      await connection.query("INSERT INTO users VALUES ('buyer@example.test'), ('  BUYER@example.test ')");
      const [before] = await connection.query("SELECT email FROM users ORDER BY email");
      const statements = (await readFile(new URL("../drizzle/0020_account_security.sql", import.meta.url), "utf8")).split("--> statement-breakpoint");
      await connection.query(statements[0]);
      await expect(connection.query(statements[1])).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });
      const [after] = await connection.query("SELECT email FROM users ORDER BY email");
      expect(after).toEqual(before);
    } finally {
      await connection.query("DROP TEMPORARY TABLE IF EXISTS _account_email_preflight");
      await connection.query("DROP TEMPORARY TABLE IF EXISTS users");
      connection.release();
    }
  });

  async function signedInUser() {
    const user = await createUser();
    const login = await call("auth.login", { email: user.email, password: "OriginalPass123!" });
    return { ...user, cookie: login.cookie! };
  }

  function lastEmailCode() {
    return sentEmails.at(-1)!.text.match(/code is (\d{6})/)![1];
  }

  it("finishes buyer email verification without requiring a phone, and consumes codes once", async () => {
    const user = await signedInUser();
    expect((await call("auth.requestEmailOtp", {}, user.cookie)).status).toBe(200);
    expect(sentEmails.at(-1)!.to[0].email).toBe(user.email);
    const code = lastEmailCode();
    const results = await Promise.all([
      call("auth.verifyEmailOtp", { code }, user.cookie),
      call("auth.verifyEmailOtp", { code }, user.cookie),
    ]);
    expect(results.map(result => result.status).sort()).toEqual([200, 400]);
    const [account] = await db.select().from(users).where(eq(users.id, user.id));
    expect(account.emailVerifiedAt).toBeTruthy();
    expect(account.phoneVerifiedAt).toBeNull();
  });

  it("bounds wrong OTP attempts and enforces cooldown, expiry, supersession and destination binding", async () => {
    const user = await signedInUser();
    await call("auth.requestEmailOtp", {}, user.cookie);
    const oldCode = lastEmailCode();
    expect((await call("auth.requestEmailOtp", {}, user.cookie)).status).toBe(429);
    const wrongCode = oldCode === "000000" ? "999999" : "000000";
    for (let n = 0; n < 5; n++) expect((await call("auth.verifyEmailOtp", { code: wrongCode }, user.cookie)).status).toBe(400);
    expect((await call("auth.verifyEmailOtp", { code: oldCode }, user.cookie)).status).toBe(400);
    await db.update(verificationChallenges).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(verificationChallenges.userId, user.id));
    expect((await call("auth.requestEmailOtp", {}, user.cookie)).status).toBe(200);
    const code = lastEmailCode();
    await db.update(users).set({ email: `changed-${randomUUID()}@example.test` }).where(eq(users.id, user.id));
    expect((await call("auth.verifyEmailOtp", { code }, user.cookie)).status).toBe(400);
    await db.update(verificationChallenges).set({ lastSentAt: new Date(Date.now() - 120_000) }).where(eq(verificationChallenges.userId, user.id));
    await call("auth.requestEmailOtp", {}, user.cookie);
    await db.update(verificationChallenges).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(verificationChallenges.userId, user.id));
    expect((await call("auth.verifyEmailOtp", { code: lastEmailCode() }, user.cookie)).status).toBe(400);
  });

  it("rolls back undelivered OTP challenges and returns an explicit delivery failure", async () => {
    const user = await signedInUser();
    providerFailure = true;
    expect((await call("auth.requestEmailOtp", {}, user.cookie)).status).not.toBe(200);
    const challenges = await db.select().from(verificationChallenges).where(eq(verificationChallenges.userId, user.id));
    expect(challenges).toHaveLength(0);
    providerFailure = false;
    expect((await call("auth.requestEmailOtp", {}, user.cookie)).status).toBe(200);
  });

  it("requires verified email for SMS and rejects countries outside the configured allowlist", async () => {
    const user = await signedInUser();
    expect((await call("auth.requestPhoneOtp", { phone: "+14165550123" }, user.cookie)).status).not.toBe(200);
    await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, user.id));
    expect((await call("auth.requestPhoneOtp", { phone: "+12425550123" }, user.cookie)).status).toBe(400);
    expect((await call("auth.requestPhoneOtp", { phone: "+442079460018" }, user.cookie)).status).toBe(400);
    expect((await call("auth.requestPhoneOtp", { phone: "+14165550123" }, user.cookie)).status).toBe(200);
    expect((await call("auth.verifyPhoneOtp", { code: "000000" }, user.cookie)).status).toBe(400);
    expect((await call("auth.verifyPhoneOtp", { code: "123456" }, user.cookie)).status).toBe(200);
    expect((await call("auth.verifyPhoneOtp", { code: "123456" }, user.cookie)).status).toBe(400);
  });

  it("persists OTP expiry across status reloads and refuses resend until expiry without another Turnstile challenge", async () => {
    const user = await signedInUser();
    vi.stubEnv("TURNSTILE_SECRET_KEY", "test-secret-must-not-be-needed-for-contacts");
    try {
      const sent = await call("auth.requestEmailOtp", {}, user.cookie);
      expect(sent.status).toBe(200);
      const data = sent.data as { expiresAt: Date };
      expect(data.expiresAt.getTime() - Date.now()).toBeGreaterThan(590_000);
      const reloaded = await call("auth.contactStatus", undefined, user.cookie, true);
      expect(reloaded.data).toMatchObject({ email: { expiresAt: data.expiresAt } });
      await db.update(verificationChallenges).set({ lastSentAt: new Date(Date.now() - 120_000) }).where(eq(verificationChallenges.userId, user.id));
      expect((await call("auth.requestEmailOtp", {}, user.cookie)).status).toBe(429);
      await db.update(verificationChallenges).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(verificationChallenges.userId, user.id));
      expect((await call("auth.requestEmailOtp", {}, user.cookie)).status).toBe(200);
    } finally { vi.unstubAllEnvs(); }
  });

  it("allows admins to add or hide SMS countries, enforces destination region and permits Nigeria by default", async () => {
    const user = await signedInUser();
    const admin = await signedInUser();
    await db.update(users).set({ role: "admin" }).where(eq(users.id, admin.id));
    await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, user.id));
    const enabled = await call("auth.phoneCountries", undefined, user.cookie, true);
    expect((enabled.data as { countryCode: string }[]).map(item => item.countryCode).sort()).toEqual(["CA", "MX", "NG", "US"]);
    expect((await call("admin.setPhoneCountry", { countryCode: "NG", enabled: false }, user.cookie)).status).toBe(403);
    expect((await call("admin.setPhoneCountry", { countryCode: "ZZ", enabled: true }, admin.cookie)).status).toBe(400);
    expect((await call("auth.requestPhoneOtp", { phone: "+2348031234567", countryCode: "US" }, user.cookie)).status).toBe(400);
    vi.stubEnv("TURNSTILE_SECRET_KEY", "test-secret-must-not-be-needed-for-contacts");
    try {
      expect((await call("auth.requestPhoneOtp", { phone: "+2348031234567", countryCode: "NG" }, user.cookie)).status).toBe(200);
      const status = await call("auth.contactStatus", undefined, user.cookie, true);
      expect((status.data as { phone: { expiresAt: Date } }).phone.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect((await call("auth.requestPhoneOtp", { phone: "+2348031234567", countryCode: "NG" }, user.cookie)).status).toBe(429);
      expect((await call("admin.setPhoneCountry", { countryCode: "NG", enabled: false }, admin.cookie)).status).toBe(200);
      const hidden = await call("auth.phoneCountries", undefined, user.cookie, true);
      expect((hidden.data as { countryCode: string }[]).some(item => item.countryCode === "NG")).toBe(false);
      expect((await call("auth.verifyPhoneOtp", { code: "123456" }, user.cookie)).status).toBe(400);
      expect((await call("auth.requestPhoneOtp", { phone: "+2348031234567" }, user.cookie)).status).toBe(400);
      expect((await call("admin.setPhoneCountry", { countryCode: "NG", enabled: true }, admin.cookie)).status).toBe(200);
      expect((await call("auth.verifyPhoneOtp", { code: "123456" }, user.cookie)).status).toBe(200);
      expect((await call("admin.setPhoneCountry", { countryCode: "GB", enabled: true }, admin.cookie)).status).toBe(200);
      const another = await signedInUser();
      await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, another.id));
      expect((await call("auth.requestPhoneOtp", { phone: "+442079460123", countryCode: "GB" }, another.cookie)).status).toBe(200);
      await db.update(phoneVerificationCountries).set({ enabled: false }).where(eq(phoneVerificationCountries.countryCode, "NG"));
      const [account] = await db.select().from(users).where(eq(users.id, user.id));
      expect(account.phoneVerifiedAt).toBeTruthy();
    } finally {
      vi.unstubAllEnvs();
      await db.update(phoneVerificationCountries).set({ enabled: true }).where(eq(phoneVerificationCountries.countryCode, "NG"));
      await db.delete(phoneVerificationCountries).where(eq(phoneVerificationCountries.countryCode, "GB"));
    }
  });

  it("offers only admin-enabled countries for vendor identity and enforces them on save", async () => {
    const user = await signedInUser();
    const admin = await signedInUser();
    await db.update(users).set({ role: "admin" }).where(eq(users.id, admin.id));
    await db.update(users).set({ emailVerifiedAt: new Date(), phone: "+14165550123", phoneVerifiedAt: new Date() }).where(eq(users.id, user.id));
    const details = { firstName: "Ada", lastName: "Obi", dateOfBirth: "1990-05-20",
      city: "Lagos", address: "12 Example Street", countryCode: "NG", consentGiven: true, termsAccepted: true };
    try {
      expect((await call("admin.setPhoneCountry", { countryCode: "NG", enabled: false }, admin.cookie)).status).toBe(200);
      expect((await call("auth.saveVendorIdentity", details, user.cookie)).status).toBe(400);
      expect((await call("admin.setPhoneCountry", { countryCode: "NG", enabled: true }, admin.cookie)).status).toBe(200);
      expect((await call("auth.saveVendorIdentity", details, user.cookie)).status).toBe(200);
      const [saved] = await db.select().from(accountOnboarding).where(eq(accountOnboarding.userId, user.id));
      expect(saved.countryCode).toBe("NG");
      expect((await call("auth.saveVendorIdentity", { ...details, countryCode: "ZZ" }, user.cookie)).status).toBe(400);
    } finally {
      await db.update(phoneVerificationCountries).set({ enabled: true }).where(eq(phoneVerificationCountries.countryCode, "NG"));
    }
  });

  it("uses hashed, expiring, single-use password reset links and revokes all sessions", async () => {
    const user = await signedInUser();
    const known = await call("auth.requestPasswordReset", { email: user.email });
    const unknown = await call("auth.requestPasswordReset", { email: `${randomUUID()}@example.test` });
    expect(known.status).toBe(200);
    expect(known.data).toEqual(unknown.data);
    const { processNotificationOutboxBatch } = await import("./notificationWorker");
    await processNotificationOutboxBatch(db);
    const token = sentEmails.at(-1)!.text.match(/#token=([a-f0-9]{64})/)![1];
    const [row] = await db.select().from(accountResetTokens).where(eq(accountResetTokens.userId, user.id));
    expect(row.tokenHash).not.toBe(token);
    expect((await call("auth.resetPassword", { token, password: "ResetPass123!" })).status).toBe(200);
    expect((await call("auth.me", undefined, user.cookie, true)).data).toBeNull();
    expect((await call("auth.resetPassword", { token, password: "AnotherPass123!" })).status).toBe(400);
    expect((await call("auth.login", { email: user.email, password: "ResetPass123!" })).status).toBe(200);
  });

  it("supports SendPulse SMS codes with the same atomic target-bound verification", async () => {
    const user = await signedInUser();
    await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, user.id));
    vi.stubEnv("SMS_PROVIDER", "sendpulse");
    vi.stubEnv("SENDPULSE_CLIENT_ID", "test");
    vi.stubEnv("SENDPULSE_CLIENT_SECRET", "test");
    vi.stubEnv("SENDPULSE_SMS_SENDER", "KwantuHub");
    try {
      expect((await call("auth.requestPhoneOtp", { phone: "+525555123456" }, user.cookie)).status).toBe(200);
      const body = providerCalls.at(-1)!.body;
      expect(body.phones).toEqual(["525555123456"]);
      const code = String(body.body).match(/\b(\d{6})\b/)![1];
      expect((await call("auth.verifyPhoneOtp", { code }, user.cookie)).status).toBe(200);
      expect((await call("auth.verifyPhoneOtp", { code }, user.cookie)).status).toBe(400);
    } finally { vi.unstubAllEnvs(); }
  });

  it("keeps the old email until a password-authorized new address is verified, then revokes sessions", async () => {
    const user = await signedInUser();
    const email = `${randomUUID()}@example.test`;
    expect((await call("auth.requestEmailChange", { email, currentPassword: "wrong" }, user.cookie)).status).toBe(401);
    expect((await call("auth.requestEmailChange", { email, currentPassword: "OriginalPass123!" }, user.cookie)).status).toBe(200);
    const [before] = await db.select().from(users).where(eq(users.id, user.id));
    expect(before.email).toBe(user.email);
    expect((await call("auth.verifyEmailChange", { code: lastEmailCode() }, user.cookie)).status).toBe(200);
    const [after] = await db.select().from(users).where(eq(users.id, user.id));
    expect(after.email).toBe(email);
    expect(after.emailVerifiedAt).toBeTruthy();
    expect((await call("auth.me", undefined, user.cookie, true)).data).toBeNull();
  });

  it("rejects an email-change collision without changing the original address or consuming a valid session", async () => {
    const owner = await signedInUser();
    const user = await signedInUser();
    await call("auth.requestEmailChange", { email: owner.email, currentPassword: "OriginalPass123!" }, user.cookie);
    expect((await call("auth.verifyEmailChange", { code: lastEmailCode() }, user.cookie)).status).toBe(409);
    const [unchanged] = await db.select().from(users).where(eq(users.id, user.id));
    expect(unchanged.email).toBe(user.email);
    expect((await call("auth.me", undefined, user.cookie, true)).data).toMatchObject({ id: user.id });
  });

  it("queues recoveries consistently during provider outages, retries delivery, and rejects expired or concurrently reused tokens", async () => {
    const user = await signedInUser();
    providerFailure = true;
    const known = await call("auth.requestPasswordReset", { email: user.email });
    const unknown = await call("auth.requestPasswordReset", { email: `${randomUUID()}@example.test` });
    expect(known.data).toEqual(unknown.data);
    const { processNotificationOutboxBatch } = await import("./notificationWorker");
    await processNotificationOutboxBatch(db);
    const [pending] = await db.select().from(notificationOutbox).where(eq(notificationOutbox.recipientUserId, user.id));
    expect(pending.status).toBe("failed");
    expect(pending.lastError).toBeTruthy();
    providerFailure = false;
    await db.update(notificationOutbox).set({ availableAt: new Date(Date.now() - 60_000) }).where(eq(notificationOutbox.id, pending.id));
    await processNotificationOutboxBatch(db);
    const token = sentEmails.at(-1)!.text.match(/#token=([a-f0-9]{64})/)![1];
    await db.update(accountResetTokens).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(accountResetTokens.userId, user.id));
    expect((await call("auth.resetPassword", { token, password: "Replacement123!" })).status).toBe(400);
    await db.update(accountResetTokens).set({ expiresAt: new Date(Date.now() + 60_000) }).where(eq(accountResetTokens.userId, user.id));
    const attempts = await Promise.all([
      call("auth.resetPassword", { token, password: "Replacement123!" }),
      call("auth.resetPassword", { token, password: "Replacement456!" }),
    ]);
    expect(attempts.map(result => result.status).sort()).toEqual([200, 400]);
  });

  it("lets only admins queue audited recovery assistance without changing credentials", async () => {
    const user = await signedInUser();
    const admin = await signedInUser();
    expect((await call("admin.requestAccountReset", { userId: user.id }, user.cookie)).status).toBe(403);
    await db.update(users).set({ role: "admin", emailVerifiedAt: new Date() }).where(eq(users.id, admin.id));
    const [before] = await db.select().from(users).where(eq(users.id, user.id));
    expect((await call("admin.requestAccountReset", { userId: user.id }, admin.cookie)).status).toBe(200);
    const [after] = await db.select().from(users).where(eq(users.id, user.id));
    expect(after.passwordHash).toBe(before.passwordHash);
    expect((await call("auth.me", undefined, user.cookie, true)).data).toMatchObject({ id: user.id });
    expect(await db.select().from(moderationRecords).where(eq(moderationRecords.actorId, admin.id))).toHaveLength(1);
  });

  it("never grants vendor privileges from signup or a partial profile submission", async () => {
    const email = `${randomUUID()}@example.test`;
    const registration = await call("auth.register", {
      firstName: "Vendor", lastName: "Applicant", email, role: "vendor", termsAccepted: true,
    });
    expect(registration.status).toBe(200);
    expect(await db.select().from(users).where(eq(users.email, email))).toHaveLength(0);
    expect((await call("vendor.saveProfile", { businessName: "Bypass attempt", description: "Example" }, registration.cookie)).status).toBe(401);
    expect((await call("auth.requestRegistrationOtp", undefined, registration.cookie)).status).toBe(200);
    const completion = await call("auth.completeRegistration", { code: lastEmailCode(), password: "VendorPass123!" }, registration.cookie);
    expect(completion.status).toBe(200);
    const [user] = await db.select().from(users).where(eq(users.email, email));
    createdIds.push(user.id);
    expect(user.role).toBe("buyer");
    expect(user.signupIntent).toBe("vendor");
    expect((await call("vendor.saveProfile", { businessName: "Bypass attempt", description: "Example" }, completion.cookie)).status).not.toBe(200);
    const [unchanged] = await db.select().from(users).where(eq(users.id, user.id));
    expect(unchanged.role).toBe("buyer");
  });

  it("activates a vendor only after valid contact, adult identity, signed Didit decision and storefront steps", async () => {
    const user = await signedInUser();
    const details = { firstName: "Jane", lastName: "Doe", dateOfBirth: "1990-05-20",
      city: "Toronto", address: "123 Example Street", countryCode: "CA", consentGiven: true, termsAccepted: true };
    expect((await call("auth.saveVendorIdentity", details, user.cookie)).status).not.toBe(200);
    await db.update(users).set({ emailVerifiedAt: new Date(), phone: "+14165550123", phoneVerifiedAt: new Date() }).where(eq(users.id, user.id));
    expect((await call("auth.saveVendorIdentity", { ...details, dateOfBirth: "2020-01-01" }, user.cookie)).status).toBe(400);
    expect((await call("auth.saveVendorIdentity", details, user.cookie)).status).toBe(200);
    const [privateDetails] = await db.select().from(accountOnboarding).where(eq(accountOnboarding.userId, user.id));
    expect(privateDetails.identityCiphertext).not.toContain(details.address);
    expect((await call("auth.startVendorKyc", undefined, user.cookie)).status).toBe(200);
    const providerId = lastKycId;
    const event = {
      event_id: randomUUID(), session_id: providerId, status: "Approved", timestamp: Math.floor(Date.now() / 1000),
      decision: { id_verifications: [{ status: "Approved", first_name: "Jane", last_name: "Doe", date_of_birth: "1990-05-20" }] },
    };
    const profileInput = { businessName: "Jane's Shop", description: "Beautiful handmade goods.", location: "Toronto, CA", standardsAcknowledged: true };
    expect((await call("vendor.saveProfile", profileInput, user.cookie)).status).not.toBe(200);
    expect((await diditEvent(event, false)).status).toBe(401);
    expect((await diditEvent({ ...event, event_id: randomUUID(), decision: {} })).status).toBe(200);
    expect((await call("vendor.saveProfile", profileInput, user.cookie)).status).not.toBe(200);
    expect((await diditEvent(event)).status).toBe(200);
    expect(await (await diditEvent(event)).json()).toMatchObject({ status: "duplicate" });
    expect((await diditEvent({ ...event, event_id: randomUUID(), status: "In Progress", timestamp: event.timestamp - 1 })).status).toBe(200);
    expect((await call("vendor.saveProfile", profileInput, user.cookie)).status).toBe(200);
    const [account] = await db.select().from(users).where(eq(users.id, user.id));
    expect(account.role).toBe("vendor");
    const [vendor] = await db.select().from(vendorProfiles).where(eq(vendorProfiles.userId, user.id));
    expect(vendor.approvalStatus).toBe("approved");
    await db.update(vendorProfiles).set({ approvalStatus: "suspended" }).where(eq(vendorProfiles.id, vendor.id));
    expect((await call("vendor.saveProfile", { ...profileInput, phone: null }, user.cookie)).status).toBe(200);
    const [suspended] = await db.select().from(vendorProfiles).where(eq(vendorProfiles.id, vendor.id));
    expect(suspended.approvalStatus).toBe("suspended");
    expect((await call("auth.me", undefined, user.cookie, true)).data).not.toHaveProperty("identityCiphertext");
  });

  it("rejects forged, stale and premature Didit callbacks without recording a successful decision", async () => {
    const event = { event_id: randomUUID(), session_id: randomUUID(), status: "Approved", timestamp: Math.floor(Date.now() / 1000) };
    expect((await diditEvent(event, false)).status).toBe(401);
    expect((await diditEvent({ ...event, timestamp: event.timestamp - 600 })).status).toBe(401);
    // Premature callbacks are durably received (encrypted) for reconciliation, never applied as a decision.
    const premature = await diditEvent(event);
    expect(premature.status).toBe(200);
    const stored = await db.select().from(notificationWebhookEvents).where(eq(notificationWebhookEvents.providerEventId, event.event_id));
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ provider: "didit", processingStatus: "failed", processedAt: null });
    expect(JSON.stringify(stored[0].payload)).toContain("encryptedPayload");
  });

  it("allows anonymous public contacts but requires vendor-specific prior contact for reviews without buyer phone verification", async () => {
    const owner = await signedInUser();
    const buyer = await signedInUser();
    await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, buyer.id));
    const [vendor] = await db.insert(vendorProfiles).values({
      userId: owner.id, businessName: "Public Shop", approvalStatus: "approved", contactEmail: "public@example.test",
    });
    const { encryptOtp } = await import("./contactVerification");
    const { TERMS_VERSION } = await import("./accountPolicy");
    await db.update(users).set({
      role: "vendor", emailVerifiedAt: new Date(), phone: "+14165550123", phoneVerifiedAt: new Date(),
      termsAcceptedAt: new Date(), termsVersion: TERMS_VERSION,
    }).where(eq(users.id, owner.id));
    const [kyc] = await db.insert(vendorVerificationSessions).values({
      vendorId: vendor.insertId, userId: owner.id, provider: "didit", sessionType: "combined_na_vendor",
      status: "approved", expiresAt: new Date(Date.now() + 86_400_000), countryCode: "CA",
    });
    await db.insert(accountOnboarding).values({
      userId: owner.id, countryCode: "CA", identityCiphertext: encryptOtp("{}"),
      kycSessionId: kyc.insertId, kycVerifiedAt: new Date(), completedAt: new Date(),
    });
    const [category] = await db.insert(categories).values({ name: "Example", slug: randomUUID() });
    const createListing = async () => {
      const [result] = await db.insert(listings).values({
        vendorId: vendor.insertId, categoryId: category.insertId, title: "Example", slug: randomUUID(),
        description: "Example product", listingType: "product", status: "published",
      });
      return result.insertId;
    };
    const first = await createListing();
    const second = await createListing();
    expect(await call("marketplace.revealContact", { listingId: first })).toMatchObject({
      status: 200, data: { channels: expect.arrayContaining([{ type: "contactEmail", value: "public@example.test" }]) },
    });
    expect((await call("buyer.submitReview", { listingId: second, rating: 5 }, buyer.cookie)).status).toBe(403);
    const otherOwner = await signedInUser();
    const [otherVendor] = await db.insert(vendorProfiles).values({ userId: otherOwner.id, businessName: "Another Shop", approvalStatus: "approved" });
    const [otherListing] = await db.insert(listings).values({
      vendorId: otherVendor.insertId, categoryId: category.insertId, title: "Other", slug: randomUUID(),
      description: "Other product", listingType: "product", status: "published",
    });
    await db.insert(inquiries).values({ vendorId: otherVendor.insertId, buyerId: buyer.id, listingId: otherListing.insertId, subject: "Unrelated inquiry" });
    expect((await call("buyer.submitReview", { listingId: second, rating: 5 }, buyer.cookie)).status).toBe(403);
    await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, owner.id));
    await db.insert(inquiries).values({ vendorId: vendor.insertId, buyerId: owner.id, listingId: first, subject: "Self inquiry" });
    expect((await call("buyer.submitReview", { listingId: first, rating: 5 }, owner.cookie)).status).toBe(403);
    await db.insert(inquiries).values({ vendorId: vendor.insertId, buyerId: buyer.id, listingId: first, subject: "Question" });
    expect((await call("buyer.submitReview", { listingId: second, rating: 5 }, buyer.cookie)).status).toBe(200);
    await db.update(listings).set({ status: "hidden" }).where(eq(listings.id, first));
    expect((await call("marketplace.revealContact", { listingId: first })).status).toBe(404);
    await db.update(vendorProfiles).set({ approvalStatus: "suspended" }).where(eq(vendorProfiles.id, vendor.insertId));
    expect((await call("marketplace.revealContact", { listingId: second })).status).toBe(404);
    await db.update(vendorProfiles).set({ approvalStatus: "approved" }).where(eq(vendorProfiles.id, vendor.insertId));
    await db.update(users).set({ status: "suspended" }).where(eq(users.id, owner.id));
    expect((await call("marketplace.revealContact", { listingId: second })).status).toBe(404);
  });

  it("rejects unsafe avatars and normalizes uploaded image bytes before storing them", async () => {
    const user = await signedInUser();
    await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, user.id));
    expect((await call("auth.updateProfile", { avatarUrl: "javascript:alert(1)" }, user.cookie)).status).toBe(400);
    expect((await call("auth.updateProfile", { avatarUrl: null }, user.cookie)).status).toBe(200);
    const storage = await import("./storage");
    const sharp = (await import("sharp")).default;
    let uploaded: Buffer | undefined;
    const put = vi.spyOn(storage, "storagePut").mockImplementation(async (key, data) => {
      uploaded = Buffer.from(data);
      return { key, url: `/media/${key}` };
    });
    const remove = vi.spyOn(storage, "storageDelete").mockResolvedValue(undefined);
    try {
      const png = await sharp({ create: { width: 400, height: 200, channels: 3, background: "#ff0000" } }).png().toBuffer();
      expect((await call("auth.uploadAvatar", { fileBase64: png.toString("base64") }, user.cookie)).status).toBe(200);
      expect(await sharp(uploaded!).metadata()).toMatchObject({ format: "webp", width: 256, height: 256 });
      expect((await call("auth.uploadAvatar", { fileBase64: Buffer.from("<svg/>").toString("base64") }, user.cookie)).status).toBe(400);
      expect((await call("auth.updateProfile", { avatarUrl: null }, user.cookie)).status).toBe(200);
      expect(remove).toHaveBeenCalled();
    } finally { put.mockRestore(); remove.mockRestore(); }
  });

  it("blocks unverified accounts from portal APIs but allows email verification and correction", async () => {
    const user = await signedInUser();
    for (const procedure of ["buyer.wishlist", "buyer.inquiries", "buyer.viewHistory", "buyer.reviews", "buyer.savedSearches", "notifications.list"]) {
      expect((await call(procedure, procedure === "notifications.list" ? { limit: 5 } : undefined, user.cookie, true)).status).toBe(403);
    }
    expect((await call("auth.updateProfile", { firstName: "No", lastName: "Access" }, user.cookie)).status).toBe(403);
    expect((await call("buyer.toggleWishlist", { listingId: 1 }, user.cookie)).status).toBe(403);
    expect((await call("auth.contactStatus", undefined, user.cookie, true)).status).toBe(200);
    expect((await call("auth.requestEmailOtp", {}, user.cookie)).status).toBe(200);
    expect((await call("auth.verifyEmailOtp", { code: lastEmailCode() }, user.cookie)).status).toBe(200);
    expect((await call("buyer.wishlist", undefined, user.cookie, true)).status).toBe(200);
  });

  it("preserves existing administrator governance without granting unverified buyer access", async () => {
    const admin = await signedInUser();
    await db.update(users).set({ role: "admin" }).where(eq(users.id, admin.id));
    expect((await call("admin.pendingVendors", undefined, admin.cookie, true)).status).toBe(200);
    expect((await call("buyer.wishlist", undefined, admin.cookie, true)).status).toBe(403);
  });

  it("persists registration expiry, limits wrong codes, permits resend only after expiry and consumes completion once", async () => {
    const email = `${randomUUID()}@example.test`;
    const started = await call("auth.register", { firstName: "New", lastName: "Buyer", email, role: "buyer", termsAccepted: true });
    expect(started.status).toBe(200);
    const initial = (await call("auth.registrationStatus", undefined, started.cookie, true)).data as { expiresAt: Date };
    expect(initial.expiresAt.getTime() - Date.now()).toBeGreaterThan(24 * 60 * 60_000 - 5000);
    expect((await call("auth.requestRegistrationOtp", undefined, started.cookie)).status).toBe(200);
    const originalCode = lastEmailCode();
    expect((await call("auth.requestRegistrationOtp", undefined, started.cookie)).status).toBe(429);
    const wrong = originalCode === "000000" ? "111111" : "000000";
    for (let n = 0; n < 5; n++) expect((await call("auth.completeRegistration", { code: wrong, password: "OwnerPassword123!" }, started.cookie)).status).toBe(400);
    expect((await call("auth.completeRegistration", { code: originalCode, password: "OwnerPassword123!" }, started.cookie)).status).toBe(400);
    await db.update(pendingRegistrations).set({ codeExpiresAt: new Date(Date.now() - 1000) }).where(eq(pendingRegistrations.email, email));
    expect((await call("auth.requestRegistrationOtp", undefined, started.cookie)).status).toBe(200);
    const currentCode = lastEmailCode();
    expect((await call("auth.completeRegistration", { code: currentCode, password: "short" }, started.cookie)).status).toBe(400);
    const attempts = await Promise.all([
      call("auth.completeRegistration", { code: currentCode, password: "OwnerPassword123!" }, started.cookie),
      call("auth.completeRegistration", { code: currentCode, password: "OwnerPassword123!" }, started.cookie),
    ]);
    expect(attempts.filter(result => result.status === 200)).toHaveLength(1);
    const [user] = await db.select().from(users).where(eq(users.email, email));
    createdIds.push(user.id);
    expect(await db.select().from(pendingRegistrations).where(eq(pendingRegistrations.email, email))).toHaveLength(0);
  });

  it("expires never-verified buyer and vendor registrations after24h without removing existing users or later vendor progress", async () => {
    const user = await signedInUser();
    const { purgeExpiredRegistrations } = await import("./registration");
    for (const role of ["buyer", "vendor"]) {
      const email = `${randomUUID()}@example.test`;
      const pending = await call("auth.register", { email, firstName: "Expired", lastName: "Applicant", role, termsAccepted: true });
      expect(pending.status).toBe(200);
      await db.update(pendingRegistrations).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(pendingRegistrations.email, email));
      expect((await call("auth.requestRegistrationOtp", undefined, pending.cookie)).status).toBe(401);
      expect((await call("auth.registrationStatus", undefined, pending.cookie, true)).data).toBeNull();
      await purgeExpiredRegistrations();
      expect(await db.select().from(pendingRegistrations).where(eq(pendingRegistrations.email, email))).toHaveLength(0);
      expect(await db.select().from(users).where(eq(users.email, email))).toHaveLength(0);
    }
    expect(await db.select().from(users).where(eq(users.id, user.id))).toHaveLength(1);
  });

  it("screens disposable domains with most-specific audited admin overrides while preserving OTP checks", async () => {
    const admin = await signedInUser();
    await db.update(users).set({ role: "admin", emailVerifiedAt: new Date() }).where(eq(users.id, admin.id));
    const input = { email: `${randomUUID()}@mailinator.com`, firstName: "Test", lastName: "Buyer", termsAccepted: true };
    const override = { domain: "mailinator.com", policy: "allow", reason: "Integration test override" };
    expect((await call("auth.register", input)).status).toBe(400);
    const nonAdmin = await signedInUser();
    expect((await call("admin.setEmailDomainOverride", override, nonAdmin.cookie)).status).toBe(403);
    try {
      expect((await call("admin.setEmailDomainOverride", override, admin.cookie)).status).toBe(200);
      const allowed = await call("auth.register", input);
      expect(allowed.status).toBe(200);
      expect(await db.select().from(users).where(eq(users.email, input.email))).toHaveLength(0);
      expect((await call("admin.setEmailDomainOverride", { ...override, domain: "sub.mailinator.com", policy: "block" }, admin.cookie)).status).toBe(200);
      expect((await call("auth.register", { ...input, email: `${randomUUID()}@sub.mailinator.com` })).status).toBe(400);
      expect((await call("admin.emailPolicy", undefined, admin.cookie, true)).status).toBe(200);
    } finally { await db.delete(emailDomainOverrides); }
  });

  it("rolls back failed pending-registration delivery and binds codes to the current browser flow", async () => {
    const input = { email: `${randomUUID()}@example.test`, firstName: "Bound", lastName: "Buyer", termsAccepted: true };
    const first = await call("auth.register", input);
    const second = await call("auth.register", { ...input, email: `${randomUUID()}@example.test` });
    providerFailure = true;
    expect((await call("auth.requestRegistrationOtp", undefined, first.cookie)).status).toBe(500);
    const [failed] = await db.select().from(pendingRegistrations).where(eq(pendingRegistrations.email, input.email));
    expect(failed.codeCiphertext).toBeNull();
    providerFailure = false;
    expect((await call("auth.requestRegistrationOtp", undefined, first.cookie)).status).toBe(200);
    const code = lastEmailCode();
    expect((await call("auth.completeRegistration", { code, password: "OwnerPassword123!" }, second.cookie)).status).toBe(400);
    expect((await call("auth.completeRegistration", { code, password: "OwnerPassword123!" })).status).toBe(401);
    expect((await call("auth.cancelRegistration", undefined, first.cookie)).status).toBe(200);
    expect((await call("auth.completeRegistration", { code, password: "OwnerPassword123!" }, first.cookie)).status).toBe(401);
  });
});
