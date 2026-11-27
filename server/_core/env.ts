export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  s3Endpoint: process.env.S3_ENDPOINT ?? "",
  s3Region: process.env.S3_REGION ?? "us-east-1",
  s3Bucket: process.env.S3_BUCKET ?? "",
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  s3ForcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  publicMediaBaseUrl: process.env.PUBLIC_MEDIA_BASE_URL ?? "/media",
  sendPulseClientId: process.env.SENDPULSE_CLIENT_ID ?? "",
  sendPulseClientSecret: process.env.SENDPULSE_CLIENT_SECRET ?? "",
  sendPulseApiKey: process.env.SENDPULSE_API_KEY ?? "",
  sendPulseApiBaseUrl:
    process.env.SENDPULSE_API_BASE_URL ?? "https://api.sendpulse.com",
  sendPulseFromEmail:
    process.env.SENDPULSE_API_FROM_EMAIL ??
    process.env.SENDPULSE_FROM_EMAIL ??
    "",
  sendPulseFromName:
    process.env.SENDPULSE_API_FROM_NAME ??
    process.env.SENDPULSE_FROM_NAME ??
    "KwantuHub",
  sendPulseWebhookToken:
    process.env.SENDPULSE_WEBHOOK_TOKEN ??
    process.env.SENDPULSE_WEBHOOK_SECRET ??
    "",
  turnstileSecret: process.env.TURNSTILE_SECRET_KEY ?? "",
  turnstileSiteKey: process.env.VITE_TURNSTILE_SITE_KEY ?? "",
  turnstileExpectedHostname: process.env.TURNSTILE_EXPECTED_HOSTNAME ?? "",
  turnstileMode: process.env.TURNSTILE_MODE ?? "enforced",
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN ?? "",
  twilioVerifyServiceSid: process.env.TWILIO_VERIFY_SERVICE_SID ?? "",
  diditApiKey: process.env.DIDIT_API_KEY ?? "",
  diditWorkflowId: process.env.DIDIT_WORKFLOW_ID ?? "",
  diditWebhookSecret: process.env.DIDIT_WEBHOOK_SECRET ?? "",
  appUrl:
    process.env.APP_URL ?? `http://localhost:${process.env.PORT ?? "3000"}`,
};

export function assertServerConfiguration() {
  assertTurnstileConfiguration();
  assertRuntimeConfiguration();
}

export function assertRuntimeConfiguration() {
  if (process.env.NODE_ENV !== "production") return;
  const missing = [
    !process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32
      ? "JWT_SECRET (at least 32 characters)"
      : "",
    !ENV.databaseUrl ? "DATABASE_URL" : "",
    !ENV.s3Endpoint ? "S3_ENDPOINT" : "",
    !ENV.s3Bucket ? "S3_BUCKET" : "",
    !ENV.s3AccessKeyId ? "S3_ACCESS_KEY_ID" : "",
    !ENV.s3SecretAccessKey ? "S3_SECRET_ACCESS_KEY" : "",
    !isHttpsOrigin(ENV.appUrl) ? "APP_URL (public HTTPS origin)" : "",
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(
      `Missing required production configuration: ${missing.join(", ")}`
    );
  }
}

function isHttpsOrigin(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password &&
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

/** Cloudflare test secrets return placeholder hostname and no action metadata. */
export const isTurnstileTestKey = (value: string) =>
  /^[123]x0{10,}/i.test(value);

export function assertTurnstileConfiguration() {
  const production = process.env.NODE_ENV === "production";
  const mode = ENV.turnstileMode;
  if (!["enforced", "disabled"].includes(mode))
    throw new Error("TURNSTILE_MODE must be enforced or disabled.");
  if (mode === "disabled") {
    if (production)
      throw new Error("TURNSTILE_MODE cannot be disabled in production.");
    return;
  }
  // Owner-approved: Cloudflare test credentials are temporarily accepted until real keys are configured.
  if (!ENV.turnstileSecret || (production && !ENV.turnstileSiteKey)) {
    throw new Error(
      "Turnstile enforcement requires TURNSTILE_SECRET_KEY and production VITE_TURNSTILE_SITE_KEY."
    );
  }
  if (production && !isTurnstileTestKey(ENV.turnstileSecret)) {
    let hostname = "";
    try {
      hostname = new URL(ENV.appUrl).hostname;
    } catch {
      /* validated below */
    }
    if (
      !ENV.turnstileExpectedHostname ||
      ENV.turnstileExpectedHostname !== hostname ||
      !isHttpsOrigin(ENV.appUrl)
    ) {
      throw new Error(
        "TURNSTILE_EXPECTED_HOSTNAME must match the public HTTPS APP_URL hostname."
      );
    }
  }
}
