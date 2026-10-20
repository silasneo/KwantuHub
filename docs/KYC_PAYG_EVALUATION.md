# KwantuHub — Small-Business KYC Provider Switch: Didit vs. KYCAID

**Document ID:** ADR-005-PAYG-KYC-SWITCH  
**Status:** Recommended for Implementation  
**Date:** October 2026  
**Context:** Replace high-commitment enterprise vendors (Veriff / Sumsub) with startup-friendly, zero-minimum pay-as-you-go providers.

---

## 1. Why Switch Away from Veriff / Sumsub?

- **Veriff:** Imposes enterprise minimum monthly commitments (often $300 – $500+/month) regardless of onboarding volume, which creates unnecessary overhead for early-stage marketplaces.
- **Sumsub:** Similarly requires monthly minimum spend tiers or enterprise sales contracts.
- **Goal for KwantuHub:** Zero monthly fixed commitment, instant self-serve onboarding, low per-check cost, and verified coverage for vendors in the **United States, Canada, and Mexico**.

---

## 2. Comparison: Didit vs. KYCAID

| Dimension | **Didit** (`didit.me`) | **KYCAID** (`kycaid.com`) |
|---|---|---|
| **Free Tier / Allowance** | **500 free full KYC checks every month, forever** (no credit card needed to start) | **€50 welcome credit upon registration** (approx. 80–100 checks) |
| **Pay-As-You-Go Cost** | **$0.33 per full KYC check** (or $0.15 ID + $0.10 liveness) | **€0.75 per full check** (€0.50 Document + €0.25 Liveness) |
| **Proof of Address / Residence** | **$0.20 per utility/document check** | **€0.25 per address check** |
| **Monthly Minimum** | **$0** (Strictly zero minimums or contracts) | **€0** (Strictly zero monthly minimum) |
| **North America Coverage** | Full (US Passports/DL, Canadian Passports/DL, Mexico INE/IFE/CURP/Passport) across 220+ countries | Full (US, Canada, Mexico) across 240+ countries |
| **Hosted Flow & Redirect** | Yes, simple `POST /v3/session/` returns hosted `url` for mobile/desktop | Yes, hosted verification forms via Customer Portal / Webhook |
| **Developer API & Documentation** | Excellent Mintlify-hosted API, modern REST endpoints, standard `x-api-key` header, HMAC webhooks | Standard REST API, API token header, webhook callbacks |
| **Marketplace Fit for KwantuHub** | **Superior** (500 free checks/mo covers KwantuHub's entire early vendor onboarding phase at $0) | **Good alternative** (€50 welcome credit, then €0.75/check) |

---

## 3. Recommendation

**Adopt Didit as KwantuHub's Primary KYC Adapter:**
1. **Zero Cost During Launch:** The permanent 500 free full KYC checks per month will easily cover KwantuHub’s initial North American vendor onboarding without incurring recurring bills.
2. **Transparent Scaling:** Once KwantuHub grows past 500 vendor onboarding checks in a calendar month, subsequent checks are only **$0.33 per full check** with no monthly baseline commitment.
3. **Clean Architecture:** `POST https://verification.didit.me/v3/session/` with `x-api-key` returns a hosted verification URL that vendors can complete on any phone or desktop browser. Webhook callbacks notify KwantuHub of approval/rejection.
4. **Retain KYCAID & Manual Review as Secondary Fallbacks:** The provider-neutral adapter architecture in `server/vendorVerificationAdapters.ts` can switch seamlessly between Didit, KYCAID, and manual document review.

---

## 4. Required Runtime Environment Variables for Didit

When you sign up at [business.didit.me](https://business.didit.me/):
1. Create a Workflow in the console (e.g., ID Verification + Liveness + Face Match).
2. Grab your API Key and Workflow ID.
3. Configure the following in the project secret settings:
   - `DIDIT_API_KEY`: API key from the Business Console.
   - `DIDIT_WORKFLOW_ID`: Workflow UUID for vendor KYC.
   - `DIDIT_WEBHOOK_SECRET`: (Optional) HMAC secret for webhook signature verification.
