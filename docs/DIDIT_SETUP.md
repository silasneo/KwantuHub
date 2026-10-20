# Didit KYC Integration & Webhook Guide for KwantuHub

**Document ID:** DOC-KYC-DIDIT-SETUP  
**Updated:** October 2026  
**Status:** Live on KwantuHub

---

## 1. Webhook Destination URL

When creating a webhook destination in the **Didit Business Console** (`https://business.didit.me` → **API & Webhooks** → **Add Destination**), enter:

### Production URL (KwantuHub Live Permanent Domain)
```text
https://kwantumkt-lgpadidm.manus.space/api/webhooks/kyc/didit
```

### Dev / Preview URL (Current active development port)
```text
https://3000-inbybxr6nnjqu3jlamnsv-e56237f1.us1.manus.computer/api/webhooks/kyc/didit
```

> **Important:** Always use the permanent **`https://kwantumkt-lgpadidm.manus.space/api/webhooks/kyc/didit`** for your primary Didit destination so production deliveries remain stable across sessions.

---

## 2. Webhook Settings in Didit Console

- **Webhook Version:** `v3`
- **Subscribed Events:**
  - `status.updated` (required)
  - `data.updated` (optional/recommended)
- **Security:** Didit generates a `secret_shared_key`. Copy this value and add it as `DIDIT_WEBHOOK_SECRET` in KwantuHub project secrets.
- **Firewall Notice:** Didit sends deliveries from egress IP `18.203.201.92` with User-Agent `DiditWebhook/2.0 (+https://didit.me)`.

---

## 3. Environment Variables to Set in WebDev Project Settings

Configure these three server secrets (never exposed to the browser):

1. **`DIDIT_API_KEY`**: Your long-lived API key from Didit Console → API & Webhooks.
2. **`DIDIT_WORKFLOW_ID`**: The UUID of your KYC workflow (e.g., `5ceb7f19-dbda-473f-bd71-854094a400cd` from your Didit console).
3. **`DIDIT_WEBHOOK_SECRET`**: The signing secret from the webhook destination created above.

---

## 4. How the Flow Operates in KwantuHub

1. **Vendor Initiates Verification:** The vendor selects "Didit Hosted KYC" under Vendor Portal → Profile → Verification Center and clicks **Begin Verification Session**.
2. **Session Creation:** KwantuHub calls `POST https://verification.didit.me/v3/session/` with your `DIDIT_WORKFLOW_ID` and returns a hosted `verificationUrl`.
3. **Hosted UI:** The hosted Didit verification screen opens in a new tab where the vendor captures their government ID and completes liveness.
4. **Webhook Decision:** Didit signs the payload with HMAC-SHA256 (`X-Signature-V2`) and posts to `/api/webhooks/kyc/didit`.
5. **Badge Issuance:** KwantuHub verifies the signature, enforces 300s freshness, records the audit event, maps the decision (`Approved` → `verified`), updates the vendor profile, and activates the public trust badges.
