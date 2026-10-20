# Claude Handover Prompt — KwantuHub MVP SOW, Functional, Security, and UI/UX Audit

Copy everything below this line into Claude after giving it access to the GitHub repository.

---

## Role and mission

You are acting as a senior product architect, full-stack engineer, security reviewer, QA lead, and UX auditor. Review the KwantuHub repository as an independent handover and acceptance audit—not as a greenfield redesign exercise.

Your job is to determine whether the implemented product is fit for the approved KwantuHub MVP Scope of Work (SOW), PRD, brand guide, and technical kickoff brief. Verify the actual code, database schema, API contracts, tests, and UI rather than trusting summary documents or checkbox claims. Identify what is complete, what is partial, what is broken, what is risky, and what should be deferred to V2.

Do not silently rewrite architecture or redesign the product. Do not assume that a passing test suite proves the whole SOW is complete. Distinguish clearly between:

1. **Implemented and verified** — supported by code plus tests or live evidence.
2. **Implemented but not independently verified** — code exists but needs browser, provider, database, or stakeholder confirmation.
3. **Partially implemented** — the happy path exists but important production behavior is missing.
4. **Not implemented** — no credible implementation found.
5. **Deferred to V2** — intentionally outside MVP scope.
6. **Governance/sign-off item** — not a code defect, but requires product-owner approval.

Never print, copy, infer, or commit secret values. Treat all environment values, database URLs, JWT secrets, provider API keys, webhook secrets, and user credentials as confidential. Report only whether a required configuration is present, missing, or unverified.

## Repository and release context

- GitHub repository: `https://github.com/silasneo/KwantuHub`
- Expected release branch: `main`
- Release tag: `v1.3.0`
- Product: **KwantuHub African Diaspora Marketplace**
- Production model: lead-generation and classifieds marketplace, not transactional e-commerce.
- Primary initial audience: African diaspora vendors, service providers, and buyers in North America.
- Target countries for vendor residence verification: United States, Canada, and Mexico.
- Production site/domain currently documented in the project: `https://kwantumkt-lgpadidm.manus.space`
- Swagger UI: `/api-docs`
- Raw OpenAPI document: `/openapi.json`
- Versioned REST compatibility base: `/api/v1/*`
- Live health endpoint: `/api/v1/health`
- Didit production webhook: `/api/webhooks/kyc/didit`

The release is based on the approved architecture decision record in `docs/ARCHITECTURE_DECISION.md`. The original brief contemplated Next.js + Prisma + PostgreSQL. The implemented WebDev application uses React + Vite, Express, tRPC, Drizzle, and MySQL/TiDB. The product requirements and user workflows are the acceptance target; the implementation stack deviation is intentional and requires stakeholder approval, not an automatic defect.

## Source-of-truth priority

Use sources in this order when resolving conflicts:

1. Approved SOW and PRD/project brief.
2. KwantuHub brand guide and approved identity assets.
3. Existing HTML prototype and its marketplace/home layouts.
4. Product-owner decisions recorded in repository/project documents.
5. Implementation and tests in the current `main` branch.
6. README and generated summaries.

If a summary document conflicts with executable code, report the conflict and treat executable behavior as the actual state until confirmed.

## Required first reading

Before making conclusions, inspect these files:

### Product, architecture, operations, and acceptance

- `docs/ARCHITECTURE_DECISION.md`
- `docs/MVP_FINAL_ACCEPTANCE_MATRIX.md`
- `docs/RUNBOOK.md`
- `docs/SEED_DATA_STRATEGY.md`
- `docs/VENDOR_KYC_DECISION.md`
- `docs/KYC_PAYG_EVALUATION.md`
- `docs/DIDIT_SETUP.md`
- `docs/SENDPULSE.md`
- `todo.md`
- `README.md`
- `package.json`
- `drizzle.config.ts`
- `tsconfig.json`

### Frontend entry points and public UI

- `client/src/App.tsx` — route registration and page shells.
- `client/src/index.css` — brand tokens, typography, responsive styles.
- `client/index.html` — default document metadata, fonts, favicon, and social tags.
- `client/src/components/SiteChrome.tsx` — global header/footer, logo, navigation, identity, notification access.
- `client/src/components/SEOHead.tsx` — dynamic title, canonical URL, Open Graph, and JSON-LD helper.
- `client/src/components/TurnstileField.tsx` — Cloudflare Turnstile client widget.
- `client/src/components/ContactVerification.tsx` — buyer/vendor email and phone verification UI.
- `client/src/components/VendorVerificationCenter.tsx` — Didit/manual/vendor verification UI.
- `client/src/components/NotificationCenter.tsx` and `NotificationPreferences.tsx`.
- `client/src/components/SavedSearchesCenter.tsx`.
- `client/src/components/ContactReveal.tsx`.
- `client/src/pages/Home.tsx` — prototype-inspired hero and public landing experience.
- `client/src/pages/Marketplace.tsx` — marketplace masonry layout, search, filters, pagination.
- `client/src/pages/ListingDetail.tsx` — listing details, media carousel, inquiries, reviews, contact reveal, related listings.
- `client/src/pages/VendorDirectory.tsx` — public vendor directory and trust cards.
- `client/src/pages/VendorStorefront.tsx` — vendor storefront, profile, offerings, trust signals, SEO.
- `client/src/pages/LoginPage.tsx` — JWT login/registration and registration bot protection.
- `client/src/pages/BuyerAccount.tsx` — buyer profile, view history, wishlist, inquiries, replies, notifications, saved searches, contact verification.
- `client/src/pages/VendorPortal.tsx` — vendor profile, KYC, storefront/listings, inquiries/leads, analytics, settings.
- `client/src/pages/AdminDashboard.tsx` — admin governance, approvals, moderation, disputes, notification operations, analytics, KYC review, verification queue, review integrity, listing quality, reporting.
- `client/src/pages/LegalPages.tsx` and `SupportPage.tsx` — privacy, terms, abuse reporting, and support.

### Backend and API entry points

- `server/_core/index.ts` — Express startup, middleware order, webhook registration, tRPC, REST, API docs, SEO routes, and worker startup.
- `server/_core/context.ts` — request context and current-user resolution.
- `server/_core/env.ts` — server-only environment mapping. Do not expose values.
- `server/jwtAuth.ts` — password hashing, JWT signing/verifying, cookie/session behavior, public user projection.
- `server/routers.ts` — primary tRPC application contract and server-side permissions.
- `server/db.ts` — database helpers and safe public projections.
- `server/openapi.ts` — OpenAPI/Swagger source.
- `server/apiDocs.ts` — API docs registration.
- `server/apiV1Contract.ts` — versioned REST operation registry.
- `server/apiV1Router.ts` — `/api/v1/*` REST bridge and explicit aliases.
- `server/notificationWorker.ts` — outbox processing, in-app/email delivery, retries, leases, pause, suppression, and retention.
- `server/sendPulseAdapter.ts` — SendPulse transactional email adapter.
- `server/sendPulseWebhook.ts` — SendPulse webhook parsing and delivery state updates.
- `server/diditWebhook.ts` — Didit HMAC webhook verification, replay freshness, idempotency, session updates, and vendor status mapping.
- `server/vendorVerificationAdapters.ts` — provider-neutral adapter contract, Didit, Veriff, Sumsub, and manual provider paths.
- `server/vendorVerification.ts` — verification policy and badge derivation.
- `server/contactVerification.ts` — OTP generation, hashing/encryption, expiration, normalization, and contact verification policy.
- `server/twilioVerify.ts` — Twilio Verify phone OTP adapter.
- `server/abuseProtection.ts` — Turnstile validation, request-IP extraction, and abuse signals.
- `server/analytics.ts` — vendor/admin inquiry funnel reporting.
- `server/vendorTrust.ts` — public trust signals, profile completeness, response quality, activity, and certified badges.
- `server/leadWorkflow.ts` — vendor lead stages, transition rules, and conversion calculations.
- `server/listingQuality.ts` — explainable listing-quality and review-integrity scoring.
- `server/marketplaceReporting.ts` — aggregate-only reporting and CSV generation.
- `server/seoService.ts` — robots.txt and dynamic sitemap helpers.
- `server/savedSearchMatcher.ts` and `server/savedSearchService.ts` — saved-search matching and idempotent alert dispatch.

### Database and migrations

- `drizzle/schema.ts` — authoritative Drizzle/MySQL/TiDB schema.
- `drizzle/relations.ts` — schema relations.
- `drizzle/meta/` — Drizzle migration metadata.
- `drizzle/0000_*.sql` through the latest numbered migration — review migration order and whether production schema changes are represented.

## Product mission and boundaries

KwantuHub is a premium, contemporary African diaspora marketplace. It connects vendors/service providers and buyers; it does not process buyer checkout or vendor payouts in MVP.

### In MVP

- Public homepage and brand story.
- Marketplace discovery, keyword search, category/type/location filters, and pagination.
- Masonry listing cards and sticky/floating filter behavior inspired by the approved HTML prototype.
- Listing detail pages with up to five listing images in a carousel.
- Related listing recommendations.
- Vendor directory cards and vendor-specific storefronts.
- Buyer registration/login, profile, avatar, view history, wishlist, inquiry, replies, contact reveal, reviews, saved searches, and notifications.
- Vendor registration/onboarding, vendor profile, service area, remote availability, storefront, listing CRUD, multi-image uploads, lead management, private notes, follow-up dates, analytics, notifications, and KYC.
- Admin user/category/vendor/listing/review/conversation/dispute governance.
- Vendor identity/contact/residence trust signals and public certified badges.
- Bot and abuse controls: Cloudflare Turnstile, rate limits, duplicate inquiry cooldowns, contact shielding, OTP ownership verification, report/hide/suspend flows.
- Email notifications, outbox worker, provider webhooks, delivery operations, retry, suppression, and email-pause controls.
- Swagger/OpenAPI docs and versioned REST compatibility routes.
- SEO metadata, canonical links, product/store JSON-LD, robots, sitemap, privacy, terms, support, and abuse-reporting paths.

### Explicitly deferred to V2

- Checkout and in-platform payments.
- Stripe Connect, vendor payouts, escrow, subscriptions, and listing fees.
- Native push notifications.
- WhatsApp bot/two-way automation.
- Bulk marketing campaigns/newsletters.
- Any feature that would turn the MVP into a full e-commerce transaction platform.

## Architecture audit requirements

Confirm and report the following:

1. Browser code does not access Drizzle/MySQL/TiDB directly.
2. Frontend requests use tRPC hooks or the documented REST layer, not ad-hoc database access.
3. Protected actions enforce authorization on the server, not merely by hiding buttons.
4. Buyer, vendor, and admin procedures cannot cross-read or mutate each other’s records.
5. JWT authentication uses secure password hashing, httpOnly cookies, sensible expiry, and server-side role checks.
6. Public projections do not expose private email, phone, identity evidence, vendor notes, internal moderation metadata, draft listings, or suspended content.
7. Webhook handlers run before JSON middleware when raw-body verification is required.
8. Database schema changes have generated migrations and have been applied to the managed database.
9. Background delivery work is idempotent, retry-safe, lease-safe, pause-aware, and does not recurse endlessly on remediation failures.
10. The REST bridge delegates to existing authorization semantics rather than creating a weaker second permission system.
11. The architecture ADR clearly records why the Vite/Express/tRPC/Drizzle/MySQL implementation is accepted for this MVP.

## SOW functional audit checklist

### A. Identity, branding, and public UX

- Verify the approved Kwantu identity SVG is used in header/footer/favicon rather than an obsolete raster logo.
- Verify `KwantuHub` wordmark uses the approved Cinzel treatment where appropriate.
- Verify Cormorant Garamond/editorial typography and Inter/sans-serif functional UI usage.
- Verify Kohl Black `#0A0A0A`, Bone White `#F0E8DC`, and terracotta/pink-orange gradient treatment.
- Verify header navigation uses `Marketplace` and `Vendors`; `Our Story` remains footer-only if that is the approved current decision.
- Verify responsive navigation, keyboard focus, contrast, touch targets, loading states, empty states, and errors.
- Compare the homepage, marketplace, listing detail, vendor directory, storefront, and dashboards against the approved prototype rather than proposing an unrelated redesign.

### B. Authentication and contact ownership

- Verify buyer, vendor, and admin role behavior and server-side RBAC.
- Verify registration is protected by Turnstile when configured and does not persist the token as business data.
- Verify email OTP and Twilio Verify phone OTP flows have expiration, resend cooldown, attempt limits, normalized identifiers, and safe error messages.
- Verify missing provider credentials fail safely and do not make the app appear verified.
- Verify protected actions requiring human/contact verification include listing publication, inquiries, reviews, and contact reveal as intended by the current code.
- Confirm account recovery and password-change behavior; if absent, report it as a gap rather than silently adding it.

### C. Marketplace discovery and listings

- Verify published/approved/hidden/draft/archived listing state rules.
- Verify search, keyword, category, product/service type, location, remote availability, verified vendor, price, pagination, and stable sorting.
- Verify listing CRUD is vendor-scoped and image uploads use object storage references, not database blobs.
- Verify up to five media items are supported, ordered, displayed accessibly, and do not leak private storage keys.
- Verify detail pages include vendor context, related listings, inquiries, reviews, contact reveal, and safe structured data.
- Verify public pages do not expose unpublished or suspended listings.

### D. Buyer flows

Walk through the buyer journey as an actual buyer:

1. Register and sign in.
2. Search and filter marketplace listings.
3. Open a listing and carousel through media.
4. Save/unsave a wishlist item.
5. Observe view-history behavior and deduplication window.
6. Submit a protected inquiry.
7. Receive and send replies; verify unread/read state.
8. Resolve, reopen, archive, unarchive, and report a conversation.
9. Reveal vendor contact only after auth, human challenge, rate limit, and verified contact checks.
10. Submit a review only under the implemented eligibility rules.
11. Create, edit, pause, and delete a saved search; verify matching/alert idempotency.
12. Read and mark notifications; change notification preferences.

Record every broken or ambiguous state with route, procedure, user role, reproducible steps, expected behavior, observed behavior, severity, and file reference.

### E. Vendor flows

Walk through the vendor journey:

1. Register/sign in and complete profile.
2. Set service area, remote availability, contacts, storefront description, and standards acknowledgement.
3. Verify email/phone ownership.
4. Start Didit hosted KYC session and confirm only the server creates the session.
5. Open the returned `verificationUrl` and confirm the browser never receives `DIDIT_API_KEY` or `DIDIT_WEBHOOK_SECRET`.
6. Verify Didit webhook statuses update the matching provider session and vendor identity/residence status.
7. Confirm webhook signature, timestamp, idempotency, unsupported-event, unknown-session, and duplicate-event behavior.
8. Confirm manual evidence uses private object storage and vendor-facing responses do not reveal reviewer notes/raw metadata.
9. Create draft listing, upload media, submit/publish with Turnstile, and verify vendor ownership.
10. Manage inquiry replies, unread state, conversation lifecycle, report action, lead stage, private notes, follow-up date, and response funnel.
11. Verify public storefront trust chips only display appropriate approved/certified signals and do not overclaim verification.

### F. Admin and governance flows

Verify admin-only access and audit trails for:

- Vendor approval/rejection/suspension.
- Listing moderation and visibility.
- User suspension/reinstatement/escalation.
- Category management.
- Reviews and integrity signals.
- Conversation reports, hidden/restored messages, disputes, resolution notes, and audit history.
- Verification queue, provider/session/type/reviewer/expiry filters, manual decisions, and sanitized vendor responses.
- Notification delivery summary, failed delivery review, retry, suppression release, webhook event review, and email pause.
- Vendor/admin analytics filters, aggregate privacy, CSV export, and role isolation.

### G. Notifications and webhooks

#### SendPulse

Review:

- `server/sendPulseAdapter.ts`
- `server/sendPulseWebhook.ts`
- `server/notificationWorker.ts`
- notification/outbox/delivery/webhook/suppression schema tables.

Confirm API-key or supported provider authentication is server-only. Confirm failures are bounded/redacted, delivery state is updated from webhook events, suppression prevents sends, failed alerts do not recursively create more alerts, retries are exponential and capped, and admin controls are audited.

Production webhook route currently documented as:

```text
https://kwantumkt-lgpadidm.manus.space/api/webhooks/email/sendpulse
```

#### Didit

Review:

- `server/vendorVerificationAdapters.ts`
- `server/diditWebhook.ts`
- `server/_core/index.ts`
- `client/src/components/VendorVerificationCenter.tsx`
- `docs/DIDIT_SETUP.md`

Production webhook destination:

```text
https://kwantumkt-lgpadidm.manus.space/api/webhooks/kyc/didit
```

Required server-only project secrets:

```text
DIDIT_API_KEY
DIDIT_WORKFLOW_ID
DIDIT_WEBHOOK_SECRET
```

Audit the exact Didit requirements:

- Create session server-side with `x-api-key` and workflow ID in request body.
- Return only the hosted URL/session identifier needed by the browser.
- Verify `X-Signature-V2` using recursive key sorting and the provider’s canonical JSON representation.
- Enforce freshness against the signed body `timestamp`, not an unsigned timestamp header.
- Compare signatures in constant time.
- Deduplicate using a durable unique provider-event constraint.
- Map all relevant Didit statuses: Not Started, In Progress, Awaiting User, In Review, Approved, Declined, Resubmitted, Abandoned, Expired, and Kyc Expired.
- Return promptly and avoid blocking the webhook on unrelated slow work.
- Confirm the provider’s webhook version and subscribed event names match the configured Didit destination.

### H. Analytics and privacy

Verify metrics are:

- Vendor-scoped for vendors.
- Aggregate-only for admins and exports.
- Filterable by date/category/vendor as documented.
- Correct across UTC boundaries and reversed ranges.
- Zero-safe when denominators are empty.
- Not exposing buyer/vendor private notes, raw contact values, identity evidence, or internal audit metadata.

Verify sitemap, robots, JSON-LD, Open Graph, canonical metadata, and public projections exclude private routes and non-public content.

## API and REST audit

Inspect `/api-docs`, `/openapi.json`, `server/openapi.ts`, `server/apiV1Contract.ts`, and `server/apiV1Router.ts`.

Confirm:

- `/api/v1/health` is public and returns a standard success envelope.
- `/api/v1/contract` accurately describes the currently implemented registry.
- Generic bridge routes and explicit aliases agree on method, auth, input, status, and envelope behavior.
- Success responses are consistent and include timestamps where documented.
- Invalid input returns 400; missing auth returns 401; forbidden role/ownership returns 403; missing resources return 404; unsupported methods return 405; rate-limited operations return 429.
- Authenticated REST routes reuse JWT cookie context and existing tRPC authorization.
- Buyer/vendor/admin cross-role isolation is tested against real HTTP behavior.
- OpenAPI does not claim endpoints or fields that the router does not implement.
- Didit and SendPulse webhook contracts are documented separately from authenticated client APIs.

## Database and migration audit

Review every table in `drizzle/schema.ts`, including at minimum:

- `users`
- `vendorProfiles`
- `storefronts`
- `categories`
- `listings`
- `listingMedia`
- `wishlists`
- `listingViews`
- `inquiries`
- `messages`
- `reviews`
- `analyticsEvents`
- `conversationReports`
- `disputes`
- `moderationRecords`
- `notificationPreferences`
- `notifications`
- `notificationOutbox`
- `notificationDeliveries`
- `notificationWebhookEvents`
- `notificationSuppressions`
- `systemSettings`
- `savedSearches`
- `savedSearchMatches`
- `verificationChallenges`
- `vendorVerificationSessions`
- `vendorVerificationEvidence`
- `abuseSignals`
- `inquiryLeadHistory`

For each table, check primary key, foreign keys, delete behavior, enum/status values, uniqueness constraints, indexes, timestamps, and whether the migration history matches the current schema. Look specifically for race conditions in duplicate prevention, webhook idempotency, outbox processing, and review/report deduplication.

Do not apply schema changes during this audit. If you identify a schema issue, describe the migration needed and its compatibility risk separately.

## Environment and secret handling audit

The project uses WebDev project secret settings; do not expect committed `.env` files. The central names are mapped in `server/_core/env.ts`.

### Core runtime configuration

- `DATABASE_URL`
- `JWT_SECRET`
- `OWNER_OPEN_ID`
- `OWNER_NAME`
- `APP_URL`

### SendPulse server-only configuration

- `SENDPULSE_CLIENT_ID`
- `SENDPULSE_CLIENT_SECRET`
- `SENDPULSE_API_KEY`
- `SENDPULSE_API_BASE_URL`
- `SENDPULSE_API_FROM_EMAIL` or `SENDPULSE_FROM_EMAIL`
- `SENDPULSE_API_FROM_NAME` or `SENDPULSE_FROM_NAME`
- `SENDPULSE_WEBHOOK_TOKEN` or `SENDPULSE_WEBHOOK_SECRET`

### Cloudflare Turnstile

- `TURNSTILE_SECRET_KEY`
- `VITE_TURNSTILE_SITE_KEY`
- `TURNSTILE_EXPECTED_HOSTNAME`

### Twilio Verify

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_VERIFY_SERVICE_SID`

### Didit

- `DIDIT_API_KEY`
- `DIDIT_WORKFLOW_ID`
- `DIDIT_WEBHOOK_SECRET`

### Legacy/alternative KYC providers

Inspect `server/vendorVerificationAdapters.ts` and environment mapping before concluding whether these are enabled:

- Veriff API credentials.
- Sumsub app token/secret.

Never print values. Test configuration by safe presence checks or provider adapters’ `isConfigured()` behavior. Do not send a paid or production KYC verification session unless the product owner explicitly authorizes that test.

## Test and build procedure

From the repository root, run:

```bash
pnpm install
pnpm run check
pnpm test
pnpm run build
git diff --check
```

The expected release baseline at handover is approximately 98 passing tests across 26 test files. Treat the exact count as a diagnostic, not as the acceptance criterion: inspect what the tests actually cover.

Review test files including:

- `server/acceptanceMatrix.test.ts`
- `server/apiV1.test.ts`
- `server/apiV1Http.test.ts`
- `server/apiV1LiveAcceptance.test.ts`
- `server/apiV1RoleAuth.test.ts`
- `server/apiV1AsyncNotificationLifecycle.test.ts`
- `server/privacyAudit.test.ts`
- `server/diditWebhook.test.ts`
- `server/vendorVerification.test.ts`
- `server/contactVerification.test.ts`
- `server/notificationWorker.test.ts`
- `server/sendPulseAdapter.test.ts`
- `server/sendPulseWebhook.test.ts`
- `server/sendPulseWebhook.integration.test.ts`
- `server/analytics.test.ts`
- `server/vendorTrust.test.ts`
- `server/leadWorkflow.test.ts`
- `server/listingQuality.test.ts`
- `server/savedSearchMatcher.test.ts`
- `server/savedSearchService.test.ts`
- `server/seoService.test.ts`
- `server/openapi.test.ts`

If the environment cannot run a test because credentials, database, or provider access is unavailable, label it **not executed** rather than passing it by inspection.

## UI/UX audit procedure

Use the live preview or run the app locally. Check desktop and mobile widths. For each public page and portal, record:

- Visual fit with brand guide and approved prototype.
- Hierarchy and readability.
- Navigation clarity and escape routes.
- Responsive layout and touch targets.
- Keyboard/focus behavior.
- Screen-reader semantics and labels.
- Empty/loading/error/success states.
- Form validation and actionable errors.
- Whether destructive or irreversible actions have adequate confirmation.
- Whether provider flows explain consent, privacy, waiting time, and next steps.
- Whether trust badges explain what was actually verified without making unsupported claims.

Do not judge the app against generic modern SaaS conventions if the approved KwantuHub design intentionally uses an editorial marketplace aesthetic. Evaluate whether the design is fit for purpose, accessible, trustworthy, and consistent.

## Required audit output from Claude

Return a structured report with these sections:

1. **Executive verdict** — `Ready`, `Ready with non-blocking fixes`, or `Not ready`.
2. **Repository/release identity** — branch, commit, tag, and whether code reviewed matches the deployed build.
3. **SOW traceability matrix** — every SOW requirement mapped to implementation files, test evidence, and status.
4. **Architecture assessment** — confirm or challenge the Vite/Express/tRPC/Drizzle/MySQL deviation with concrete reasons.
5. **Buyer workflow audit** — step-by-step results.
6. **Vendor workflow audit** — step-by-step results, including Didit.
7. **Admin governance audit** — authorization and moderation results.
8. **UI/UX and brand assessment** — page-by-page findings with severity.
9. **Security and privacy assessment** — auth, RBAC, secrets, PII, uploads, rate limits, webhooks, and abuse controls.
10. **Database/migration assessment** — schema quality and migration consistency.
11. **API/OpenAPI/REST assessment** — parity and envelope results.
12. **Email/notification/KYC provider assessment** — configuration, webhook readiness, failure handling, and what was not live-tested.
13. **Critical blockers** — only true release blockers, with reproduction and recommended fix.
14. **High/medium/low priority findings** — separate from blockers.
15. **Missing evidence or tests** — clearly identify what could not be executed.
16. **Recommended next 10 tasks** — prioritize by user impact and risk; do not invent V2 scope as MVP defects.
17. **Final acceptance recommendation** — approve, conditionally approve, or reject, with explicit rationale.

For every finding use this format:

```text
ID: KH-###
Severity: Blocker | High | Medium | Low | Observation
Domain: SOW domain / UI / security / API / data / operations
Status: Confirmed | Suspected | Not executed
Evidence: file path, route, test name, or reproducible steps
Expected:
Observed:
Impact:
Recommendation:
```

End with a concise release decision and a separate list of any stakeholder decisions still required. Do not close a finding merely because it appears in a documentation checkbox. Do not recommend a full framework/database migration unless you demonstrate a concrete product, operational, compliance, or performance requirement that the current architecture cannot meet.
