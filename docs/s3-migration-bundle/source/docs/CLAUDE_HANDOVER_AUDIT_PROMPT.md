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


## Portability audit and complete Manus-dependency removal checklist

The next engineering objective is to make KwantuHub deployable on any conventional Node host, VPS, Docker host, AWS environment, Vercel-style serverless platform, or Netlify-style functions platform without depending on Manus Forge, Manus storage URLs, Manus-only runtime tooling, or the Manus domain. Treat this as a portability workstream, not as permission to change the marketplace product scope.

The desired end state is a provider-neutral application with the following boundaries:

```text
React/Vite browser
        |
        v
Express/tRPC or REST API
        |
        +--> MySQL-compatible database through Drizzle
        +--> S3-compatible object storage through a storage adapter
        +--> SendPulse transactional email
        +--> Twilio Verify phone OTP
        +--> Cloudflare Turnstile
        +--> Didit hosted KYC and webhook
        +--> Optional independent maps/AI provider adapters
```

The application must not require a Manus account, Manus OAuth, Manus Forge URL, Manus Forge API key, `/manus-storage/*`, a `*.manus.space` domain, or a Manus-specific Vite plugin to build, start, authenticate users, serve public assets, process notifications, or connect to its database.

### Portability status categories

For every item below, Claude must classify the item as `Removed`, `Replaced`, `Retained as optional development tooling`, `Not applicable`, or `Still a hard dependency`. Do not delete a file solely because its name contains `Manus`; first confirm whether it is active runtime code, a legacy template, a test fixture, or a useful optional module. Update imports, tests, documentation, deployment configuration, and seed data together so the repository cannot build successfully while still pointing at a missing provider.

### 1. Storage adapter and object URL migration — mandatory

Replace the current Forge implementation in `server/storage.ts`. Create a provider-neutral adapter, preferably `server/storageProvider.ts`, with the same conceptual operations:

```ts
putObject(input): Promise<{ key: string; url?: string }>;
getPublicUrl(key): string;
getSignedDownloadUrl(key, expiresInSeconds): Promise<string>;
deleteObject(key): Promise<void>;
headObject(key): Promise<{ exists: boolean; size?: number; contentType?: string }>;
```

Use `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`, which are already listed in `package.json`. The adapter must support AWS S3 and S3-compatible providers such as Cloudflare R2, MinIO, DigitalOcean Spaces, and Backblaze B2. Keep storage keys provider-neutral and stable. Never store a provider-specific URL in the database. Use UUID-based keys rather than original filenames, for example:

```text
listings/{listingId}/{uuid}.webp
vendors/{vendorId}/logo/{uuid}.webp
vendors/{vendorId}/cover/{uuid}.webp
verification/{sessionId}/{uuid}.pdf
```

Modify:

- `server/storage.ts` — replace Forge presigning and `/manus-storage` output with the generic adapter or make this file a compatibility facade over the new adapter.
- `server/_core/storageProxy.ts` — remove the Forge proxy, or replace it with a provider-neutral `/media/*` route that resolves public objects through the configured CDN/base URL. Do not use a proxy for private KYC evidence unless it performs authorization and short-lived signing.
- `server/_core/env.ts` — remove `BUILT_IN_FORGE_API_URL` and `BUILT_IN_FORGE_API_KEY` from storage logic and add the S3 variables listed in the env template below.
- `server/_core/index.ts` — remove `registerStorageProxy` if a CDN/public URL strategy is used; otherwise register only the provider-neutral media route.
- `server/routers.ts` — change media validation from `/manus-storage/` references to stable object keys or the configured public media URL. Add an authenticated upload/presign procedure where needed, enforce owner/admin authorization, file limits, MIME allowlists, and object-key prefixes.
- `drizzle/schema.ts` — ensure `listingMedia` stores `storageKey`, stable metadata, visibility, content type, size, and optional checksum; it should not require a Manus URL. Ensure `vendorVerificationEvidence.fileStoragePath` stores only a private object key.
- `drizzle/relations.ts` — update relations if media metadata tables are added.
- All relevant numbered migrations — add a non-destructive migration for any new storage metadata or visibility columns. Do not rewrite historical migrations that may already be applied in production.
- Add `server/storageProvider.test.ts` — test deterministic key generation, path traversal rejection, MIME/size limits, signed/private versus public behavior, endpoint/path-style handling, and provider error redaction.
- Add a storage migration/health script — verify every database-referenced object exists before switching providers and produce a report without exposing private evidence contents.

For manual KYC evidence, fail closed: if the object upload fails, do not create the database evidence row. Store only the private key and sanitized metadata. Generate a short-lived signed download URL only after an authorized admin request. Respect `retentionExpiresAt` and delete or tombstone expired evidence.

### 2. Migrate existing Manus assets and hardcoded URLs — mandatory

Search the entire repository for `manus-storage`, `manus.space`, `BUILT_IN_FORGE`, `forgeApi`, and `kwantumkt-lgpadidm`. Replace every active production reference.

Modify or migrate:

- `server/seed.ts` — replace `/manus-storage/...` seed references with stable S3 keys or deployment-independent public media URLs. Add an idempotent asset migration/seed step rather than leaving seed records pointing to unavailable Manus objects.
- `client/src/components/SiteChrome.tsx` — replace the Manus-hosted identity mark with a stable public asset URL or a small repository-owned SVG in `client/public/`.
- `client/src/pages/Home.tsx` — replace all Manus-hosted hero and story images with migrated keys/CDN URLs.
- `client/src/pages/LoginPage.tsx` — replace the Manus-hosted identity asset.
- `client/index.html` — replace hardcoded Manus Open Graph/canonical URLs with `${APP_URL}` at build/deployment time or server-rendered metadata strategy.
- `client/src/components/SEOHead.tsx` — derive canonical/OG URLs from deployment configuration or a server-provided public base URL; never default production metadata to Manus.
- `server/seoService.ts` — remove the hardcoded Manus base URL from robots and sitemap generation. Require `APP_URL` in production and allow localhost only in development.
- `server/db.ts` and public projection helpers — return stable public media URLs through the storage adapter; never expose private storage keys or raw verification paths.
- `server/privacyAudit.test.ts`, `server/seoService.test.ts`, API privacy tests, and any snapshot fixtures — assert that no Manus URL or private storage key appears in public responses.

Keep object keys unchanged during migration wherever possible. Copy objects from the old provider to the new bucket, preserve logical keys, update only the adapter/CDN origin, and verify object existence before cutover. If existing keys contain a Manus-specific prefix, create a one-time mapping/migration table or deterministic rewrite and update all database references in one controlled migration.

### 3. Remove Manus-only development/runtime tooling — mandatory for independent builds

Modify:

- `vite.config.ts` — remove `vitePluginManusRuntime()` from the production plugin list. Keep the custom debug collector only behind an explicit development flag, or remove it and use the target platform’s logs. Remove Manus-specific `allowedHosts` entries and replace them with `APP_ALLOWED_HOSTS` or a deployment-safe configuration.
- `package.json` — remove `vite-plugin-manus-runtime` if no longer used. Add portable scripts such as `worker`, `db:migrate`, `db:check`, and `storage:check` where appropriate.
- `pnpm-lock.yaml` — regenerate after dependency removal/addition.
- `client/public/__manus__/debug-collector.js` and `client/public/__manus__/version.json` — remove if they are not required by the chosen deployment platform.
- `.manus-logs/` and any related ignore/config files — remove Manus-only log handling; use stdout/stderr, the VPS supervisor, Docker logs, or the target provider’s logging system.
- Any test or build scripts that expect `__manus__` endpoints — replace them with platform-neutral health/logging tests.

The normal production command should be portable:

```bash
pnpm run build
pnpm run start
```

No production startup command should require a Manus CLI, Manus browser, Manus-specific filesystem mount, or Manus environment injection.

### 4. Remove legacy Manus OAuth/template coupling — mandatory review

The active product uses JWT email/password authentication. Review and either remove or isolate the legacy template files:

- `server/_core/oauth.ts`
- `server/_core/sdk.ts`
- `server/_core/types/manusTypes.ts`
- Any unused OAuth callback registration or route references.
- `shared/const.ts` OAuth state helpers, if no longer referenced by active authentication.
- `server/_core/env.ts` fields such as `oAuthServerUrl`, `appId`, and any owner/open-ID fields that exist solely for legacy template behavior.
- Any `OAUTH_SERVER_URL`, `VITE_APP_ID`, Manus OAuth portal, or OAuth callback documentation.
- Authentication tests that assume Manus OAuth.

Do not remove the internal `users.openId` column without a migration plan. It may still be used as a legacy/internal stable identifier by existing data. Either document it as an internal legacy identifier or introduce a neutral `externalId`/`userKey` column and migrate references safely.

Confirm that JWT authentication remains independent:

```text
server/jwtAuth.ts
server/_core/context.ts
server/routers.ts auth procedures
bcrypt/bcryptjs password hashing
httpOnly secure session cookie
```

### 5. Replace or remove Manus built-in service modules — conditional by usage

Audit imports before changing these files:

- `server/_core/dataApi.ts`
- `server/_core/imageGeneration.ts`
- `server/_core/llm.ts`
- `server/_core/map.ts`
- `server/_core/notification.ts`
- `server/_core/voiceTranscription.ts`
- `server/_core/heartbeat.ts`

If an active feature imports one of them, replace the implementation with an independent provider adapter and neutral environment variables. If no production code imports it, remove it or clearly mark it as optional template code. The application must not fail to start because `BUILT_IN_FORGE_API_URL` or `BUILT_IN_FORGE_API_KEY` is absent.

For maps, replace `client/src/components/Map.tsx` Forge proxy usage with a direct provider-neutral map strategy, such as a server-side Google Maps proxy with `GOOGLE_MAPS_API_KEY`, Mapbox, MapLibre, or a no-map fallback. Do not expose a server-only map key in the browser.

For AI, voice, image generation, data APIs, and owner notifications, do not retain a hidden Manus fallback. Use a clear optional adapter and a clear disabled/unconfigured state.

### 6. Replace Manus domain defaults and deployment URLs — mandatory

Modify:

- `server/_core/env.ts` — make `APP_URL` the source of truth.
- `server/seoService.ts` — use `APP_URL` for sitemap/robots.
- `client/src/components/SEOHead.tsx` — use the configured public URL.
- `client/index.html` — replace fixed Open Graph URLs.
- `docs/DIDIT_SETUP.md` — replace the production webhook example with the new domain during deployment.
- `docs/SENDPULSE.md` — replace the SendPulse webhook URL and token instructions with the new domain.
- `docs/RUNBOOK.md` — update health checks, webhook destinations, storage, database, and incident procedures.
- `docs/ARCHITECTURE_DECISION.md`, `docs/MVP_FINAL_ACCEPTANCE_MATRIX.md`, `docs/SEED_DATA_STRATEGY.md`, and this handover note — distinguish historical Manus deployment facts from the portable target architecture.

Production should fail configuration validation if `APP_URL` is absent or still points to a Manus domain. Development may use `http://localhost:3000`.

### 7. Make the notification worker portable — mandatory for serverless deployment

The current worker starts inside the Express process through `server/_core/index.ts` and `server/notificationWorker.ts`. This is suitable for a persistent VPS, Docker container, or long-running Node service but is not reliable on Vercel/Netlify serverless functions.

Modify or add:

- `server/notificationWorker.ts` — preserve lease locks, retries, idempotency, pause state, suppression checks, and retention cleanup.
- `server/worker.ts` — add a standalone worker entry point for Docker/VPS/ECS execution.
- `server/_core/index.ts` — make in-process worker startup optional and disabled when an external worker mode is configured.
- `package.json` — add `pnpm run worker` and document `WORKER_MODE=external|embedded`.
- Add a scheduled/serverless worker handler if Vercel/Netlify is a target. It must claim jobs with durable leases and return within platform execution limits.
- `docs/RUNBOOK.md` — document both persistent-worker and serverless-scheduled-worker operation.
- Worker integration tests — verify two workers cannot process the same lease, crashed leases recover, and provider failures remain bounded.

For Vercel or Netlify, use a remote MySQL-compatible database, remote S3 storage, and a scheduled function or external worker. Dockerized MySQL and a persistent worker are more appropriate for a VPS or Docker host.

### 8. Add portable Docker deployment files — recommended for VPS and local development

Add these files; do not commit real secrets:

- `Dockerfile` — multi-stage Node build, production-only runtime dependencies, non-root user, health check, and `pnpm run start`.
- `docker-compose.yml` — application, worker, and optional MySQL services. Use named volumes for MySQL data; never use the application container filesystem for uploads.
- `.dockerignore` — exclude `.git`, `node_modules`, `dist`, `.manus-logs`, local env files, screenshots, and test artifacts.
- `docker/mysql/init/` — optional initialization scripts only if needed; prefer Drizzle migrations for schema changes.
- `scripts/docker-entrypoint.sh` or equivalent — wait for the database, run safe migrations, then start the selected process. Do not run destructive reset commands in production.
- `docs/DEPLOYMENT.md` — document Docker/VPS, managed database, Vercel, and Netlify profiles.
- `docs/RUNBOOK.md` — add container health, logs, backup, restore, worker restart, and object-storage procedures.

Use Docker MySQL for local development, staging, and a VPS if operationally appropriate. Do not run a stateful MySQL container inside Vercel or Netlify. Those platforms need an external managed database.

### 9. Update tests, CI, and deployment verification — mandatory

Modify or add:

- `server/storageProvider.test.ts`
- `server/apiV1Http.test.ts`
- `server/apiV1LiveAcceptance.test.ts`
- `server/privacyAudit.test.ts`
- `server/seoService.test.ts`
- `server/diditWebhook.test.ts`
- `server/sendPulseWebhook.test.ts`
- `server/notificationWorker.test.ts`
- `server/acceptanceMatrix.test.ts`
- Add a portable `server/config.test.ts` for missing/invalid production configuration.
- Add a deployment smoke test that starts the production build without Manus variables.
- Add a storage migration verification test that confirms stable keys and URLs across two configured storage providers.
- Add CI workflow files under `.github/workflows/` to run type checking, tests, build, migration validation, and `git diff --check`.

Required negative assertions:

- Build/start succeeds without Manus Forge variables.
- No public response contains `/manus-storage/`, `manus.space`, Forge URLs, raw S3 credentials, private evidence keys, or internal provider metadata.
- No private evidence is publicly downloadable.
- `APP_URL` controls canonical, sitemap, robots, webhook documentation/configuration, and email links.
- The REST and tRPC contracts remain behaviorally equivalent after storage/provider replacement.

### 10. Documentation and repository cleanup — mandatory

Update all active references in:

- `README.md`
- `todo.md`
- `docs/ARCHITECTURE_DECISION.md`
- `docs/MVP_FINAL_ACCEPTANCE_MATRIX.md`
- `docs/RUNBOOK.md`
- `docs/DIDIT_SETUP.md`
- `docs/SENDPULSE.md`
- `docs/SEED_DATA_STRATEGY.md`
- `docs/VENDOR_KYC_DECISION.md`
- `docs/KYC_PAYG_EVALUATION.md`
- `docs/CLAUDE_HANDOVER_AUDIT_PROMPT.md`
- `server/apiDocs.ts` and `server/openapi.ts` where URLs or server assumptions are documented.

Add `docs/DEPLOYMENT.md` with explicit profiles:

1. Manus WebDev compatibility, if retained temporarily.
2. Docker Compose on VPS with MySQL and a persistent worker.
3. Vercel/Netlify frontend/API with external MySQL, S3, and scheduled/external worker.
4. AWS deployment with S3, RDS/Aurora MySQL, ECS/EC2/Lambda as appropriate.

## Portable environment template for the handover

Add a committed placeholder-only `.env.example` at the repository root. Never put real values in it. Keep server-only secrets unprefixed; only browser-safe Vite values may use `VITE_`. The following template covers the current external dependencies and the portable replacements. Remove unused sections only after verifying that the corresponding feature is not active.

```dotenv
# ============================================================
# KwantuHub portable deployment environment template
# Copy to .env locally; never commit .env or real secret values.
# Server-only values have no VITE_ prefix.
# ============================================================

# -----------------------------
# Application/runtime
# -----------------------------
NODE_ENV=development
PORT=3000
APP_URL=http://localhost:3000
APP_ALLOWED_HOSTS=localhost,127.0.0.1
COOKIE_DOMAIN=
COOKIE_SECURE=false
JWT_SECRET=replace-with-a-long-random-production-secret

# -----------------------------
# MySQL/TiDB-compatible database
# -----------------------------
# Primary application connection used by Drizzle.
DATABASE_URL=mysql://kwantuhub:replace-password@127.0.0.1:3306/kwantuhub
DB_POOL_SIZE=10
DB_CONNECT_TIMEOUT_MS=10000

# Optional Docker Compose MySQL variables.
MYSQL_DATABASE=kwantuhub
MYSQL_USER=kwantuhub
MYSQL_PASSWORD=replace-with-local-password
MYSQL_ROOT_PASSWORD=replace-with-local-root-password
MYSQL_HOST=mysql
MYSQL_PORT=3306

# -----------------------------
# AWS S3 or S3-compatible object storage
# -----------------------------
AWS_REGION=us-east-1
AWS_S3_BUCKET=kwantuhub-assets
AWS_ACCESS_KEY_ID=replace-with-server-side-access-key
AWS_SECRET_ACCESS_KEY=replace-with-server-side-secret-key
# Optional for Cloudflare R2, MinIO, DigitalOcean Spaces, etc.
AWS_S3_ENDPOINT=
AWS_S3_FORCE_PATH_STYLE=false
AWS_S3_PUBLIC_BASE_URL=https://cdn.example.com
AWS_S3_SIGNED_URL_TTL_SECONDS=300
AWS_S3_UPLOAD_PREFIX=kwantuhub
# Optional AWS KMS key; leave empty when provider-managed encryption is used.
AWS_S3_KMS_KEY_ID=

# -----------------------------
# Public/browser-safe configuration
# -----------------------------
VITE_APP_TITLE=KwantuHub Marketplace
VITE_TURNSTILE_SITE_KEY=replace-with-public-turnstile-site-key
# Only use this if a client-side map implementation requires a restricted key.
VITE_PUBLIC_MAPS_KEY=

# -----------------------------
# Cloudflare Turnstile bot protection
# -----------------------------
TURNSTILE_SECRET_KEY=replace-with-server-side-turnstile-secret
TURNSTILE_EXPECTED_HOSTNAME=localhost

# -----------------------------
# Twilio Verify phone OTP
# -----------------------------
TWILIO_ACCOUNT_SID=replace-with-twilio-account-sid
TWILIO_AUTH_TOKEN=replace-with-twilio-auth-token
TWILIO_VERIFY_SERVICE_SID=replace-with-twilio-verify-service-sid

# -----------------------------
# Didit hosted KYC
# -----------------------------
DIDIT_API_KEY=replace-with-didit-api-key
DIDIT_WORKFLOW_ID=replace-with-didit-workflow-id
DIDIT_WEBHOOK_SECRET=replace-with-didit-webhook-secret
DIDIT_API_BASE_URL=https://verification.didit.me
DIDIT_WEBHOOK_MAX_AGE_SECONDS=300

# -----------------------------
# SendPulse transactional email
# -----------------------------
SENDPULSE_API_KEY=replace-with-sendpulse-api-key
SENDPULSE_API_BASE_URL=https://api.sendpulse.com
SENDPULSE_API_FROM_EMAIL=verified-sender@example.com
SENDPULSE_API_FROM_NAME=KwantuHub
SENDPULSE_WEBHOOK_TOKEN=replace-with-long-random-webhook-token
# OAuth aliases are optional if API-key mode is not used.
SENDPULSE_CLIENT_ID=
SENDPULSE_CLIENT_SECRET=

# -----------------------------
# Optional direct email fallback
# -----------------------------
# Use only if an independent SMTP/transactional adapter is implemented.
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM_EMAIL=
SMTP_FROM_NAME=KwantuHub

# -----------------------------
# Optional maps provider
# -----------------------------
MAPS_PROVIDER=none
GOOGLE_MAPS_API_KEY=
MAPBOX_ACCESS_TOKEN=

# -----------------------------
# Optional AI/voice/image providers
# -----------------------------
# These replace unused Manus Forge modules only if those features are retained.
LLM_PROVIDER=none
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
IMAGE_PROVIDER=none
IMAGE_API_KEY=
VOICE_PROVIDER=none
VOICE_API_KEY=
DATA_API_PROVIDER=none
DATA_API_KEY=

# -----------------------------
# Worker and operational behavior
# -----------------------------
WORKER_MODE=external
WORKER_POLL_INTERVAL_MS=5000
WORKER_BATCH_SIZE=20
WORKER_LEASE_SECONDS=120
NOTIFICATION_RETENTION_DAYS=90
STORAGE_HEALTHCHECK_ON_STARTUP=true

# -----------------------------
# Optional observability
# -----------------------------
LOG_LEVEL=info
SENTRY_DSN=
OTEL_EXPORTER_OTLP_ENDPOINT=
OTEL_EXPORTER_OTLP_HEADERS=
```

Claude must compare this template against the actual variables read in `server/_core/env.ts` and any provider adapter. Do not blindly add unused variables to runtime code. If a variable is renamed, provide a backward-compatible migration path or update all deployment documentation and secrets at the same time.

## Portability acceptance criteria

Do not consider the Manus-removal work complete until all of the following are demonstrated:

1. `pnpm install`, `pnpm run check`, `pnpm test`, and `pnpm run build` pass with no Manus-specific secrets.
2. The production server starts with only the portable environment variables and a reachable MySQL-compatible database.
3. A Docker Compose profile starts MySQL, runs migrations, starts the API, and starts the worker without Manus services.
4. A fresh S3-compatible bucket can receive listing media and private evidence using stable keys.
5. Existing objects can be copied to a replacement bucket without changing database keys or public application URLs.
6. Public listing media works through the configured CDN/base URL; private evidence requires authorized short-lived signing.
7. Didit and SendPulse webhooks work against the new `APP_URL` and reject invalid signatures/tokens.
8. JWT login, all role permissions, REST aliases, tRPC procedures, notifications, KYC, and admin operations continue to work.
9. No response, HTML metadata, seed fixture, log, or documentation path silently depends on `manus.space`, `/manus-storage/`, Forge, Manus OAuth, or `vite-plugin-manus-runtime`.
10. The application can be deployed using a conventional VPS/Docker path and a serverless-compatible path, with the worker architecture explicitly documented for each.

The final Claude report must include a file-by-file portability diff summary, a list of files deleted, a list of files added, environment-variable migration notes, object-storage migration risks, database/Docker deployment risks, and a recommendation on whether Vercel/Netlify is appropriate for the current worker architecture.
