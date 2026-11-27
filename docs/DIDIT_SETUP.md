# Production origins and provider cutover

This guide describes required operator configuration, **not evidence of provider
acceptance**. Credentials existing in `.env` do not prove dashboard settings,
delivery, hosted verification, SMS, or HTTPS cookies work. Never paste secrets,
tokens, KYC evidence, or full provider responses into logs or acceptance reports.

## Canonical deployment origin

Set `APP_URL=https://<your-production-domain>` to the public HTTPS **origin**
(no subpath, credentials, query, or fragment). Configure the reverse proxy and
DNS/TLS for that origin before starting production. Only trusted proxy addresses
belong in `TRUST_PROXY`; do not blindly trust forwarded headers.

Public canonical routes are `/marketplace`, `/vendors`, `/vendors/<slug>`,
`/listings/<slug>`, and `/about`. `/story`, `/vendor/<slug>` (excluding the
vendor onboarding workspace), and `/storefronts/<slug>` redirect permanently.
`/vendor` remains the private vendor workspace. Robots, sitemap, and server HTML
use `APP_URL`, not the incoming Host header. Public listing/storefront metadata
uses the same publication eligibility policy as discovery and never records
view analytics. Missing/ineligible public content returns HTTP 404 and noindex;
temporary metadata/database failures return 503, not false 404s. Private pages
and `?preview` responses use noindex/no-store and omit public structured data.

## Didit

Configure these server-only values:

- `DIDIT_API_KEY`
- `DIDIT_WORKFLOW_ID`
- `DIDIT_WEBHOOK_SECRET` matching the actual webhook destination

In the Didit dashboard, configure the destination:

```text
https://<your-production-domain>/api/webhooks/kyc/didit
```

Remove obsolete Manus destinations after cutover; do not use ephemeral preview
URLs for production. Confirm workflow version, subscribed decision events and
signing configuration against the current provider console/documentation.
The app validates signed, fresh webhook payloads and associates decisions with
the account's verification session; provider status is not a substitute for
ownership, session provenance, current decision evidence, or expiry checks.

**External acceptance still required:** create an approved test session using
the provider's approved testing process, follow the real hosted flow, verify the
signed callback and replay/stale rejection, and inspect application audit/status
updates. Record timestamp and redacted delivery/session identifiers, not personal
documents or complete payloads. No test run should silently initiate real KYC.

## Cloudflare Turnstile

Production requires:

```text
TURNSTILE_MODE=enforced
TURNSTILE_SECRET_KEY=<server secret>
VITE_TURNSTILE_SITE_KEY=<public site key for the same widget>
TURNSTILE_EXPECTED_HOSTNAME=<your-production-domain>
```

Add the exact production hostname to the widget's allowed hosts. Rebuild the
client after changing `VITE_TURNSTILE_SITE_KEY`; it is a build-time value.
The expected hostname must exactly match `APP_URL`'s hostname. Production startup
rejects missing secrets/site keys, documented dummy keys, disabled protection,
and mismatched origins. Verification requires provider success, exact expected
action and hostname; missing claims, subdomains, dummy hostnames, network failure,
invalid JSON and provider errors are rejected. Requests use a bounded timeout.

Local development and isolated tests may explicitly set `TURNSTILE_MODE=disabled`.
Missing credentials alone **never** enable a bypass. The example environment
uses disabled mode for local setup and must be changed before production.

**External acceptance still required:** build with the actual widget key and
complete login/registration/inquiry actions on the HTTPS deployment. Verify a
valid challenge works and replayed, expired, missing, wrong-action and wrong-host
tokens fail; repeat after client navigation and token expiration.

## SendPulse and Twilio

Configure the real sender identity, SendPulse authorization credentials and the
webhook destination on the production origin:

```text
https://<your-production-domain>/api/webhooks/email/sendpulse
```

Confirm the configured webhook authentication token and provider dashboard
event subscriptions. For SMS configure `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
and `TWILIO_VERIFY_SERVICE_SID`; configure enabled SMS countries through the
administrator policy, not by assuming every calling code is supported.

**External acceptance still required:** sender/domain acceptance, authenticated
delivery/bounce callbacks, one operator-approved email, one approved SMS verify
journey in a supported country, suppression handling, and provider-down/retry
behaviour. Unit mocks do not prove any of these. Automated tests must not send to
configured live providers.

## Authentication and operational sign-off

Verify Secure/HttpOnly/SameSite cookies over the actual HTTPS origin, trusted
proxy forwarding, login/logout, email verification and password-reset links.
Record deployment commit/build, origin, redacted provider identifiers and
observed results. Until these checks are performed, task **8.6 remains an external
deployment acceptance gate**.

Legacy `system.notifyOwner` is explicitly disabled with `PRECONDITION_FAILED`
(REST 412) and makes no Forge network request. Marketplace notifications continue
through the owned inbox/outbox implementation. Other unused `_core` Forge helpers
and map template source are not configured runtime dependencies; production
startup requires no Manus/Forge secrets. Do not wire them into marketplace code.
