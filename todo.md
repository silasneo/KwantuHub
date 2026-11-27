# KwantuHub Release Status

## Current next 10 workstreams - code review, 2026-10-24

This section supersedes the completion claims in the historical checklist below.
It expands the existing ten migration/deployment tasks; it does not authorize a
framework/database rewrite or claim that all SOW requirements have been verified.
The original review did not change application behaviour. Implementation began
on 2026-10-25; only the explicitly completed items below supersede those findings.

**Workstream 1 implementation - 2026-10-25:** buyer email onboarding, vendor
contact/adult-Didit/storefront onboarding, automatic activation with independent
admin suspension, public contacts, prior-contact reviews, recovery/email changes,
shared action limits and profile/avatar uploads are implemented. The local Docker
app uses migrations 0020-0022 without reseeding. Items 1.1-1.9 are implemented;
1.10 remains a **CHECK for live provider acceptance**, not missing application
code. Provider credentials were subsequently supplied by the product owner;
real delivery and hosted KYC still require acceptance. No production readiness or
bug-free guarantee is claimed. The product owner explicitly deferred account
deletion/export until retention/legal rules are agreed.

Evidence: 48 focused account/provider/worker/API regressions, 26 isolated
MySQL/HTTP regressions with database-scoped grants, TypeScript and Docker image
build, browser login/profile/error checks, and real Garage avatar upload,
256x256 WebP read-back and owned-object deletion. Reset concurrency/expiry,
email-change collisions, both mocked SMS providers, signed/idempotent/stale
Didit callbacks, prior-contact reviews and anonymous-contact restrictions are
covered. Historical account-count evidence predates subsequent user testing;
do not assume seven users or delete user-created accounts.
See `docs/RUNBOOK.md` for migration, environment and webhook instructions.

**Onboarding follow-up - 2026-10-25:** contact verification no longer repeats the
signup Turnstile challenge. Successful email/SMS sends show confirmation and a
server-backed 10-minute expiry countdown; resend waits until expiry. Migration
0023 adds admin-managed SMS countries under **Admin > SMS countries**, seeded
with US/CA/MX/NG. Admins can add countries and disable/hide them without code
changes; server-side requests and verification enforce the enabled list.
Previously verified phones remain verified. This supersedes the original
US/CA/MX-only phone scope and 60-second contact resend policy below; the separate
identity/residence-country policy and email-change cooldown are unchanged.

**Workstreams 1-3 follow-up - 2026-10-25:** migration 0024 adds separate expiring
registrations and audited email-domain overrides. New accounts are created only
when the current registration's email OTP and owner-chosen password are accepted.
Local disposable-domain screening, built-in DNS mail checks, verified-account
UI/API gates, 24-hour registration cleanup, production-safe startup/readiness,
owned vendor image uploads and authorized private evidence downloads are
implemented. Existing accounts/data are preserved. Live provider acceptance
(1.10), external infrastructure/restore acceptance (2.4), and a reviewed cleanup
transition for pre-0024 unverified user records remain open; new pending buyer
and vendor registrations are both covered by automatic expiry.

**Workstreams 4-6 follow-up - 2026-10-25:** migration 0025 adds review uniqueness,
inquiry retry identifiers, independent moderator restrictions, archive-state
restoration and decimal/currency saved-search bounds. Public eligibility and
response projections are centralized; inquiry/message/outbox/analytics and
moderation writes are transactional. Vendor removal means **soft archive**, as
approved by the product owner. Business editing, discovery/saved-search parity,
dashboard deep links and challenge renewal are implemented. Workstream 5 now has
read-only inventory/reconciliation and clean-package rehearsal tooling, but
actual production exports and six excluded raster sources in a clean Git
candidate remain missing. Those cutover checks remain open, not waived.
Workstreams **7 and 8 were excluded** by the product owner's latest instruction.

**Evidence:** current workspace source, including uncommitted migration changes.
Two read-only probes reproduced a USD 10 listing matching a minimum price of 1000,
and a response rate of 200% for six replies across three inquiries. Existing
tests do not cover those failures. A second pass on 2026-10-24 ran live API probes
against the local Docker stack (app/MySQL/Garage/worker healthy) using demo data;
findings it reproduced are marked **LIVE**. Probe accounts were deleted and demo
listings restored afterwards. Provider (Didit/SendPulse/Twilio/Turnstile) flows
were not exercised. The original SOW PDFs were not available for a fresh contract
reconciliation.

**Original journey coverage (product-owner list, 2026-10-24; current account progress is above):** buyer browse/search/filter,
listing and storefront pages, view history, wishlist, inquiries/messaging and
reviews exist. Vendor onboarding, inquiry replies, lead stages and analytics exist.
Admin vendor approval, category create/hide, listing status, review/report
moderation, analytics and notification operations exist. Missing or partial:
password recovery, avatar upload, vendor listing edit/hide/remove, storefront
branding edits, full user/vendor administration, report export and admin-managed
homepage slider/site content (items 1.3, 1.8, 6.1, 6.7, 10.4, 10.7, 10.8).
Paid vendor tiers and promotions remain V2 and are not tracked here.

**Priority:** P0 = public-launch blocker involving access, privacy, or verification
correctness; P1 = broken/missing workflow or delivery reliability; P2 = quality or
operational improvement. CHECK = verification still required, not a confirmed
failure. DECISION = product/governance scope requiring explicit agreement.
Unchecked entries are open; checked entries describe previously completed work,
not new verification in this review.

**Buyer policy supplied by the product owner:** anonymous users may browse and
view vendor-selected public contacts; sending a vendor a message requires buyer
signup. Email verification must be integrated into that signup-to-message journey.
Implemented: contact reveal no longer requires signup, email/phone verification
or Turnstile; it checks published listing, active account and unsuspended vendor
state and uses shared IP limits. Private account/KYC details are not public.
Marketplace-wide eligibility centralization remains open under 4.2.

**Confirmed onboarding and review requirements (product owner, 2026-10-25):**

- Anyone may choose to become a vendor, but choosing vendor signup must not grant the vendor role. Grant vendor status and activate the storefront automatically after completing the required onboarding; no separate manual admin approval is required. Admins can suspend or re-enable vendors as needed.
- Vendor step 1: verify email with an OTP delivered through SendPulse transactional email, then verify a phone number through SendPulse SMS or Twilio SMS. Initially support US, Canada and Mexico phone numbers only. Include password/confirmation and Terms/Privacy acceptance. Use the supplied screenshot as a verification-first flow reference; WhatsApp verification and referral codes are not requested.
- Vendor step 2: collect first name, surname, date of birth, city and address; enforce the product owner's "over 18" age requirement and complete identity verification through Didit. Do not treat starting a Didit session or returning to the app as successful KYC.
- Vendor step 3: set up the vendor profile/storefront, then activate automatically once all onboarding prerequisites are satisfied. Replace the existing admin approval workflow with an admin-controlled vendor suspension/re-enablement setting. Re-enabling must not bypass incomplete onboarding/KYC or an independently suspended account; profile edits or onboarding retries must never clear an admin suspension. Save resumable progress without granting vendor privileges early; enforce each prerequisite on the server, not only through disabled buttons.
- Buyer onboarding is one step: first name, last name, email verification and password. Do not require a phone number, date of birth, address or Didit KYC for buyer onboarding.
- Review eligibility requires a signed-in buyer who has previously contacted the listing's vendor. Use a persisted inquiry/message relationship with that vendor, not a contact-reveal click, browser state or a client-supplied eligibility flag. A transaction/purchase is not required for this lead-generation MVP.
- These requirements are implemented locally; real provider acceptance remains open under 1.10/9.1/10.1. Account deletion/export is explicitly deferred pending retention/legal rules; review edit/withdraw/vendor-reply policy remains undecided.

### 1. Authentication, buyer signup, verification, and access policy

- [x] Remove public demo-login buttons and require a configured production JWT secret.
- [x] **1.1 P1 - Complete the approved one-step buyer onboarding.** Signup collects first/last name, email, password/confirmation and legal acceptance, then routes to email verification without phone/KYC. Explicit send/resend, expiry/attempt guidance, verification status, provider-error feedback and an inquiry-draft return journey are wired. Server-side inquiry/review gates require verified email. Live SendPulse delivery remains acceptance work under 1.10/9.1.
- [x] **1.2 P1 - Align public contact access.** Anonymous vendor-selected contacts now work through the public API and UI with shared limits, published-listing/active-account/vendor-state checks and updated legal copy. Hidden listings and suspended vendors/accounts are rejected in regression coverage.
- [x] **1.3 P1 - Account recovery and email correction (previously LIVE).** Buyers/vendors have forgot/reset UI, hashed 30-minute single-use tokens, encrypted durable email jobs, generic queued responses and all-session revocation. Admins can queue an audited recovery link without viewing/changing credentials. Email changes require the current password and a target-bound new-address OTP; old email remains until confirmation, then sessions/reset tokens are revoked. Provider outages/retries, expiry/concurrent token use and email collisions are covered.
- [x] **1.4 P0 - Enforce unique normalized account email.** Implemented common email normalization, database uniqueness and a normalization CHECK, race-safe duplicate registration errors and safe openId upserts that cannot overwrite a different account on an email collision. Migration preflight rejects normalized duplicates without changing user records; no existing accounts were deleted or merged. Concurrent registration, raw-write validation and duplicate-preflight regressions pass.
- [x] **1.5 P0 - Password/session and suspended-login handling (previously LIVE).** JWTs now require a hashed-ID database session. Logout revokes the current session; password changes and both admin account-suspension paths revoke all sessions. Reinstatement does not resurrect old sessions. Suspended login returns 403 without a cookie; password-change UI redirects to login. Session issuance and credential changes lock the user row to prevent stale-credential session creation. Copied/expired/unregistered tokens and multi-session revocation are covered. Future password-reset implementation (1.3) must reuse all-session revocation.
- [x] **1.6 P0 - Finish auth/abuse protections (previously LIVE).** Atomic MySQL limits cover login/signup/password changes, inquiries, anonymous contacts, OTP/resets/KYC retries and protected mutations including replies/reviews. Independent-connection concurrency/expiry and explicit proxy trust are tested. Passwords consistently require eight characters minimum and at most 72 UTF-8 bytes; legacy login compatibility remains. Production proxy/replica deployment configuration still needs deployment acceptance.
- [x] **1.7 P1 - Make OTP lifecycle atomic and target-bound.** User/challenge locks serialize issue/verification, enforce current destination hashes, supersession, cooldown, expiry and attempt limits, and consume verification with the account update atomically. Undelivered code issuance rolls back and surfaces an error. Both SMS provider paths and concurrent email-code consumption are covered. Phone changes explicitly replace the editable number and clear verification.
- [x] **1.8 P1 - Profile editing and avatar images (previously LIVE).** Forms hydrate after auth loads without overwriting edits. Names persist with visible save/error feedback. JPEG/PNG/WebP uploads are validated, stripped, cropped/resized and stored through S3/Garage with owned replacement/removal cleanup. Unsafe URL schemes are rejected and new accounts use local initials, not third-party generated avatars. Storefront logo/cover remain separate 6.1 work.
- [x] **1.9 P0 - Gate vendor status on completed onboarding (previously LIVE).** Signup intent is separate from buyer authorization; partial/skipped onboarding cannot grant vendor privileges. Contact/terms/current matching Didit/adult/storefront prerequisites are checked transactionally before automatic activation. Admin roles and vendor/account suspensions are preserved; admin re-enablement cannot bypass onboarding. Account deletion/export is explicitly **DEFERRED by the product owner**, not silently included; retention/legal rules remain under 7.3.
- [ ] **1.10 CHECK - Live acceptance of implemented vendor onboarding.** Application steps and mocked-provider regressions are implemented. Credentials were supplied; complete actual SendPulse inbox delivery, Twilio SMS to an owner-controlled enabled destination and hosted Didit verification/webhook through the public HTTPS origin. SMS countries are admin-managed; residence/identity remains US/CA/MX. Provider acceptance is not proof of inbox/device receipt. Do not send test messages to unrelated existing users or claim a hosted KYC journey passed from mocks.

**Email and registration hardening (product-owner discussion, 2026-10-25):** Implemented follow-ups below supersede the original registration lifecycle in 1.1. No additional external email-validation integration is required.

- [x] **1.11 P1 - Add layered email-address screening.** Added an integrity-checked, pinned local snapshot from https://github.com/eramitgupta/disposable-email with MIT attribution and a reviewed-SHA update command. Failed updates exit nonzero with an operator alert and retain the previous snapshot; Admin > Email screening shows version/staleness and audited allow/block/remove overrides with most-specific domain-boundary matching. Screening covers new registrations, OTP issuance/completion and proposed account-email changes. No signup-time GitHub calls, applicant-address sharing, blanket plus-address/privacy-alias bans or ownership-verification bypass.
- [x] **1.12 P1 - Check domain mail capability using built-in DNS only.** Node's existing resolver checks MX, explicit Null MX and nonexistent domains, with A/AAAA fallback when MX is absent. Bounded DNS retries/timeouts and bounded positive/negative caching are implemented; temporary failures return retryable errors. Domain-only queries, no SMTP mailbox probes or additional provider. DNS outcome/cache and snapshot integrity regressions pass.
- [x] **1.13 P0 - Restrict incomplete onboarding on both UI and API.** Shared middleware denies unverified buyer/notification/profile/vendor operations except verification, password recovery/change, email correction and logout. Protected account routes redirect before mounting portal queries; public browsing remains available, without recording unverified-account view history. Verified buyers need no phone/KYC. Existing administrator governance remains available under its role checks, without granting unverified buyer access; private evidence downloads separately require verified admins.
- [x] **1.14 P1 - Create accounts only after unique email ownership verification.** New signup stores a separate 24-hour pending registration, bound to a random HttpOnly-cookie token whose hash is persisted. Passwords are not accepted/stored at registration start: OTP plus the owner's chosen password atomically creates one verified normalized-email account and consumes the pending record. Concurrent same-email attempts cannot reserve/overwrite accounts or adopt another flow's password. Refresh/resume, replay, collision, wrong-code limits and delivery rollback are covered. Pre-0024 user records are preserved and verification-gated, not silently merged or deleted.
- [ ] **1.15 P1 / CHECK - Manage abandoned registrations and bounded retries.** Implemented the approved **24-hour** fixed expiry for new pending buyer registrations and vendor applicants stopped before email verification, including their details/encrypted OTP. Expired registrations are immediately unusable and the worker deletes bounded batches every five minutes with error/freshness reporting. Resends do not extend registration expiry; OTPs last at most 10 minutes with five wrong attempts, resend after expiry, and destination/IP limits across flows. **Remaining:** review pre-0024 unverified user records and establish reliable never-verified provenance before migrating/removing their legacy details/challenges; current verification status alone must not trigger destructive cleanup. Email-verified accounts and subsequent vendor/phone/KYC progress remain excluded. Broader deletion/export and post-verification retention stay deferred under 7.3.

### 2. MySQL/Garage Compose and production runtime

- [x] Add MySQL 8.4 and Garage with private networking, persistent volumes and local service health checks.
- [x] **2.1 P0 - Separate production deployment from demo bootstrap.** Normal app/worker startup no longer invokes migrations/import/seed. Explicit maintenance and development profiles separate these actions. Operator-only admin provisioning promotes an existing verified active buyer, locks the row and revokes sessions; no shared/default admin credential is generated.
- [x] **2.2 P1 - Dependency and worker readiness.** Added process liveness and bounded readiness for MySQL, authenticated S3 bucket access, local email-policy integrity and shared worker heartbeat. Worker has private live/ready endpoints and Compose health checks; public readiness reveals only dependency states.
- [x] **2.3 P1 - Runtime failure handling.** Delivery, retention and registration cleanup use non-overlapping jobs, bounded batches, sanitized errors, watchdog/freshness checks and graceful draining. Production refuses occupied/invalid configured ports instead of silently switching. Runtime/shutdown regressions pass.
- [ ] **2.4 CHECK - Production resource and recovery configuration.** Compose now includes container budgets, PID limits, rotating logs and shutdown grace periods; docs/PRODUCTION_RUNTIME.md documents narrow proxy trust, TLS, encrypted off-instance backups and isolated restore. **Remaining:** provision/verify actual production edge TLS/proxy, external alerts, off-instance backup automation/key custody, load-tested budgets and an evidenced recovery rehearsal/RPO/RTO. Local tunnel health and a local SQL backup are not production recovery acceptance.

### 3. Provider-neutral S3 storage and upload lifecycle

- [x] Replace Manus storage with an S3-compatible adapter, stable keys and a public-prefix-only media proxy.
- [x] **3.1 P1 - Implement actual public image uploads.** Added authorized JPEG/PNG/WebP upload (5 MB/25 MP; no animation), metadata stripping and normalized WebP output under vendor-owned prefixes. Vendor Portal supports five-image galleries with ordering/removal, editing gallery references, storefront logo/cover uploads and explicit errors. Account-avatar upload remains independently implemented under 1.8.
- [x] **3.2 P1 - Complete media ownership and cleanup.** References require owned keys, object existence and approved origin/protocol; existing shared/remote seed media can be retained, not adopted or deleted. Listing/gallery writes are transactional and vendor-locked. Unreferenced owned replacements are deleted postcommit; failures surface retry guidance. Upload/manual cleanup removes owned unreferenced objects older than 24 hours; there is no global sweeper. Cross-vendor, rollback and reference-sharing regressions plus a temporary Garage roundtrip passed.
- [x] **3.3 P1 - Deliver private downloads through a browser-reachable boundary.** Admin evidence links now use an authenticated same-origin proxy with five-minute user-bound tokens, active verified-admin authorization and current retention checks. Expired/missing evidence is denied; downloads use attachment/no-store/nosniff headers, size limits and safe failure responses. No bucket-wide access or browser-visible Docker-internal hostname. Physical evidence purge remains open under 7.3.

### 4. Schema, public visibility, ownership, and mutation integrity

- [x] Add storefront storage-key columns and backfill recognized legacy Manus URLs without dropping URL columns.
- [x] **4.1 P0 - Fix cross-vendor media mutation (previously LIVE).** Fixed with 3.2: lock/check listing ownership before any gallery mutation, atomically save listing/media, and reject non-owned/nonexistent IDs. Isolated MySQL regressions cover another vendor submitting empty/replacement galleries, image adoption and insertion-failure rollback.
- [x] **4.2 P0 - Centralize public eligibility (previously LIVE).** Search, details, storefronts, related listings, reviews, contacts, REST collections, saved-search targets and sitemap share completed onboarding/current approved Didit + active verified account + unsuspended vendor eligibility; public listings additionally require published status and an active category. Verified owners/admins have explicit authenticated previews, without view-history side effects. Isolated MySQL/HTTP regressions cover suspension, reinstatement, unfinished/declined KYC, hidden/archived content and category visibility. Legacy demo vendors are not silently grandfathered or verified. Sitemap route/metadata fixes remain 8.1/8.2.
- [x] **4.3 P0 - Repair buyer/admin response projections (previously LIVE).** Buyer reviews use a public vendor allowlist. Admin reviews/reports/messages/verification applicants and vendor inquiry buyers use explicit account summary columns, not complete user rows. Real authenticated REST response regressions assert password hashes/ciphertext and buyer-facing private vendor fields are absent.
- [x] **4.4 P1 - Validate inquiry targets and commit atomically.** Creation rejects ineligible/hidden targets and self-inquiries, then commits inquiry, initial message, outbox and analytics together. Buyer-row serialization, optional unique buyer/request IDs and exact-payload recent retries prevent duplicate conversations; conflicting payloads return conflict. Replies also commit with their outbox. Concurrent retries and injected outbox-failure rollback are covered.
- [x] **4.5 P1 - Protect moderation from participant undo.** `moderatorSuspendedAt` is independent of conversation status; buyer/vendor replies and close/reopen/archive/unarchive cannot remove restrictions. Explicit administrator restore and restriction are audited transactionally. New participant archives remember their prior open/closed status. Migration preflight stops for ambiguous historical reviewed-report archives rather than guessing their administrative provenance.
- [x] **4.6 P1 - Complete mutation invariants.** Added review buyer/listing uniqueness with duplicate-preserving migration preflight, serialized review/wishlist operations, self-review prevention, missing-ID checks and transactional moderation/audit/outbox writes. Account suspension/revocation/audit are atomic. Real-DB concurrent reviews/toggles and moderation outbox-failure rollback are covered; no historical duplicates are deleted automatically.
- [x] **4.7 CHECK - Verify clearing every vendor contact channel.** Isolated MySQL/API regressions clear and read back email, phone, WhatsApp, iMessage, Instagram and website as null, verify anonymous REST contact channels become empty and storefront projections stay private, while preserving account ownership verification/onboarding. No real vendor's contact data was cleared for this check.
### 5. Asset inventory, migration, and verified cutover

- [x] Include exported source files/manifest in the workspace, import the seven valid images, preserve `public/<filename>` keys, and add read-back SHA-256/size/content-type verification to the importer.
- [x] Correct the six PNG-under-JPG content types; retain the HTML Christmas-market export only as an archive, exclude it from imports/seed data, and remove its local gallery reference/object with product-owner approval.
- [ ] **5.1 CHECK - Reconcile actual source production data.** Implemented read-only DB reference export and public/private inventory reconciliation with exact row/object counts, checksums and blocking exceptions; see `docs/ASSET_RECONCILIATION.md`. The local archive verifies seven valid objects (32,787,134 bytes), not current production. **Blocked:** obtain an authorized current source SQL/object export, reconcile all references and private evidence, and resolve exceptions before cutover. No production data has been migrated.
- [ ] **5.2 CHECK - Fresh-clone and rollback rehearsal.** Added pinned importer preflight, offline clean-candidate packaging rehearsal and scoped SVG line-ending protection. Rehearsal correctly blocks because six raster sources are excluded from the authorized Git candidate; this does not mean the running Docker image is broken. **Remaining:** approved reproducible raster delivery, committed/released application/tooling, and migration/rollback against a copy of the actual source schema/data (including historical FK naming) with restored counts/checksums. No commit/push or actual production cutover is claimed.

### 6. Frontend media consumers, vendor CRUD, and discovery

- [x] Resolve migrated public keys in existing listing, storefront and shared-brand image consumers.
- [x] **6.1 P1 - Finish vendor listing/storefront management.** Added owner-only soft archive with confirmation/audit, preserving inquiries/reviews/media, and explicit owner/admin previews. Settings support post-onboarding business name/description/location/headline/service-area/remote/contact edits without clearing omitted fields or independent suspensions. Listing location/remote persistence and ownership/archive lifecycle have isolated MySQL coverage. Draft creation requires completed activation; the UI no longer promises pre-activation drafts. Existing five-image upload/order/removal and logo/cover controls are preserved.
- [x] **6.2 P1 - Preserve onboarding and suspension state during profile edits.** Implemented with Workstream 1: storefront activation is transactional and gated on contact/legal/current matching Didit identity completion; partial saves cannot elevate roles. Settings saves preserve approved/rejected/suspended state and administrator roles. Account phone changes clear verification, legal identity edits invalidate KYC before completion, completed legal-identity corrections require support, and legitimate activation refreshes auth. Live provider acceptance remains 1.10.
- [x] **6.3 P1 - Correct search/filter semantics.** Numeric prices use explicit USD/CAD, inclusive range overlap, no currency conversion and strict grammar; ambiguous/textual prices do not match numeric bounds. Unknown/inactive categories and reversed/invalid bounds are rejected. SQL ordering has an ID tie-breaker; URL-backed filters reset page 1 and support back/forward navigation with actionable error/empty states. Identity filter uses verified status AND persisted timestamp, not approval/contact presence. Real MySQL parser/shared-helper parity and exact USD10/minimum1000 regressions pass.
- [x] **6.4 P1 - Make saved-search matching match discovery.** Shared keyword/location/remote/identity and numeric-range rules match discovery. Decimal bounds persist without integer rounding, with explicit currency; extra precision is rejected rather than silently rounded. Saved links retain every criterion. Real-DB matches exclude out-of-range listings and include valid decimal ranges. Alert dispatch/reliability/digest gaps remain under 9.5; a match is not proof of delivered email.
- [x] **6.5 P1 - Surface actionable UI failures.** Listing inquiries, manual evidence upload, profile/portal/admin requests show loading/failure/success feedback and retry controls. Verification links preserve inquiry drafts. Previous profile hydration/avatar-removal fixes remain intact; private evidence lifecycle/decisions are still workstream 7, not implicitly completed.
- [ ] **6.6 P1 / CHECK - Repair action links and challenge reuse.** Implemented URL-selected buyer/vendor/admin tabs, inquiry focusing and correct vendor notification destinations. Protected submissions discard consumed Turnstile tokens/widgets after success/error and require fresh challenges; adapter regressions cover renewal. Two real browser registration submissions passed configured Turnstile and reached the disposable-domain rejection, proving registration retry renewal without creating accounts or sending messages. **Remaining:** repeated configured-provider reset/email-change/inquiry/review/publish flows, including expiry/failure/retry. The registration check does not certify those other journeys.
- [x] **6.7 P1 - Enforce prior-contact review eligibility (decision resolved 2026-10-25).** Implemented with Workstream 1: signed-in, email-verified buyers need a persisted inquiry to the same vendor; contact on another listing of that vendor qualifies, contact reveal does not, phone is not required and self-reviews are rejected. API/UI feedback explains the prerequisite; existing moderation/duplicate protections remain. Review edit/withdraw/vendor replies remain a separate undecided lifecycle scope.
### 7. Private KYC evidence, decisions, and retention

Workstreams 7-9 implementation is present in this worktree; checked items below
do not mean deployed acceptance. Migrations 0026-0028 remain unapplied to the
running database under the user-directed Turnstile-key hold in 8.6.
Final isolated checks passed: 115 focused unit tests, 74 real-MySQL integration
tests, TypeScript checking, the Docker build and built-image HTTP checks.
These checks did not exercise real providers or alter the running business data.

- [x] Validate manual evidence encoding, file signatures and 5 MB ceiling; fail closed on storage failure and clean up an upload if its DB transaction fails.
- [x] **7.1 P0 - Scope verification decisions correctly.** Independent identity/residence decisions require suitable current documents and a reviewable manual session. Combined checks require separate decisions, with serialized profile/session updates and transactional audit. Hosted decisions always persist signed per-check evidence; manual approval cannot replace mandatory Didit onboarding. Repeated, expired and superseded decisions are rejected.
- [x] **7.2 P1 - Preserve unrelated verification state.** Starting a check retains unrelated verification and established country. Overlapping current sessions are rejected. Reverification uses a new session; per-check source references and provider-event audit prevent older sessions from replacing newer decisions.
- [ ] **7.3 P0 / POLICY BLOCKED - Approve physical retention and legal-hold rules.** Expired downloads remain denied. Added audited administrator holds/releases, bounded expired-evidence inventory, and a row-locked, retryable deletion mechanism with minimal audit tombstones. **User explicitly chose to keep physical deletion disabled pending policy approval**; its frozen code gate cannot be bypassed with an environment flag. Existing 90-day download access is not physical deletion approval. Provider receipts, verified-account identity/OTP ciphertext, analytics and deployed volume/backup encryption still need approved retention/encryption evidence. Didit receipts are excluded from generic email-log purge. The approved 24-hour pending-registration cleanup remains separate.
- [x] **7.4 P1 - Complete supporting-document and resubmission UX.** Manual sessions accept up to 10 documents during created/submitted/in-review states, rechecked under lock after storage upload. Decline reasons and corrected/new-session guidance are returned and displayed; expired/final/hosted submissions are refused. Private downloads and legal holds retain verified-admin authorization.
- [x] **7.5 P1 - Disable or complete nonfunctional provider choices.** Veriff/Sumsub are disabled, including direct adapter calls. Manual liveness is rejected. Didit residence requires an actually approved proof-of-address check and explicit matching supported-country evidence, never a requested session label or an ambiguous state abbreviation. Actual deployed workflow fields remain acceptance work under 8.6.

### 8. Manus removal, public SEO, API parity, and deployment URLs

- [x] Remove the active Manus Vite plugin/debug collector, replace storage proxy paths and configure the canonical server origin through `APP_URL`.
- [x] **8.1 P1 - Correct sitemap/robots routes and publication policy.** Shared canonical public routes, redirects for historical aliases, private noindex/robots rules and the shared eligibility policy now align server HTML, sitemap and client navigation.
- [x] **8.2 P1 - Deliver truthful SEO metadata and HTTP status.** Server-visible titles/descriptions/Open Graph/Twitter/canonical/escaped JSON-LD cover eligible listings/storefronts, with real 404/503 and private/preview noindex. Client navigation resets metadata; no framework rewrite.
- [x] **8.3 P1 - Remove the remaining reachable Forge dependency.** Owner notification is explicitly disabled with an actionable precondition error and makes no Forge call. Inactive template helpers are not claimed as active integrations. Production startup configuration is tested without Manus secrets.
- [x] **8.4 P1 - Close REST error/parity gaps.** Async handlers and malformed JSON/query/context failures use standardized envelopes. Aliases validate shared input, invalid limits are rejected, provider unavailability is sanitized, and precondition errors map correctly.
- [x] **8.5 P0 - Derive badges from verification evidence, not contact presence.** REST and main APIs share authoritative source/session/expiry-aware badges with original decision timestamps. Business email/phone must match the verified account destinations; changed/unverified contacts cannot inherit ownership.
- [ ] **8.6 CHECK / DEPLOYMENT HELD - Configure and verify real origins/providers.** Operational docs now use APP_URL rather than permanent Manus callbacks. Actual Didit proof-of-address fields, hosted KYC, SendPulse/Twilio delivery, Turnstile host/actions and HTTPS cookies still require real-provider acceptance. **Current .env has dummy Turnstile site/secret keys, correctly rejected by the new production startup checks. The user chose to finish implementation/validation and keep the existing app running until real keys are configured. Migrations 0026-0030 and the new build are therefore not deployed.**
- [x] **8.7 P0 - Fail closed on missing production bot protection.** Production rejects missing/dummy keys, disabled protection, non-HTTPS/mismatched origin, and wrong/missing hostname/action results. Local/test bypass requires explicit TURNSTILE_MODE=disabled. Private-worker bootstrap validates runtime dependencies without requiring unused bot credentials.

### 9. Independent worker, saved-search alerts, and provider reliability

- [x] Add an independent notification-worker entry point and local Compose worker service.
- [x] **9.1 P1 - Resume deferred email automatically.** Paused/unconfigured deliveries remain queued without consuming attempts and resume through the worker after restoration. Delivery/outbox state distinguishes deferred, failed, accepted and terminal results.
- [x] **9.2 P1 - Make notification delivery retry-safe.** Unique outbox/channel delivery records prevent repeated in-app notifications. Renewed leases, durable in-flight markers and uncertain-send parking prevent automatic resends across crashes/lease loss. Administrator recovery refuses active/terminal sends and requires audited provider confirmation before an uncertain resend. Exactly-once email delivery is not claimed. Queued security mail ignores preferences/admin notification pause but honors hard-bounce/manual suppressions; synchronous registration/change OTP sends remain explicit, nonqueued and outside notification tracking/pause.
- [x] **9.3 P0 - Recover partially processed webhooks.** Provider/event-scoped locked transactions and bounded reconciliation recover failed/early callbacks. Early Didit identity payloads are encrypted until replay and minimized after processing; SendPulse callbacks remain retryable until correlated rather than being permanently discarded.
- [x] **9.4 P0 - Handle out-of-order and early KYC events.** Event-time/terminal guards and per-check current-session ordering prevent stale regressions. Signed actual check outcomes and explicit country evidence are persisted atomically, independently and append-only per provider event. Missing/mismatched active-onboarding name/DoB cannot activate a vendor.
- [x] **9.5 P1 - Implement real saved-search alerts.** Vendor/admin publication commits a durable matching job. Immediate enqueue and match completion are atomic; daily digests include up to 20 matches per 24 hours. Correct event/templates, listing/filter links and an explicit saved-search email preference are wired. New/resumed/changed searches do not backfill earlier publications; previously recorded pending alerts remain eligible after resumption. Matching/outbox commit is not proof of email delivery.
- [x] **9.6 P1 - Repair email links and lifecycle notifications.** Email actions use absolute same-origin APP_URL links, dropping foreign origins. Existing URL-backed dashboard tabs/inquiry focus consume deep links, and repeated inquiry close/reopen cycles retain distinct event keys. Full live-provider journeys remain acceptance work under 8.6/10.1.

### 10. Acceptance, reporting accuracy, operational sign-off, and release

**2026-10-26 code follow-up:** Implemented 10.3, 10.4, 10.7 and the owner-selected
hero-only scope of 10.8. Added isolated query/API regressions and included client
tests in the normal runner. Migration 0029 is tested only in disposable databases;
no live migrations, real-user changes, provider sends, commit or deployment.

- [ ] **10.1 P0 / CHECK - Complete end-to-end acceptance.** Removed the hardcoded-array visibility "audit" tests; actual eligibility/projection/ownership/private-evidence regressions use MySQL and HTTP. Isolated suites cover account registration/OTP with provider doubles, listing media/CRUD, moderation rollback, independent KYC decisions, badges, durable saved alerts and delivery recovery. Bounded browser checks use pre-created disposable accounts for cookie login -> inquiry -> vendor reply -> buyer read, plus admin hero save. **Remaining:** actual registration -> inbox verification -> inquiry/reply browser journey and hosted-provider acceptance; read-shape tests alone are not that evidence.
- [ ] **10.2 P1 / CHECK - Finish browser/provider failure coverage.** Normal Vitest discovery now includes `client/src/**/*.test.ts`, including storage consumers. Existing focused suites exercise fresh/expired/error challenge tokens, provider timeouts/unavailability, concurrent mutations and durable lease-loss/reconciliation. **Remaining:** repeated real configured-provider browser submissions and actual process-restart/in-flight provider acceptance; fake adapters and an expired-lease test are not a real crash/provider result. Keep fixtures isolated from real users.
- [x] **10.3 P1 - Correct trust, analytics and moderation inputs.** SQL groups first vendor responses by inquiry; trust and funnel response rates cannot grow with repeated replies. Category/vendor/date scope applies to inquiry cohorts, unread messages, first responses, top listings and lead-stage counts. Current closed/lead state is explicitly distinguished from historical end-date state; event ratios are not attributed conversions. Directory totals count all eligible listings, separate from six samples. Admin quality uses actual media counts; integrity uses actual buyer burst/duplicate-text counts. Real-MySQL tests cover multiple replies, category/date exclusions, exact rates/sample sizes, directory totals and stored moderation inputs.
- [x] **10.4 P1 - Wire reports and complete moderation operations.** Admin analytics provides an audited aggregate CSV API/download for account/vendor/listing creation, views/reveals, inquiry responses/resolution and vendor-recorded won leads. Each row states its scope; no private notes/messages/account contacts/identity fields are selected. All text cells are quoted and formula-prefixed values neutralized. Categories/feature flags and pause/suppression/outbox controls persist changes with audit in the same transaction; unknown sends cannot be blindly requeued. Isolated tests verify role denial, safe export fields, audits and injected-audit-failure rollback.
- [ ] **10.5 CHECK - Full launch/recovery/accessibility/performance acceptance.** Removed viewport zoom restriction and replaced the inquiry overlay with the existing accessible Radix dialog (named/described, bounded scrolling, focus-scope/Escape behavior and trigger restoration). Bounded browser checks confirmed initial dialog focus, accessible name/description, Escape close and focus restoration. **Native keyboard focus containment could not be certified in the canvas because its document lacked native focus; complete manual keyboard/screen-reader acceptance remains open.** Admin core directories and buyer/vendor collections are now bounded/paged; grouped analytics and batched collection reads have enforced SQL round-trip budgets (10.9). **Remaining:** complete mobile/screen-reader/native keyboard journeys, production DB AND object backup/restore, rollback, provider callbacks and measured load/memory/latency evidence. Clean isolated builds/migrations and query-count budgets are not production capacity/recovery acceptance.
- [ ] **10.6 DECISION - Obtain contract/policy/release sign-off.** Corrected the ADR's unsupported production-approval claim and replaced historical blanket "Verified Complete" matrix statuses with implementation/evidence/pending gates. Contacts remain publicly revealable by owner decision; payments/checkout/payouts remain outside MVP. **Blocked:** original signed SOW/brand/kickoff PDFs are not present in this worktree for re-reading; obtain authorized originals and stakeholder architecture sign-off. Privacy/terms, deployed encryption/retention and deferred account export/deletion still require policy approval. No commit/release is authorized or claimed by these changes.
- [x] **10.7 P1 - Complete scoped admin management.** Added safe 25-row account/vendor/listing searches, role/status filters, stable pagination and detail disclosures; overview uses actual counts. Listing metadata edit has a stale-edit guard/audit and preserves URL/owner/media/status/publication; preview and status-reason prompts are wired, and no-op publishing preserves time. Categories support name/slug/order edits, visibility, unused-only deletion and transactional merge of listing/saved-search references with audit; old category URLs are not silently redirected. Account/vendor status changes enqueue notifications transactionally. **Owner chose CLI-only administrator grants/revocations**, now audited/session-revoking with last-admin protection; web self-suspension is refused. No extra admin permission tiers or onboarding bypass introduced. Legacy onboarding transitions remain a separate reviewed decision; account deletion/export remains deferred.
- [x] **10.8 P1 - Admin-managed homepage hero slides.** **Owner selected hero slides only; About/Support/legal copy and featured-vendor editing are excluded.** Added migration 0029 with the unchanged three slides, public cached reads, admin create/edit/order/activation/UTC scheduling/preview, revision-conflict protection and audit reasons. Shared validated public image encoding enforces 5 MB/type/pixel/animation limits, with dedicated site-content keys and stored-object checks. Required alt text and safe internal/HTTPS CTAs are enforced. Defaults apply to an empty table, not deliberately inactive slides; public DB failures are explicit. Slider pause and reduced-motion behavior are included. Isolated seed/schedule/authorization/link/upload/revision tests and browser save passed; this is not yet deployed.
- [x] **10.9 P1 - Bound buyer/vendor collections and remove per-row query growth.** Added owned paging for wishlist/history/reviews/saved searches/vendor catalogs/inquiry summaries and verification history, plus notification cursor navigation. Conversations load visible messages on demand with independent paging; full-thread SQL summaries retain unread/response/activity semantics and direct owned deep links. Added public directory/storefront/review paging, pre-page vendor search, six-sample SQL ranking and batched media/trust/current-decision badge reads. Tabs fetch on demand, totals cover the full matching collection and ID tie-breakers make same-second ordering deterministic. Migration 0030 adds read indexes only. Real-MySQL regressions cover multi-page ownership/privacy, long hidden-message threads, full rating totals, cursor ordering and constant SQL-call budgets; production load/latency acceptance remains open in 10.5. Paged API envelopes and REST alias changes are documented in the runbook; frontend/API must roll out together. No live migration or deployment.
- [x] **10.10 P2 - Vendor identity country follows admin-enabled countries.** Step 2 Country now lists the countries enabled under Admin > SMS countries (same setting), the server rejects disabled or unsupported countries when a country is newly chosen, and migration `0031_identity_countries` widens `accountOnboarding.countryCode` to a two-letter code. Proof-of-residence badges stay limited to US/CA/MX.
## Historical release checklist (not current acceptance evidence)

The sections below are retained as historical implementation claims. Checked
boxes do not override the open findings above, and dates/test totals here are not
fresh verification of this workspace or the original SOW.

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
- [x] Add public feature-flagged mega-menu structure via `mega_menu_enabled` (enabled by default since migration 0032; categories grouped by `shared/categoryGroups.ts`).
- [x] Restore legacy header (persistent search + Market index nav) and About page; About images live in Garage at `public/site/about/{bookshop-owner,ceremony-tailor,jewelry-maker}.webp`.
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

### 4H — MVP contract, architecture decision, and final acceptance (complete)

- [x] Add the initial versioned `/api/v1/*` REST foundation with health, categories, public listings/vendors, contract discovery, friendly aliases, and consistent success/error envelopes.
- [x] Add the operation registry and authenticated tRPC-backed REST bridge for current auth, notifications, marketplace, buyer, vendor, and admin procedures (`server/apiV1Contract.ts`, `server/apiV1Router.ts`).
- [x] Add OpenAPI schemas and route documentation for the generic REST bridge and explicit aliases; add contract/method/input tests.
- [x] Document the full-stack architecture decision record in `docs/ARCHITECTURE_DECISION.md`.
- [x] Obtain explicit stakeholder approval of the Vite/Express/tRPC/Drizzle/MySQL architecture deviation from the original Next.js/Prisma/PostgreSQL target (approved by product owner on 2026-10-20).
- [x] Expand the versioned REST registry/bridge across current auth, users, storefronts, search, wishlist, inquiries, messages, reviews, analytics, notifications, verification, moderation, and abuse procedures; add explicit aliases for the common client paths.
- [x] Add real HTTP integration tests against `/api/v1/*` asserting standardized 200/400/401/403/404/405/429 envelopes, input validation, ownership rules, role access, and public-data privacy (`server/apiV1Http.test.ts`, `server/apiV1LiveAcceptance.test.ts`).
- [x] Add deterministic SendPulse provider-failure coverage with bounded error text and no payload leakage (`server/sendPulseAdapter.test.ts`).
- [x] Add a staging-backed HTTP test for the asynchronous notification provider-failure lifecycle and admin retry envelope (`server/apiV1AsyncNotificationLifecycle.test.ts`).
- [x] Expand the executable SOW acceptance matrix to cover full end-to-end flows: buyer discovery/wishlist/inquiry/review, vendor KYC/storefront/publication/leads, and admin moderation/governance/reporting (`server/acceptanceMatrix.test.ts`).
- [x] Add explicit privacy-audit assertions proving REST responses, sitemap, metadata/JSON-LD bindings, and aggregate reports never expose raw contact data, private notes, drafts/suspended content, or identity evidence (`server/privacyAudit.test.ts`).

### Stage 4 release gates

- [x] Complete migration review, server-side authorization, UI success/error states, OpenAPI coverage, and tests across all 4A–4H increments (94 tests passing across 25 test files).
- [x] Apply hardening continuously after every increment with passing quality gates (type checking, 60 vitest unit/integration tests, production build, and git diff cleanliness).
- [x] Complete 4H API/architecture review and final acceptance before labelling the platform officially **MVP feature-complete** according to the approved Scope of Work (SOW).
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
