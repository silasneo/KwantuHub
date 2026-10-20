import { ENV } from "./_core/env";

const TWILIO_VERIFY_BASE = "https://verify.twilio.com/v2/Services";

type TwilioConfig = {
  accountSid: string;
  authToken: string;
  serviceSid: string;
};

export function getTwilioVerifyConfig(env: NodeJS.ProcessEnv = process.env): TwilioConfig {
  return {
    accountSid: env.TWILIO_ACCOUNT_SID || "",
    authToken: env.TWILIO_AUTH_TOKEN || "",
    serviceSid: env.TWILIO_VERIFY_SERVICE_SID || "",
  };
}

export function isTwilioVerifyConfigured(config = getTwilioVerifyConfig()) {
  return Boolean(config.accountSid && config.authToken && config.serviceSid);
}

async function twilioRequest(config: TwilioConfig, path: string, body: Record<string, string>) {
  const response = await fetch(`${TWILIO_VERIFY_BASE}/${config.serviceSid}${path}`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
  });
  const payload = (await response.json()) as { message?: string; status?: string; sid?: string };
  if (!response.ok) throw new Error(payload.message || `Twilio Verify failed (${response.status})`);
  return payload;
}

export async function startPhoneVerification(phone: string) {
  const config = getTwilioVerifyConfig();
  if (!isTwilioVerifyConfigured(config)) throw new Error("Phone verification is not configured");
  return twilioRequest(config, "/Verifications", { To: phone, Channel: "sms" });
}

export async function checkPhoneVerification(phone: string, code: string) {
  const config = getTwilioVerifyConfig();
  if (!isTwilioVerifyConfigured(config)) throw new Error("Phone verification is not configured");
  return twilioRequest(config, "/VerificationCheck", { To: phone, Code: code });
}

export function phoneVerificationConfigured() {
  return isTwilioVerifyConfigured({
    accountSid: ENV.twilioAccountSid,
    authToken: ENV.twilioAuthToken,
    serviceSid: ENV.twilioVerifyServiceSid,
  });
}
