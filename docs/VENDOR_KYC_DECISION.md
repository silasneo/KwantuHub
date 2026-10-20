# KwantuHub — Vendor KYC & North America Verification Decision Record

**Document ID:** ADR-004-VENDOR-KYC-NA  
**Status:** Approved  
**Date:** October 2026  
**Scope:** Stage 4B / 4C Vendor Identity, Liveness, and Residence Verification

---

## 1. Context & Business Need

KwantuHub connects African diaspora creators, service providers, and buyers across North America (United States, Canada, and Mexico). To safeguard buyers, prevent fraudulent storefronts, and issue certified badges:
1. Vendor contact details (email and phone) must be verified via OTP.
2. Vendor government identity and photo match must be verified.
3. Vendor residence in the US, Canada, or Mexico must be verified through official address documentation or biometric document issuance country.

---

## 2. Provider Evaluation & Pricing Matrix

| Provider | Per-Verification Pricing | US Support | Canada Support | Mexico Support | Proof-of-Address | Decision |
|---|---|---|---|---|---|---|
| **Veriff** | ~$1.25 – $1.49 / session | Full | Full | Full (CURP/INE, Passport) | Yes (Document & Utility extraction) | **Primary Adapter** (Best North America coverage & developer API) |
| **Sumsub** | ~$1.35 – $1.50 / check | Full | Full | Full (RFC, INE, Passport) | Yes (Automated utility/bank review) | **Secondary Adapter** (Fallback for enterprise volume) |
| **Stripe Identity** | $1.50 / verification | Full | Full | Partial (Stripe Connect marketplace onboarding restrictions in MX) | Limited manual utility check | **Deferred** (Stripe Connect marketplace deferred to V2 per SOW) |

### Key Decision: Stripe Mexico Marketplace Eligibility
Per KwantuHub SOW Section 3, full-blown payment processing and Stripe Connect marketplace payouts are explicitly deferred to V2. Relying on Stripe Identity would couple identity verification to Stripe payment accounts which are subject to different cross-border marketplace restrictions for Mexico-domiciled sole proprietors. Therefore, **Veriff is selected as primary** for standalone provider-neutral KYC, with **Sumsub retained as alternative**, and a **secure manual review fallback** for non-biometric applicants.

---

## 3. Privacy & Data Minimization Rules

1. **Biometric Media & Raw Documents:** Private evidence files are stored in isolated encrypted object storage (`/evidence/{sessionId}/*`) accessible only to authorized administrators during the review window.
2. **Redacted Summaries:** Vendor profiles and public directory views only expose sanitized document summaries (e.g. `UTILITY BILL [.pdf]`) and derived trust badges (`Contact verified`, `Identity verified`, `North America residence verified`).
3. **Retention Policy:** Verification evidence documents are marked for scheduled deletion after **90 days** (`retentionExpiresAt`), preserving only the audit decision record and badge issuance timestamp.
4. **Vendor Session Privacy:** Vendor-facing endpoints return only session status, country code, created date, and badge summaries. Internal reviewer notes, provider raw payloads, and internal IDs are withheld from vendor view.
