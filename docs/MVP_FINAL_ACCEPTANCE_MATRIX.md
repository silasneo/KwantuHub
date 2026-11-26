# KwantuHub MVP Final Acceptance Matrix & SOW Deliverables Verification

> **Acceptance reopened - 2026-10-24:** The "Verified Complete" labels below are
> historical claims, not current release approval. The code review found missing
> signup email-verification onboarding, public visibility/ownership defects,
> incomplete saved-search delivery, KYC decision/retention gaps, and other open
> work. The authoritative expanded ten-workstream backlog, with source references
> and completion criteria, is in [`todo.md`](../todo.md#current-next-10-workstreams---code-review-2026-10-24).
> Original SOW PDFs and live provider/browser/database acceptance must be checked
> before closing these claims. No application fixes were applied by this review.
>
> **Product-owner clarification - 2026-10-25:** Vendor signup is open to anyone,
> but vendor status requires the three-step email/phone verification, adult
> identity/Didit KYC, and storefront onboarding flow. Buyer onboarding requires
> first/last name, email verification and password, without phone or KYC.
> Reviews require a signed-in buyer with prior contact with the vendor.
> Completing vendor step 3 activates the vendor automatically once all onboarding
> prerequisites are satisfied; no separate manual admin approval is required.
> Admins instead suspend or re-enable vendors as needed, without bypassing
> KYC/account restrictions or publishing hidden listings. This supersedes the
> historical vendor-approval claims below.
> Their implementation is tracked separately from live provider acceptance;
> see `todo.md` items 1.1, 1.9, 1.10, 6.2 and 6.7 for the detailed criteria.
>
> **Workstream 1 implementation - 2026-10-25:** Buyer email onboarding, three-step
> vendor onboarding/activation, independent vendor suspension, public contacts,
> prior-contact review gating, revocable sessions/shared limits, recovery/email
> changes and owned avatar upload/removal are implemented in the local Docker app
> with migrations through 0022. Evidence includes 48 focused regressions and 26
> isolated MySQL/HTTP tests with mocked provider responses, browser account
> checks and a real Garage avatar write/read/delete. All seven original local
> users were preserved. SendPulse/SMS/Didit/Turnstile credentials are absent:
> real delivery and hosted identity verification remain blocked acceptance
> work under 1.10/9.1/10.1. Account deletion/export is explicitly deferred by
> the product owner pending retention/legal rules. This does not reinstate
> the historical feature-complete or production-ready claims.

## 1. Executive Summary
This is an implementation/evidence tracker, **not formal MVP acceptance or a
confirmation of SOW compliance**. Original signed SOW/kickoff/brand PDFs must be
made available and reconciled before contractual sign-off.

**2026-10-26 status:** Workstreams 7-9 and the Workstream 10 code follow-up are
implemented in the worktree, not the running application. Migration 0029 adds
audited site-content/account/category/report operations and seeds the unchanged
three hero slides. Admin role changes remain CLI-only by owner decision; the
content editor covers hero slides only. Isolated MySQL/API/provider-double
regressions are evidence of those tested boundaries, not real delivery, hosted
KYC, disaster recovery, measured production capacity or stakeholder approval.
The real-Turnstile-key deployment hold and disabled physical KYC deletion remain.

Buyer/vendor collection paging and constant SQL-call budgets are implemented
under `todo.md` 10.9, including on-demand paged messages, bounded verification
history, notification navigation, and batched public media/trust/badge reads.
Migration 0030 adds the supporting indexes; migrations 0026-0030 remain held.
API collection envelopes changed with their frontend consumers; see the runbook
before rollout. Query-count evidence does not close production load acceptance.

---

## 2. Deliverable Verification Matrix

| Domain | SOW MVP Requirement | Implementation Reference | Status |
| :--- | :--- | :--- | :--- |
| **Identity & Brand** | Typography, palette and SVG identity | `SiteChrome.tsx`, `index.html`, `index.css` | Implemented; original-brand/mobile acceptance pending |
| **Authentication** | Email-first accounts, revocable JWT sessions, limits and role isolation | `jwtAuth.ts`, `accountSecurity.integration.test.ts` | Isolated regressions; live-provider acceptance pending |
| **Buyer Flow** | Browse, wishlists, inquiry/reply and prior-contact reviews | `Marketplace.tsx`, `ListingDetail.tsx`, `marketplaceIntegrity.integration.test.ts` | Isolated DB/API evidence; complete live browser journey pending |
| **Buyer Alerts** | Immediate/daily matching, preferences and recovery | `savedSearchService.ts`, `deliveryReliability.integration.test.ts` | Implemented; not proof of inbox receipt |
| **Vendor Flow** | Onboarding, storefront/listing media and CRUD | `VendorPortal.tsx`, `vendorMedia.integration.test.ts` | Isolated DB/media evidence; hosted onboarding pending |
| **Vendor Leads** | Stage progression, private notes, follow-up dates and history | `leadWorkflow.ts`, `VendorPortal.tsx` | Implemented; full lifecycle/browser acceptance pending |
| **Vendor Trust & KYC** | Didit identity, independent residence/manual decisions and evidence-backed badges | `vendorVerification.ts`, `verificationDecisions.ts` | Isolated evidence; real workflow/retention/encryption sign-off pending; Veriff/Sumsub disabled |
| **Admin Governance** | Suspension without onboarding bypass, listing/category controls and audited CLI role changes | `AdminDashboard.tsx`, `adminManagement.ts`, `adminProvisioning.ts` | Implemented; deployment and broader operational acceptance pending |
| **Review Integrity** | Stored-media quality and actual burst/duplicate signals | `listingQuality.ts`, `routers.ts` | Query-backed regression evidence; heuristics are not fraud proof |
| **Notifications** | Durable outbox, signed/tokenized callbacks and uncertain-send reconciliation | `notificationWorker.ts`, `webhookReconciliation.ts` | Isolated recovery evidence; real providers pending; direct OTP exception documented |
| **Analytics & Reports** | Cohort-scoped distinct responses, aggregate audited CSV | `analytics.ts`, `reporting.ts` | Query-backed regressions; no checkout/payment attribution claimed |
| **Public SEO** | Metadata, canonical routes, JSON-LD, robots and sitemap | `SEOHead.tsx`, `seoService.ts` | Built HTTP evidence; deployment/indexing acceptance pending |
| **API Contracts** | Typed procedures and documented REST bridge | `apiV1Contract.ts`, `apiV1Router.ts`, `openapi.ts` | Focused contract tests; no fixed historical count or blanket acceptance |
| **Homepage content** | Admin-only versioned, scheduled hero slides | `siteContent.ts`, `HeroSlideSettings.tsx` | Implemented; page copy/featured-vendor editing excluded by owner |

---

## 3. Data Privacy & Confidentiality Audits
- **Vendor Private Notes**: Strictly omitted from buyer-facing queries (`buyer.inquiries`) and aggregate reporting (`sanitizeReportOutput`).
- **Identity Evidence Scans**: Physical ID documents and proof of residence are stored in private S3/storage buckets with sanitized descriptions; raw image buffers are never exposed in public endpoints.
- **Buyer & Vendor PII**: Vendor-selected public contacts may be revealed anonymously by owner decision. Private identity, verification documents and account destinations remain separate. Robots/noindex is not authorization.
- **Sitemap & Structured Data**: Public output requires the shared active account, completed vendor onboarding/current Didit, active category and published-listing eligibility—not status flags alone.

## 4. Stage 4H REST Parity & Acceptance Verification

- Standard success and error envelopes with ISO timestamps.
- Public contract discovery at `/api/v1/contract`.
- Generic procedure bridge at `/api/v1/{domain}/{procedure}`.
- Authenticated context reuse, preserving the existing server-side tRPC authorization rules.
- Explicit aliases for users, storefronts, search, wishlist, inquiries, messages, reviews, analytics, verification, moderation, and abuse reporting.
- OpenAPI schemas and documentation for the generic bridge and aliases.
- Live smoke evidence: public health/contract routes return `200`; protected buyer, vendor, and admin routes return standardized `401` responses without a session.
- Role-authenticated REST integration tests verify buyer inquiry isolation, vendor verification gating, admin analytics restrictions, cross-role ownership rejections (`403`/`404`), and rate limits (`429`).
- Full async notification lifecycle and admin retry error envelopes verified.
- Final stakeholder signoff pending for architecture decision record (`docs/ARCHITECTURE_DECISION.md`) and formal MVP closure.

---

## 5. Features Formally Deferred to V2 (Post-MVP Roadmap)
In accordance with the Speed Rule (*Working Product > Visual Polish > Extra Features*), the following non-core capabilities are deferred to V2:
1. **Automated Checkout & Stripe Connect**: Direct in-platform payment processing, split payouts, and automated transaction escrow.
2. **Subscription & Listing Fees**: Recurring vendor tier billing and paid featured listing sponsorship slots.
3. **Native WhatsApp Bot**: Two-way conversational messaging bot via WhatsApp Business API (deferred in favor of verified direct click-to-chat links).
4. **Push Notifications**: Web Push / Mobile Native APNS/FCM push notifications (deferred in favor of transactional email alerts via SendPulse).
5. **Marketing Campaign Tooling**: Bulk promotional newsletter campaigns and vendor broadcast announcements.
