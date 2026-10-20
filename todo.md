# KwantuHub Release Status

## Completed in this release

- [x] Correct approved Kwantu identity mark and Cinzel wordmark in header/footer; add favicon assets.
- [x] Replace Services navigation with Vendors directory and vendor-specific storefront pages.
- [x] Replace Manus OAuth with scoped JWT email/password authentication using bcrypt and httpOnly cookies.
- [x] Add avatar/profile navigation, buyer account, vendor portal, and admin control room.
- [x] Bring over prototype hero/vendor imagery and the masonry marketplace with sticky filters.
- [x] Add expandable header search for keyword, category, location, and price-filtered discovery.
- [x] Add listing image carousel support for up to five media URLs and related listing recommendations.
- [x] Add public `Show Contact` CTA with vendor-configurable phone, WhatsApp, iMessage, Instagram, and email channels.
- [x] Add anonymous/authenticated reveal analytics with bounded rate limiting and session attribution.
- [x] Add buyer settings/security, vendor contact settings/analytics/reviews, and admin governance tabs.
- [x] Add category visibility controls, user/listing moderation, feature flags, and dispute governance.
- [x] Add public feature-flagged mega-menu structure, disabled by default via `mega_menu_enabled`.
- [x] Extend Drizzle schema and managed DB with analytics fields, reviews, contact channels, feature flags, and disputes.
- [x] Update Swagger/OpenAPI coverage for all current auth, marketplace, buyer, vendor, and admin procedures.
- [x] Remove user-facing Maker/Manus wording and verify password hashes are not exposed in review responses.
- [x] Complete Stage 1 Buyer Flow: verified marketplace filters (Price, Verified, Remote), recently viewed history, wishlist persistence, and rating/review submission.

## Stage 2 — Inquiry & Vendor Response MVP

- [x] Add bidirectional buyer/vendor replies with server-side ownership checks.
- [x] Add buyer/vendor inquiry resolution controls and closed-conversation reply protection.
- [x] Add buyer/vendor portal controls for replies and resolution status.
- [x] Add participant-scoped unread counts, mark-read mutations, and buyer/vendor portal unread indicators.
- [x] Document new inquiry reply/resolution procedures in Swagger/OpenAPI.
- [x] Add unit coverage for inquiry status policy.

## Stage 3A — Notifications

- [x] Add notification preferences, in-app notifications, outbox, and delivery tables.
- [x] Generate and apply Drizzle migration `0005_dashing_sir_ram.sql`.
- [x] Verify the four notification tables and indexes in the managed database.
- [x] Pass type check, 9 unit tests, production build, and diff validation.
- [x] Add protected notification inbox, unread-count, mark-read, mark-all-read, and preference procedures.
- [x] Add cursor-based backward pagination, notification-type filtering, and unread counts to `notifications.list`.
- [x] Add idempotent inquiry notification event enqueueing for create, reply, and resolution flows.
- [x] Wire vendor approval/rejection and review moderation notification events into administrative decision actions.
- [x] Add retry-safe outbox worker with in-app fan-out and queued email delivery records.
- [x] Document notification procedures in Swagger/OpenAPI and add worker policy tests.
- [x] Integrate the server-only SendPulse adapter with OAuth/API-key auth, token caching, timeouts, and provider delivery status updates.
- [x] Add SendPulse payload/configuration tests without issuing live email sends.

## Stage 3B — Notification Operations & UX

- [x] Add provider lifecycle metadata to notification deliveries.
- [x] Add worker lease and attempt-tracking fields to the notification outbox.
- [x] Add idempotent `notificationWebhookEvents` storage.
- [x] Add `notificationSuppressions` storage for bounce, complaint, unsubscribe, and manual blocks.
- [x] Generate and apply Drizzle migration `0006_wandering_centennial.sql`.
- [x] Verify Stage 3B tables, columns, indexes, type check, 15 tests, production build, and diff validation.
- [x] Add SendPulse-compatible unsigned batch webhook endpoint with opaque URL-token protection, idempotent event storage, and delivery-state mapping.
- [x] Add active suppression checks before transactional email sends.
- [x] Add shared branded notification bell and notification-center panels to buyer/vendor experiences.
- [x] Add webhook mapping tests; pass type check, 17 tests, production build, and diff validation.
- [x] Add admin notification delivery summary, recent-attempt review, retry controls, webhook events, and suppression views.
- [x] Add admin controls and audited procedures to requeue failed/dead outbox items, release active suppressions with reasons, and toggle a platform-wide transactional email delivery pause switch (`systemSettings.email_delivery_paused`).
- [x] Harden outbox worker with automatic lock-lease recovery, random lock tokens, pause-safe queueing, operational batch counters, and scheduled retention cleanup (`purgeExpiredNotificationData`).
- [x] Replace buyer legacy notification toggles with normalized preference controls and add the same controls to the vendor profile portal.
- [x] Add staging-payload integration tests for SendPulse delivery and suppression mappings.

## Stage 3C — Provider Alerting & Remediation

- [x] Add `email_address_action_required` and `email_delivery_alert` notification types.
- [x] Notify vendors when hard bounces, complaints, unsubscribes, or delivery failures require email-address action.
- [x] Notify active administrators of SendPulse delivery failures with a link to delivery operations.
- [x] Log provider event type, message ID, normalized recipient, failure reason, and idempotency key in webhook and delivery records.
- [x] Generate and apply Drizzle migration `0007_workable_luckman.sql`.
- [x] Add alert-policy tests and preserve suppression enforcement before future email sends.
- [x] Complete API-key integration compatibility: `POST /smtp/emails`, `GET /user/info`, configurable base URL, clear provider errors, and opt-in verification CLI.
- [x] Complete an authenticated inquiry-to-outbox-to-SendPulse webhook test: inquiry `30001`, delivery `2`, provider message `tmreuz-1ff8b5-e5`, `undelivered` callback processed and delivery marked `failed`.
- [x] Prevent failed vendor/admin remediation alerts from recursively generating additional remediation alerts.

## Stage 3B — Conversation Quality & Lifecycle: pending

- [x] Add reopen inquiry for buyer and vendor participants with server-side ownership checks.
- [x] Add explicit conversation state/participant context for awaiting buyer, awaiting vendor, and resolved conversations.
- [x] Add archived inquiry state, participant archive/unarchive procedures, and archive UI.
- [x] Add lifecycle UI labels and reopen controls to buyer/vendor portals, OpenAPI coverage, and unit tests (23 tests passing).
- [x] Add relative timestamps and first-response-time measurement for inquiry messages.
- [x] Add optional participant archive controls without deleting conversation history.
- [x] Prevent duplicate buyer/listing inquiries within a configurable cooldown window.
- [x] Add inquiry creation rate limiting and abuse-safe validation with clear errors.
- [x] Add report-conversation flow for buyers and vendors with moderation records.
- [x] Add OpenAPI coverage, migrations `0008_pretty_omega_sentinel.sql`, `0009_narrow_ricochet.sql`, and `0010_powerful_beast.sql`, and passing 24-test/build validation.

## Stage 3C — Admin Moderation & Disputes: complete

- [x] Add admin conversation report search/filter by buyer, vendor, listing, inquiry state, date, and report status.
- [x] Add admin message hide/restore controls with participant-safe response shaping for hidden messages.
- [x] Add conversation suspension and report review/resolution notes.
- [x] Link reported conversations to existing disputes and moderation audit records.
- [x] Add audited suspend/reinstate escalation actions for buyer/vendor accounts with server-side admin authorization.
- [x] Add migrations `0011_daffy_morbius.sql`, OpenAPI coverage, and passing 24-test/build validation, including inquiry-state filter validation.

## Stage 3D — Analytics & Reporting: complete

- [x] Add vendor inquiry funnel metrics: volume, unread, response rate/time, resolution rate, true total listings, and rendered top inquiry listings.
- [x] Add admin inquiry funnel metrics across listing view, contact reveal, inquiry, vendor reply, and resolution.
- [x] Add date/vendor/category filters and privacy-safe aggregate reporting in both vendor and admin portals.
- [x] Add boundary, timezone normalization, zero-denominator, vendor-scope, role-gated analytics-policy, filtered-procedure, and OpenAPI validation (30 tests passing).

## Stage 3E — Vendor Trust & Quality Signals: complete

- [x] Add response-rate and typical-response-time indicators with minimum-sample safeguards.
- [x] Add approved/verified-vendor badge rules, profile completeness, and recently-active indicators.
- [x] Add vendor standards acknowledgement persistence and service-area/availability clarity controls.
- [x] Add fair featured-vendor eligibility rules that allow new vendors without enough response samples while requiring trust/profile basics.
- [x] Add migration `0012_wet_hellcat.sql`, public directory/storefront signals, and 33 passing tests/build validation.

## Stage 4 — Trust, Identity, Discovery & Vendor Growth: pending; execute before Stage 3F

Each Stage 4 increment must pass type, unit, integration, build, and diff checks, then receive the relevant Stage 3F hardening pass before release.

### 4A — Trust and anti-abuse foundation

- [x] Add server-validated Turnstile checks for registration, publishing listings, inquiries, contact reveals, and reviews (implemented in `server/abuseProtection.ts`, enforced in `server/routers.ts`, with client widget `TurnstileField.tsx`).
- [x] Add abuse-signal audit records, IP hashing, cooldowns, and safe fallback states (`abuseSignals` table, `0013_unique_nitro.sql`, server helper `recordAbuseSignal`).
- [x] Add contact shielding requiring verified accounts and Turnstile challenges before vendor contact channels are revealed (`marketplace.revealContact` gated in `server/routers.ts` and `ContactReveal.tsx`).
- [x] Add hashed email/phone OTP challenges with AES-GCM ciphertext, 10-minute expiry, attempt limits, 60s cooldowns, SendPulse email OTP outbox delivery, Twilio Verify phone verification, and reverification on phone change (`verificationChallenges` table, `server/contactVerification.ts`, `server/twilioVerify.ts`, unit specs in `server/contactVerification.test.ts`).
- [x] Add shared buyer and vendor contact verification management UI (`ContactVerification.tsx` integrated in `BuyerAccount.tsx` and `VendorPortal.tsx`), OpenAPI documentation, and passing type/test/build validation (38/38 passing tests).

### 4B — Vendor identity and North America residence verification

- [x] Add provider-neutral verification sessions and checks for identity, selfie/liveness, proof-of-residence, and combined NA vendor onboarding (`vendorVerificationSessions` and `vendorVerificationEvidence` tables, `0014_ambitious_quentin_quire.sql`).
- [x] Implement Veriff adapter path with pricing and capability comparison for US/Canada/Mexico, retaining Sumsub and manual fallback adapter interfaces (`server/vendorVerificationAdapters.ts`).
- [x] Add proof-of-address/residence review, consent tracking, manual document submission fallback with 90-day retention metadata, and reviewer audit actions (`server/vendorVerification.ts`, `server/routers.ts`).
- [x] Keep evidence, biometric media, provider data, and reviewer notes private from public payloads, exposing only sanitized redacted summaries and derived trust badges (`deriveVendorBadges`, 42/42 passing vitest specs).
- [x] Add vendor-facing `VendorVerificationCenter.tsx` in `VendorPortal.tsx` and admin verification review queue in `AdminDashboard.tsx`.

### 4C — Vendor verification operations and trust badges

- [x] Add vendor verification checklist, resubmission, and supporting document submission in `VendorVerificationCenter.tsx`.
- [x] Add admin verification review queue with country, provider, and status filters with audited approve/decline actions (`AdminDashboard.tsx`, `admin.reviewVerificationSession`).
- [x] Add explainable Contact verified, Identity verified, and North America residence verified badges with country indicators (`deriveVendorBadges`, `getVendorVerificationBadges`).
- [x] Derive badge visibility server-side, rendering certified chips on `VendorDirectory.tsx` cards and `VendorStorefront.tsx` hero headers, with automatic downgrading on missing or unverified country status (42/42 passing vitest tests).

### 4D — Buyer saved searches and alerts

- [x] Add typed saved-search filters, alert frequency, enabled state, and unique match records (`savedSearches` and `savedSearchMatches` tables, migration `0015_special_shadow_king.sql`).
- [x] Add pure matching policy evaluating keywords, categories, locations, verified vendors, and remote options (`server/savedSearchMatcher.ts`, 46/46 passing vitest tests).
- [x] Add Buyer Account saved-search management with immediate/daily frequency controls and email-off default (`SavedSearchesCenter.tsx` in `BuyerAccount.tsx`, `buyer.savedSearches`, `buyer.createSavedSearch`, `buyer.deleteSavedSearch`).

### 4E — Vendor lead workflow

- [x] Add inquiry lead stages, vendor-only private notes, follow-up dates, and immutable stage history (`leadStage`, `vendorPrivateNotes`, `followUpDate` columns on `inquiries`, `inquiryLeadHistory` audit table, migration `0016_abandoned_clint_barton.sql`).
- [x] Add vendor lead-stage controls, private note saving, and conversion funnel policy (`server/leadWorkflow.ts`, `vendor.updateLeadStage`, `vendor.leadFunnel`, `VendorPortal.tsx`, 51/51 passing vitest tests).
- [x] Keep vendor private notes strictly protected from buyers by omitting them from buyer-facing payloads (`buyer.inquiries`).
- [x] Add aggregate lead conversion reporting for authorized admins (`admin.leadConversionSummary`, `AdminDashboard.tsx`).

### 4F — Marketplace quality, review integrity, and admin reporting

- [x] Add explainable listing-quality scoring policy with 6 distinct factor evaluations (`server/listingQuality.ts`, 54/54 passing vitest tests).
- [x] Display advisory quality score badges and breakdown notes in admin listings control queue (`AdminDashboard.tsx`, `admin.listings`).
- [x] Add review integrity signals detecting burst submissions, duplicate review text, and short comments (`server/listingQuality.ts`, `admin.reviews`, `AdminDashboard.tsx`).
- [x] Render dedicated "Reviews & Integrity" moderation queue with flagged risk warnings in `AdminDashboard.tsx`.

### 4G — Public SEO and discovery

- [x] Add Open Graph and Twitter Card tags to `client/index.html` with canonical brand title and description.
- [x] Serve dynamic `/robots.txt` disallowing private portals (`/admin`, `/account`, `/vendor-portal`, `/api/`, `/login`, `/register`) while allowing public discovery (`/`, `/marketplace`, `/vendors`, `/listings/`, `/story`).
- [x] Serve dynamic `/sitemap.xml` generated only from approved vendors and published listings (`server/seoService.ts`, 58/58 passing vitest tests).

### 4H — MVP contract, architecture decision, and final acceptance (in progress)

- [x] Add the initial versioned `/api/v1/*` REST foundation with health, categories, public listings/vendors, contract discovery, friendly aliases, and consistent success/error envelopes.
- [x] Add the operation registry and authenticated tRPC-backed REST bridge for current auth, notifications, marketplace, buyer, vendor, and admin procedures (`server/apiV1Contract.ts`, `server/apiV1Router.ts`).
- [x] Add OpenAPI schemas and route documentation for the generic REST bridge and explicit aliases; add contract/method/input tests.
- [x] Document the full-stack architecture decision record in `docs/ARCHITECTURE_DECISION.md`.
- [ ] Obtain explicit stakeholder approval of the Vite/Express/tRPC/Drizzle/MySQL architecture deviation from the original Next.js/Prisma/PostgreSQL target.
- [x] Expand the versioned REST registry/bridge across current auth, users, storefronts, search, wishlist, inquiries, messages, reviews, analytics, notifications, verification, moderation, and abuse procedures; add explicit aliases for the common client paths.
- [x] Add real HTTP integration tests against `/api/v1/*` asserting standardized 200/400/401/403/404/405/429 envelopes, input validation, ownership rules, role access, and public-data privacy (`server/apiV1Http.test.ts`, `server/apiV1LiveAcceptance.test.ts`).
- [x] Add deterministic SendPulse provider-failure coverage with bounded error text and no payload leakage (`server/sendPulseAdapter.test.ts`).
- [x] Add a staging-backed HTTP test for the asynchronous notification provider-failure lifecycle and admin retry envelope (`server/apiV1AsyncNotificationLifecycle.test.ts`).
- [x] Expand the executable SOW acceptance matrix to cover full end-to-end flows: buyer discovery/wishlist/inquiry/review, vendor KYC/storefront/publication/leads, and admin moderation/governance/reporting (`server/acceptanceMatrix.test.ts`).
- [x] Add explicit privacy-audit assertions proving REST responses, sitemap, metadata/JSON-LD bindings, and aggregate reports never expose raw contact data, private notes, drafts/suspended content, or identity evidence (`server/privacyAudit.test.ts`).

### Stage 4 release gates

- [x] Complete migration review, server-side authorization, UI success/error states, OpenAPI coverage, and tests across all 4A–4H increments (94 tests passing across 25 test files).
- [x] Apply hardening continuously after every increment with passing quality gates (type checking, 60 vitest unit/integration tests, production build, and git diff cleanliness).
- [ ] Complete 4H API/architecture review and final acceptance before labelling the platform officially **MVP feature-complete** according to the approved Scope of Work (SOW).
- [x] Defer non-MVP elements (checkout, payments, subscriptions, payouts, WhatsApp bots, native push) to V2 as scheduled.

## Stage 3F — Production Hardening: pending; apply after each Stage 4 increment

- [x] Complete mobile QA and keyboard/screen-reader accessibility review for buyer, vendor, and admin portal screens.
- [x] Test rate limits for login, inquiry creation, replies, reviews, contact reveals, preferences, and admin retries (`server/abuseProtection.ts`, `server/routers.ts`).
- [x] Add structured redacted error logging and failed-worker monitoring with automatic retry and suppression guards.
- [x] Create database backup/restore runbook and incident response procedure (`docs/RUNBOOK.md`).
- [x] Add public Privacy Policy and Terms of Service pages (`client/src/pages/LegalPages.tsx`, `/privacy`, `/terms`).
- [x] Verify dynamic sitemap, canonical metadata, Open Graph, robots exclusions, and private-route noindex behavior (`SEOHead.tsx`, `server/seoService.ts`).
- [x] Document seed/demo-data strategy and production incident runbook in `docs/RUNBOOK.md`.

## Verification

- [x] `pnpm run check`
- [x] `pnpm test` — 94 tests passed across 24 test files.
- [x] `pnpm run build`
- [x] `git diff --check`
- [x] Live route checks for public pages, portals, `/api-docs`, and `/openapi.json`.
- [x] Live JWT checks for buyer, vendor, and admin sessions.
- [x] Live contact reveal, related listings, vendor analytics/reviews, admin feature flags, and dispute schema checks.
- [x] Desktop visual QA screenshots captured for homepage, marketplace, listing detail, account, vendor, and admin routes.

## Publish

- [x] Commit and push this release to GitHub in PR #3 after final checkpoint.
