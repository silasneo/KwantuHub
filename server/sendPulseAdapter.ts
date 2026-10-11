const SENDPULSE_API_BASE = "https://api.sendpulse.com";
const SENDPULSE_TOKEN_URL = `${SENDPULSE_API_BASE}/oauth/access_token`;
const SENDPULSE_EMAIL_URL = `${SENDPULSE_API_BASE}/smtp/emails`;
const REQUEST_TIMEOUT_MS = 10_000;

type SendPulseRecipient = { email: string; name?: string | null };

export type TransactionalEmailMessage = {
  to: SendPulseRecipient[];
  subject: string;
  html: string;
  text: string;
  replyTo?: SendPulseRecipient;
  idempotencyKey: string;
};

type SendPulseConfig = {
  clientId?: string;
  clientSecret?: string;
  apiKey?: string;
  fromEmail?: string;
  fromName: string;
};

type SendPulseToken = { value: string; expiresAt: number };

let cachedToken: SendPulseToken | null = null;

export function getSendPulseConfig(
  env: NodeJS.ProcessEnv = process.env
): SendPulseConfig {
  return {
    clientId: env.SENDPULSE_CLIENT_ID,
    clientSecret: env.SENDPULSE_CLIENT_SECRET,
    apiKey: env.SENDPULSE_API_KEY,
    fromEmail: env.SENDPULSE_FROM_EMAIL,
    fromName: env.SENDPULSE_FROM_NAME || "KwantuHub",
  };
}

export function isSendPulseConfigured(config = getSendPulseConfig()) {
  return Boolean(
    config.fromEmail &&
      (config.apiKey || (config.clientId && config.clientSecret))
  );
}

function encodeHtml(html: string) {
  return Buffer.from(html, "utf8").toString("base64");
}

export function buildSendPulseEmailPayload(
  message: TransactionalEmailMessage,
  config: SendPulseConfig
) {
  return {
    email: {
      html: encodeHtml(message.html),
      text: message.text,
      subject: message.subject,
      from: { name: config.fromName, email: config.fromEmail },
      to: message.to,
      ...(message.replyTo ? { reply_to: message.replyTo } : {}),
    },
  };
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function getAccessToken(config: SendPulseConfig) {
  if (config.apiKey) return config.apiKey;
  if (!config.clientId || !config.clientSecret) {
    throw new Error("SendPulse credentials are not configured");
  }
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.value;
  }

  const response = await fetchWithTimeout(SENDPULSE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });
  if (!response.ok) {
    throw new Error(`SendPulse authorization failed (${response.status})`);
  }
  const body = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!body.access_token) throw new Error("SendPulse authorization returned no token");
  cachedToken = {
    value: body.access_token,
    expiresAt: Date.now() + Math.max(60, body.expires_in || 3600) * 1000,
  };
  return cachedToken.value;
}

export class SendPulseTransactionalEmailAdapter {
  readonly provider = "sendpulse" as const;
  private readonly config: SendPulseConfig;

  constructor(config = getSendPulseConfig()) {
    this.config = config;
  }

  isConfigured() {
    return isSendPulseConfigured(this.config);
  }

  async send(message: TransactionalEmailMessage) {
    if (!this.isConfigured()) {
      throw new Error("SendPulse is not configured");
    }
    const token = await getAccessToken(this.config);
    const response = await fetchWithTimeout(SENDPULSE_EMAIL_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-idempotency-key": message.idempotencyKey,
      },
      body: JSON.stringify(buildSendPulseEmailPayload(message, this.config)),
    });
    if (!response.ok) {
      throw new Error(`SendPulse email request failed (${response.status})`);
    }
    const body = (await response.json()) as {
      id?: string | number;
      result?: boolean;
      message_id?: string | number;
    };
    return {
      providerMessageId: String(body.id ?? body.message_id ?? message.idempotencyKey),
      accepted: body.result !== false,
    };
  }
}

export function resetSendPulseTokenForTests() {
  cachedToken = null;
}
