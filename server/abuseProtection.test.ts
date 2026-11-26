import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ENV,
  assertServerConfiguration,
  assertRuntimeConfiguration,
  assertTurnstileConfiguration,
} from "./_core/env";
import { isTurnstileConfigured, verifyTurnstile } from "./abuseProtection";

const original = { ...ENV };
beforeEach(() => {
  Object.assign(ENV, {
    turnstileMode: "enforced",
    turnstileSecret: "real-secret",
    turnstileSiteKey: "real-sitekey",
    turnstileExpectedHostname: "market.example",
    appUrl: "https://market.example",
  });
  vi.stubEnv("NODE_ENV", "production");
});
afterEach(() => {
  Object.assign(ENV, original);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function provider(body: unknown, ok = true) {
  const request = vi.fn().mockResolvedValue({ ok, json: async () => body });
  vi.stubGlobal("fetch", request);
  return request;
}

describe("fail-closed Turnstile", () => {
  it("requires explicit local disabled mode, never a production bypass", async () => {
    Object.assign(ENV, { turnstileMode: "disabled", turnstileSecret: "" });
    const request = provider({});
    expect(isTurnstileConfigured()).toBe(true);
    expect((await verifyTurnstile(undefined)).success).toBe(false);
    expect(() => assertTurnstileConfiguration()).toThrow("disabled");
    vi.stubEnv("NODE_ENV", "test");
    expect(isTurnstileConfigured()).toBe(false);
    expect(await verifyTurnstile(undefined)).toMatchObject({
      configured: false,
      success: true,
    });
    expect(request).not.toHaveBeenCalled();
  });
  it("rejects a missing secret even outside production unless explicitly disabled", async () => {
    ENV.turnstileSecret = "";
    vi.stubEnv("NODE_ENV", "development");
    expect((await verifyTurnstile("token")).success).toBe(false);
    expect(() => assertTurnstileConfiguration()).toThrow("requires");
  });
  it("temporarily accepts Cloudflare test keys but rejects missing hostname configuration", () => {
    ENV.turnstileSecret = "1x0000000000000000000000000000000AA";
    ENV.turnstileSiteKey = "1x00000000000000000000AA";
    ENV.turnstileExpectedHostname = "another.example";
    expect(() => assertTurnstileConfiguration()).not.toThrow();
    ENV.turnstileSecret = "real-secret";
    ENV.turnstileSiteKey = "real-sitekey";
    ENV.turnstileExpectedHostname = "";
    expect(() => assertTurnstileConfiguration()).toThrow("hostname");
    ENV.turnstileExpectedHostname = "another.example";
    expect(() => assertTurnstileConfiguration()).toThrow("hostname");
  });
  it.each(["register", "password_reset"])("accepts test-provider success without action metadata for %s", async action => {
    ENV.turnstileSecret = "1x0000000000000000000000000000000AA";
    ENV.turnstileSiteKey = "1x00000000000000000000AA";
    provider({ success: true, hostname: "example.com", "error-codes": [] });
    expect(await verifyTurnstile("XXXX.DUMMY.TOKEN.XXXX", { action })).toMatchObject({
      configured: true, success: true,
    });
  });
  it("still requires a token and provider success with test keys", async () => {
    ENV.turnstileSecret = "1x0000000000000000000000000000000AA";
    const request = provider({ success: false, "error-codes": ["invalid-input-response"] });
    expect((await verifyTurnstile(undefined, { action: "register" })).success).toBe(false);
    expect(request).not.toHaveBeenCalled();
    expect((await verifyTurnstile("invalid-token", { action: "register" })).success).toBe(false);
    expect(request).toHaveBeenCalledOnce();
  });
  it("validates production startup without requiring Manus or Forge secrets", () => {
    Object.assign(ENV, {
      databaseUrl: "mysql://local/test",
      s3Endpoint: "http://storage.test:3900",
      s3Bucket: "media",
      s3AccessKeyId: "local-id",
      s3SecretAccessKey: "local-secret",
      forgeApiUrl: "",
      forgeApiKey: "",
      oAuthServerUrl: "",
      appId: "",
      ownerOpenId: "",
    });
    vi.stubEnv("JWT_SECRET", "isolated-test-signing-key-32-characters");
    expect(() => assertServerConfiguration()).not.toThrow();
    for (const appUrl of [
      "http://market.example",
      "https://market.example/subpath",
      "https://user:pass@market.example",
      "https://localhost",
    ]) {
      ENV.appUrl = appUrl;
      expect(() => assertServerConfiguration()).toThrow();
    }
  });
  it("keeps private-worker runtime checks independent without bypassing public-server bot protection", () => {
    Object.assign(ENV, {
      databaseUrl: "mysql://local/test", s3Endpoint: "http://storage.test:3900", s3Bucket: "media",
      s3AccessKeyId: "local-id", s3SecretAccessKey: "local-secret", turnstileSecret: "", turnstileSiteKey: "",
    });
    vi.stubEnv("JWT_SECRET", "isolated-test-signing-key-32-characters");
    expect(() => assertRuntimeConfiguration()).not.toThrow();
    expect(() => assertServerConfiguration()).toThrow("Turnstile");
    ENV.databaseUrl = "";
    expect(() => assertRuntimeConfiguration()).toThrow("DATABASE_URL");
  });
  it.each([
    { success: true, hostname: "market.example" },
    { success: true, hostname: "market.example", action: "login" },
    { success: true, action: "register" },
    ...[
      "example.com",
      "localhost",
      "127.0.0.1",
      "sub.market.example",
      "evilmarket.example",
    ].map(hostname => ({ success: true, action: "register", hostname })),
    { success: false, hostname: "market.example", action: "register" },
  ])("rejects incomplete or mismatched provider result %j", async body => {
    provider(body);
    expect(
      (await verifyTurnstile("token", { action: "register" })).success
    ).toBe(false);
  });
  it("accepts only exact expected action and hostname after provider success", async () => {
    const request = provider({
      success: true,
      hostname: "market.example",
      action: "register",
    });
    expect(
      (
        await verifyTurnstile("token", {
          action: "register",
          remoteIp: "127.0.0.1",
        })
      ).success
    ).toBe(true);
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
  it.each(["timeout", "non-json", "http"])(
    "fails closed on provider %s failure",
    async failure => {
      const request = provider({}, failure !== "http");
      if (failure === "timeout")
        request.mockRejectedValue(new Error("private provider diagnostic"));
      if (failure === "non-json")
        request.mockResolvedValue({
          ok: true,
          json: async () => {
            throw new Error("invalid json");
          },
        });
      await expect(
        verifyTurnstile("token", { action: "register" })
      ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    }
  );
  it("cannot override the configured production hostname or omit an expected action", async () => {
    provider({ success: true, hostname: "evil.example", action: "register" });
    expect(
      (
        await verifyTurnstile("token", {
          action: "register",
          hostname: "evil.example",
        })
      ).success
    ).toBe(false);
    expect(await verifyTurnstile("token")).toMatchObject({
      success: false,
      codes: ["missing-expected-action"],
    });
  });
});
