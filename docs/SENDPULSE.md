# SendPulse integration

KwantuHub uses SendPulse for transactional email delivery through the SendPulse REST API.

## Server configuration

Set these values in the WebDev project’s **server-side secrets**. Never use a `VITE_` prefix and never commit secret values.

```text
SENDPULSE_API_KEY=your-sendpulse-api-key
SENDPULSE_API_FROM_EMAIL=devtest@sendpulseemail.com
SENDPULSE_API_FROM_NAME=KwantuHub
SENDPULSE_API_BASE_URL=https://api.sendpulse.com
SENDPULSE_WEBHOOK_TOKEN=your-random-webhook-token
```

`SENDPULSE_FROM_EMAIL` and `SENDPULSE_FROM_NAME` remain accepted as backward-compatible aliases. `SENDPULSE_CLIENT_ID` and `SENDPULSE_CLIENT_SECRET` are also supported for OAuth access-token authentication, but API-key authentication is the recommended setup for this integration.

### SMTP Test plan

New SendPulse accounts may start on the SMTP Test plan. `devtest@sendpulseemail.com` is the pre-verified sender for that plan. SendPulse may override the visible sender to `SP test <devtest@sendpulseemail.com>` and prepend `For development purposes only:` to the subject. This is expected test-plan behavior.

The test plan is limited and should not be treated as production capacity. After verifying a sender/domain, replace the test sender with your own verified sender. An unverified sender on Free or paid plans can produce HTTP 422 errors.

## API operations

The server-only adapter implements:

- `POST /smtp/emails` with `Authorization: Bearer <SENDPULSE_API_KEY>`.
- `GET /user/info` through `verifyAuth()` for credential verification.
- Configurable API base URL through `SENDPULSE_API_BASE_URL`.
- Request timeouts, clear non-2xx provider errors, and idempotency headers for sends.

Verify credentials without sending an email:

```bash
pnpm sendpulse:verify
```

The CLI sends a test message only when explicitly requested with `--send-test` and `SENDPULSE_TEST_RECIPIENT`:

```bash
SENDPULSE_TEST_RECIPIENT=you@example.com pnpm sendpulse:verify --send-test
```

The outbox worker calls the adapter only after checking user preferences and active suppression records. When SendPulse is not configured, in-app notifications continue to work and email delivery remains queued for later configuration.

## SMTP webhook configuration

SendPulse SMTP webhooks are unsigned JSON POST requests and do not provide an HMAC signature header. Configure the webhook URL using the opaque token:

```text
https://kwantumkt-lgpadidm.manus.space/api/webhooks/email/sendpulse?token=<SENDPULSE_WEBHOOK_TOKEN>
```

The handler accepts both a single event object and SendPulse’s documented array payload. It records every event in `notificationWebhookEvents`, updates matching `notificationDeliveries`, and handles:

- `delivered` → delivered
- `undelivered`, `soft_bounces` → failed
- `hard_bounces` → bounced plus active hard-bounce suppression
- `spam_by_user` → complained plus complaint suppression
- `unsubscribed` → complained plus unsubscribe suppression
- `opened`, `clicked`, `resubscribed` → logged and ignored for delivery-state mutation

Events are idempotent by provider and provider event ID. Duplicate events return HTTP 200 without repeating state changes.

## Operational alerts

For failed, bounced, complained, or unsubscribed events:

1. The delivery record stores provider event type, message ID, provider timestamp, failure reason, and raw provider payload.
2. A vendor recipient receives an in-app/email `email_address_action_required` alert with a profile action link.
3. Active administrators receive an `email_delivery_alert` notification linking to the delivery-operations dashboard.
4. Suppression is applied before any future SendPulse send to the affected email address.

## Safe verification

The repository contains unit and staging-payload tests. A live credential verification can be run by calling the adapter’s `verifyAuth()` method in a server-only context; do not send a test message until the sender and recipient are approved.
