# KwantuHub Production Operations & Incident Runbook

## 1. System Architecture Overview
- **Compute / Frontend / API**: Node.js 22 runtime serving Express 4 + Vite-bundled React 19 SPA + tRPC 11 + OpenAPI / Swagger at `/api-docs` + REST at `/api/v1/*`.
- **Database**: MySQL 8.4 in the local Compose deployment; managed MySQL-compatible hosting is a deployment choice, not a configured guarantee. Access uses Drizzle ORM.
- **Background Worker**: Self-healing outbox worker in `server/notificationWorker.ts` processing queued transactional emails with exponential backoff and lease locks.
- **External Integrations**:
  - Email: SendPulse Transactional REST API & Webhooks
  - Bot Protection: Cloudflare Turnstile
  - Phone Verification: Twilio Verify
  - Identity Verification: Didit for account onboarding; legacy verification workflows remain separately scoped.

---

## 2. Database Backup & Disaster Recovery Runbook
### 2.1 Automated Snapshots
- Backup automation/PITR is not provisioned by this repository. Agree and verify retention, off-instance encrypted storage and recovery objectives for the selected host. Follow [Production runtime and recovery](PRODUCTION_RUNTIME.md); do not assume local Docker volumes or a managed-provider plan are sufficient.

### 2.2 Manual Schema & Data Export
```bash
# Dump complete schema and table definitions
mysqldump -h $DB_HOST -u $DB_USER -p$DB_PASSWORD --no-data $DB_NAME > kwantuhub_schema_$(date +%F).sql

# Dump full data excluding ephemeral notification deliveries
mysqldump -h $DB_HOST -u $DB_USER -p$DB_PASSWORD $DB_NAME > kwantuhub_full_$(date +%F).sql
```

### 2.3 Verified Restoration Procedure
1. Create a fresh target staging/recovery database instance.
2. Restore the matching database backup into the empty target:
   ```bash
   mysql -h $TARGET_HOST -u $DB_USER -p$DB_PASSWORD $TARGET_DB < kwantuhub_full_backup.sql
   ```
3. Restore the matching Garage metadata/data or authenticated S3 object export, including private evidence. Keep provider sending disabled during recovery.
4. Verify migration journal and record/object counts; review/apply forward migrations (`pnpm db:migrate`, currently through 0025) only after restoring the matching schema/data.
5. Point `DATABASE_URL` to the isolated target instance and verify `/api/v1/ready` reports all dependencies `ok`, representative object checksums and authorization pass, and measured RPO/RTO is accepted before controlled cutover. See the complete isolation/provider-replay safeguards in PRODUCTION_RUNTIME.md.

### 2.4 Asset migration evidence (workstream 5)

Follow [Asset reconciliation and isolated rehearsal](ASSET_RECONCILIATION.md)
for read-only reference export, full public/private source and target checksums,
exact row/object counts, blocking exceptions, clean-package preflight and
non-destructive rollback gates. No current authorized production export is
available; historical seed/archive counts are not production acceptance.
The seven-image historical importer is not a production/KYC restore tool.

## 4. Portable local Docker deployment

### Marketplace and vendor workspace acceptance (workstream 6)

- Vendor removal means **soft archive**: confirm removal from public discovery while preserving inquiries, reviews, and gallery history. Re-publication remains subject to activation, current verification, and independent administrator restrictions. Inactive listings have an authenticated owner/administrator preview (`?preview=1`), not a public publication bypass.
- Vendor settings edit public business name, description, location, headline, service area, remote availability, and contacts after onboarding. Legal identity corrections are a separate account/onboarding process.
- Numeric discovery uses inclusive range overlap: `USD 50-100` matches bounds 75-80. Bare numbers and `$` mean USD; CAD requires `CAD` or `CA$`. Currencies are never converted. Decimals are not rounded during matching. Bounds allow at most two decimal places and a maximum of 9,999,999,999.99; extra precision is rejected rather than silently rounded on save. Free text such as `Inquire`, `from $50`, or `$50/hour` stays visible but does not match numeric bounds. Invalid/reversed ranges and unknown categories produce validation feedback rather than broadening results.
- Marketplace criteria and pages are URL-backed; editing any filter resets page 1 and browser back/forward restores prior criteria. Saved-search result links include every saved criterion. The verified filter requires verified identity status and a persisted identity-verification timestamp; it is not administrator approval or contact verification.
- Numeric price sorting includes only parseable offers in the selected currency. Lowest sorts by the offer's lower bound; highest sorts by its upper bound, with listing ID breaking ties. It never compares USD directly to CAD or invents numeric prices for text-only offers.
- Notification links use `?tab=...&inquiry=...` on `/account`, `/vendor`, and `/admin`; the selected conversation receives keyboard focus. Moderator restrictions disable participant replies/state changes independently of archive state. Only an explicit moderator restore removes the restriction.
- Protected submissions discard their Turnstile widget/token after success **or failure** and wait for a newly issued token. Local adapter tests do not certify the live provider: deployment acceptance must repeat registration, reset email, email-change, inquiry, review, and publish attempts on a configured allowed hostname, including provider failure/retry and expired challenges.

Focused regression suite: `pnpm exec vitest run server/discoveryFilters.test.ts server/discoveryNavigation.test.ts server/savedSearchMatcher.test.ts server/turnstileClient.test.ts`.
`server/discoverySql.test.ts` additionally compares shared parsing with read-only MySQL 8.4 `SELECT` expressions when `DISCOVERY_SQL_DATABASE_URL` points to an authorized test database; it performs no account or listing writes.

The repository Compose stack provides MySQL 8.4, Garage S3, the Express application and a separate worker. Normal startup never migrates, imports or seeds. Migrations/imports require the explicit `maintenance` profile; demo bootstrap requires the explicit `development` profile. Follow [Production runtime and recovery](PRODUCTION_RUNTIME.md) for first startup, admin provisioning, health, shutdown, resource budgets and recovery. App binds to `127.0.0.1:3000` and MySQL to `127.0.0.1:3307`; Garage and worker health are private. Named volumes persist data but single-node Garage has no redundancy.

Copy `.env.example` to `.env`, replace all database/JWT/Garage placeholders with unique random values, and do not commit `.env`. The optional development bootstrap imports the seven valid exported visual assets and seeds demo users/listings; never run it against existing user data or production. The Christmas-market export is an archived HTML error page and is not imported; see `docs/s3-assets-export/README.md`. The demo password is `DemoPass123!`; demo accounts are for private local testing only and do not prove email ownership. Run `docker compose ps` and request `http://localhost:3000/api/v1/ready` to confirm dependency readiness.

Useful local operations:

```powershell
docker compose logs --tail 100 app worker garage
docker compose exec garage /garage status
docker compose down
```

`docker compose down -v` destroys the local MySQL and Garage data volumes. Back up both database data and object data before any destructive operation. For production, use a redundant Garage cluster or a managed S3-compatible provider, TLS, a durable database backup/PITR plan, and deployment-specific secrets.

### Low-cost EC2 deployment

For an initial low-traffic deployment with app, worker, MySQL, and Garage on one
VM, start with `t3a.medium` (2 vCPU, 4 GiB RAM), Ubuntu 24.04 LTS x86-64, and
40-60 GiB encrypted gp3 storage. A 2 GiB instance is a tighter trial option,
not the recommended starting size for the combined stack. Size against measured
traffic and monitor memory, disk usage, and burstable CPU credits/surplus charges.
Build images in CI and deploy a pinned image rather than building on the small VM.

Use Docker Compose with a production configuration that excludes the demo
bootstrap and demo accounts. Apply migrations and import the valid images
explicitly; do not deploy the local Compose bootstrap unchanged. Put Caddy or
Nginx in front of the loopback-bound app for HTTPS. Permit public HTTP/HTTPS only,
use SSM or restricted SSH for administration, and keep MySQL and Garage private.
A single public subnet avoids a NAT gateway; an ALB is not required for one VM.
Set `APP_URL` and provider webhooks to the public HTTPS domain.

One VM is a single point of failure, not a highly available deployment. Configure
off-instance MySQL and Garage backups, test recovery, and keep secrets outside
Git. Browser access to evidence now uses an authorized same-origin download
proxy; physical evidence retention deletion remains open under task 7.3.
Complete the remaining acceptance and backup/restore checks before public launch.

### Account foundation migrations (0020-0021)

Back up the database and stop app/worker writers before applying
`0020_account_security` and `0021_email_normalization_constraint`. The former preflights normalized email duplicates before changing
user records. If it fails, review the duplicate accounts and their ownership;
do not delete/merge accounts automatically or mark the migration applied.
With duplicates resolved, retry on the original schema. MySQL DDL is not
transactional: inspect any partially applied DDL before retrying a later failure.

The migrations normalize emails, add uniqueness and a normalization constraint,
and creates `authSessions` and `authRateLimits`. The migration user therefore
needs `CREATE`, `ALTER`, `INDEX`, `CREATE TEMPORARY TABLES`, and normal
read/write privileges. Existing JWTs deliberately stop authenticating; everyone
must sign in again. Rolling back application code would restore the old
non-revocable-token behaviour, so do not roll back to it while public traffic is
enabled.

After building the updated local image, apply without rerunning demo bootstrap:

```powershell
docker compose stop app worker
docker compose --profile maintenance run --rm --no-deps migrate
# Continue only if migration succeeded.
docker compose up -d --no-deps app worker
```

Login counts only incorrect credentials: 5 per normalized email or 15 per client
IP triggers a full six-hour lockout from the threshold failure. Warnings appear
from the 3rd email failure or 9th IP failure, with remaining attempts. Subthreshold
failures accumulate for six hours from the first failure, then expire. Successful
sign-ins do not increment or clear failure counters. Registration allows 10
attempts per IP per hour. Limits persist across restarts/replicas. Password changes allow 10 attempts
per account per 15 minutes. New passwords require 8 characters minimum and
72 UTF-8 bytes maximum; login still accepts existing shorter passwords.
Logout revokes only that session; password changes and admin account suspension
revoke all sessions. Changing a password redirects to login.

Reaching either login limit returns HTTP 429 with the remaining wait in minutes,
even for a subsequent correct password. Blocked retries do not extend the
six-hour lockout. IP limits span all account emails using that IP. Accounts are not
suspended, existing sessions are not revoked, and recovery remains separately
rate-limited.

`TRUST_PROXY` is empty by default: client-supplied `X-Forwarded-For` and
`CF-Connecting-IP` are ignored. Behind a reverse proxy, set a comma-separated
allowlist of its actual IPs/CIDRs and ensure the proxy overwrites forwarded
headers. Never trust every source or expose a trusted proxy's backend directly.
Without correct proxy configuration, clients share the proxy IP's rate limit.
Keep `JWT_SECRET` identical across app replicas and keep database clocks in sync.
Expired session/counter cleanup is bounded and runs during account traffic.

Account regressions in `server/accountSecurity.integration.test.ts` require
`ACCOUNT_TEST_DATABASE_URL` pointing to a dedicated MySQL database whose name
ends in `_account_test`. They apply all migrations and use isolated HTTP requests;
never point this setting at a real deployment database. Run with
`pnpm exec vitest run server/accountSecurity.integration.test.ts`.

### Account onboarding migration (0022)

Apply `0022_account_onboarding` using the same backup/stop/migrate/start procedure
above, without bootstrap or reseeding. It adds private encrypted onboarding
details, hashed reset-token records, signup intent and versioned legal acceptance,
and extends verification challenges. Existing accounts and vendor profiles are
preserved, not silently marked as having completed the new onboarding. Legacy
vendors must complete onboarding before saving their storefront through the new
activation gate. Migration 0025 and the shared public-eligibility policy now also
exclude incomplete legacy/demo profiles from public discovery. They are not
deleted, grandfathered or marked verified.

New vendor signups retain buyer authorization until verified email, verified
phone in an enabled SMS country, a valid adult identity, an approved matching Didit decision and
storefront setup are complete. The implemented age threshold is **18 or older**.
Legal acceptance version `2026-10-25` is recorded with its timestamp. Identity
details are encrypted using the JWT-secret-derived key: back up that secret
securely; changing it also makes existing encrypted identity/challenge/outbox
data unreadable. Administrators can suspend/re-enable vendors, but cannot use
re-enablement to bypass onboarding or account suspension.

Email/SMS contact codes expire after 10 minutes, allow five incorrect attempts,
and can be resent only after their active code expires. The UI confirms accepted
delivery and displays a live expiry countdown, restored from the server after
refresh. Signup retains Turnstile; signed-in contact verification does not ask
for another challenge and retains shared account/action limits. Codes are
consumed atomically against their current destination. Email changes retain a
separate 60-second send cooldown and require the current password and verification of the
new address; the old address remains until confirmation, which revokes sessions.
Password reset links expire after 30 minutes and are single-use. Reset requests
return the same generic queued-request message for known and unknown accounts.
The worker sends reset links from an atomic outbox event with encrypted token
material, retries delivery failures and refuses consumed/expired/moved-address
requests. Keep the worker running for recovery emails. Administrators can queue
a recovery link in **Users** without seeing or changing a password.

Avatar uploads accept JPEG/PNG/WebP up to 2 MB and 16 megapixels, remove metadata,
center-crop/resize to 256x256 WebP and store under the account's own public avatar
prefix. Replace/remove cleans up owned previous objects; cleanup failures are
logged rather than deleting shared seed media. Account closure/deletion and
data export are explicitly deferred by the product owner until retention/legal
rules are agreed; no deletion or anonymization policy is implied.

### SMS country settings (0023)

Apply migration `0023_sms_country_settings` with the backup/stop/migrate/start
procedure above. It creates a persistent SMS country allowlist, initially enabling
US (+1), Canada (+1), Mexico (+52) and Nigeria (+234). Administrators can open
**Admin > SMS countries**, add a country from the country catalogue, or uncheck
an existing country to disable/hide it. Changes apply without rebuilding or
restarting the app. Country names/calling codes come from standard phone metadata;
server-side parsing checks the actual region, including shared +1 calling codes.
Leading national trunk prefixes (such as Nigeria's 0) are normalized.

Disabled countries cannot request or complete new phone verifications. Previously
verified phones are not revoked by a country-setting change. Verify destination
permissions, sender registration and pricing in Twilio/SendPulse separately:
enabling a country in this app cannot enable it in the provider.
These settings control **SMS destinations only**; they do not expand the existing
US/CA/MX residence/Didit identity-country policy.

### Email-first registration and screening (0024)

Back up the DB, stop app/worker writers and apply `0024_email_first_registration`
without reseeding. This additive migration creates `pendingRegistrations` and
`emailDomainOverrides`; it does not delete or silently verify existing users.

New registration collects email, signup intent, buyer names and legal acceptance,
but no password and no full account/session. A random HttpOnly limited cookie
resumes the pending flow in the same browser. On another device, start a new flow;
pending flows do not reserve an address. Send the email OTP explicitly, then
submit the current flow's code with a chosen/confirmed password. One transaction
creates the unique email-verified buyer account and consumes that flow; only then
is a normal session issued. Vendor applicants retain buyer authorization until
phone, adult identity/Didit and storefront setup are complete.

Pending buyer and vendor registrations expire **24 hours from creation**. Neither
resume nor resend extends this deadline. OTPs expire after at most ten minutes
(sooner if the registration expires), allow five wrong attempts and cannot be
resent while active. Email/IP counters span pending flows. The worker deletes
up to 500 expired pending rows and their embedded encrypted codes every five
minutes; expiry is enforced immediately even before physical cleanup.

Existing pre-0024 users remain intact. Unverified users can sign in only to
verification/correction/recovery workflows; buyer/profile/vendor operations are
server-gated and protected pages redirect before fetching portal data. Existing
administrator governance retains its role checks, but private evidence downloads
require email verification. Do not automatically purge legacy users merely
because `emailVerifiedAt` is null: review never-verified provenance and dependent
records before any legacy transition. Email-verified accounts and later
vendor/KYC progress are excluded from the pending-registration cleanup policy.

Email screening uses the pinned `data/email/snapshot.json` and accompanying MIT
license, with 137,814 validated domains at the initial revision. One malformed
upstream entry was explicitly excluded and recorded in snapshot metadata.
**Admin > Email screening** shows snapshot version/age and supports audited
domain allow/block overrides, including removing an override to inherit the list.
The most-specific matching domain wins; overrides do not bypass DNS or OTP.

For a controlled update, review the upstream commit/license, then run:

```powershell
pnpm exec tsx scripts\update-email-domains.ts <reviewed-40-character-commit-sha>
```

The updater accepts only a pinned SHA, validates size/count/domain format and
checksum, refuses a large list shrink and atomically replaces the snapshot.
On failure it exits nonzero, reports an operator alert and preserves the existing
snapshot. Route that failed-job output through the deployment's operator alerts;
external alert infrastructure remains task 2.4. The admin UI also warns when a
snapshot is over seven days old. Review/version the updated data and rebuild/
redeploy app and worker together; running containers retain the loaded snapshot.
Never download a list or transmit applicants' addresses to GitHub at signup.

Built-in Node DNS queries only the domain through the existing resolver. Usable
MX passes; Null MX/nonexistent domains fail. Absent MX permits valid A/AAAA
fallback. Temporary DNS failures return a retryable error. DNS has bounded
timeouts/retries and a bounded cache (positive 15 minutes, negative 2 minutes).
Allow DNS access from the container; no new provider account/API key or SMTP
mailbox probing is used. Ownership still requires a valid OTP.

### Marketplace integrity migration (0025)

Back up MySQL, stop app/worker writers, apply `0025_marketplace_integrity`, and
start the matching application/worker image without reseeding. It adds unique
buyer/listing reviews, optional buyer/request inquiry IDs, moderator restrictions,
participant archive restoration and decimal/currency saved-search bounds.
The local pre-migration backup is separate from the earlier 0024 backup.

Before any permanent schema changes, preflight rejects historical duplicate
reviews and ambiguous archived conversations with reviewed reports. Investigate
these exceptions on a copy of the source data; do not delete/merge reviews,
discard a potential moderator restriction, edit an applied migration or mark a
failed migration complete. A source-specific reviewed migration is required if
these guards stop a production restore. Historical participant archives without
a saved prior state can only restore to the legacy open state; new archives
remember whether the conversation was open or closed.

Public search, details, storefronts, related listings, reviews, contacts, REST
collections, saved-search targets and sitemap share one eligibility predicate:
completed onboarding, current approved matching Didit session, active
email/phone-verified account and current terms, unsuspended activated vendor,
plus published listing/active category. Explicit authenticated `?preview=1`
allows a verified owner/administrator to inspect unpublished content; it does
not publish it or grant anonymous contact/inquiry access.

Inquiries serialize per buyer. A retry with the same optional request ID or
identical recent payload returns the existing conversation; conflicting
payloads return conflict. Inquiry/message/outbox/analytics are one transaction.
Participant archiving is distinct from administrator restriction; only an
explicit audited admin restore clears `moderatorSuspendedAt`.

Focused real-DB/HTTP regressions require a dedicated disposable database ending
in `_marketplace_test`, supplied through `MARKETPLACE_TEST_DATABASE_URL`. Run
`pnpm exec vitest run server/marketplaceIntegrity.integration.test.ts`; the
rollback tests create temporary triggers, so use an isolated test-only account
with the necessary schema/trigger privileges. Never point it at business data.

### Vendor images and private evidence downloads

Vendor Portal supports owned listing galleries (five images maximum) and
storefront logo/cover uploads. JPEG/PNG/WebP inputs are limited to 5 MB/25 MP,
reject animation, strip metadata and normalize to WebP. Objects live under
`public/vendors/<vendorId>/`; saves check ownership, configured origin, existence
and stored type/size. Existing shared seed assets may be retained, not adopted
or deleted by a different owner. Avatar limits remain separate under 1.8.

Listing/media writes are transactional and vendor-locked. Owned replacements
are removed only after commit and only if no listing/storefront still references
them. Upload/manual cleanup removes unreferenced owned images older than 24 hours;
no global sweeper is claimed. Failed cleanup reports retry guidance. Never purge
shared assets by filename or expose an entire bucket as a cleanup shortcut.

Admin evidence links use `/api/private/evidence/<id>` with a five-minute
user-bound token plus a current authenticated, active, email-verified admin.
The proxy checks retention on every download and sends no-store/attachment/
nosniff headers with a bounded object size. It never exposes `http://garage:3900`
to browsers. Expired evidence is inaccessible, but physical retention purge and
legal-hold policy remain separate task 7.3.

### Scoped verification and evidence retention (0026)

Apply the additive reliability migration with the same backup/stop/migrate/start
procedure, without reseeding. Existing flags are not migrated into invented
verification decisions. Identity and residence now have independent, auditable
decisions tied to their source session. Manual residence needs a current utility
bill, bank statement or residential lease; manual identity needs government ID.
A business registration alone establishes neither. Combined manual submissions
require separate administrator decisions for each check, and cannot replace the
signed Didit identity required by account onboarding. Hosted results are never
manually approved. Veriff and Sumsub are disabled until their end-to-end result
integrations exist.

Starting a check preserves unrelated identity/residence and verified country.
Open overlapping sessions are rejected. A previous final decision remains
immutable; declined/expired applicants start a new session with corrected
documents. Manual sessions accept up to ten documents while created/submitted/
in review, rechecking expiry and status under lock at commit. Vendor history
includes decline reasons. Manual document review does not establish liveness.

Badges use the actual per-check decision/session or signed matching Didit
onboarding, original decision time and session expiry. Unsupported legacy status
flags alone do not issue a badge. Public business contacts must match the
verified account destinations; changing a business email/phone does not inherit
ownership of a different address/number.

**Physical KYC deletion is disabled in code pending approved retention periods
and legal-hold rules.** There is no environment flag to bypass that decision.
Admin > Verification shows expired retained evidence and audited hold/release
controls. Holds do not restore expired downloads. The deletion mechanism is
bounded, row-locked, retries storage failures and retains a minimal audit
tombstone, but its gate prevents database/object mutation while policy is
unapproved. The existing 90-day document download-access window is not approval
for physical deletion after 90 days.

The pending-registration 24-hour cleanup remains the only approved automated
destructive registration policy. Verified accounts, later KYC details, provider
event metadata, consumed contact-code ciphertext and analytics require separate
retention decisions; do not apply the registration timeout to them. Identity and
OTP fields are application-encrypted with the JWT-derived key, not proof that
MySQL/Garage volumes or backups are encrypted at rest. Verify host/volume/backup
encryption and secret recovery in the actual production environment.

### Delivery reliability and saved-search alerts (0027-0028)

Migration `0027` adds saved-search notification types. Migration `0028` adds
provider-event decision provenance and a unique outbox/channel delivery key.
Before changing permanent tables, its duplicate preflight rejects historical
duplicate delivery records. Investigate those records without deleting delivery
or audit history; agree remediation before rerunning the migration. The FK-backed
index replacements must remain in their single `ALTER TABLE` statements.

Vendor and administrator publication commit a durable matching job in the same
transaction as the listing. Immediate alerts and match completion commit together.
Daily digests contain at most 20 matches, no more than once per 24 hours.
Saved-search email is off by default: buyers must enable the dedicated preference.
New, edited or resumed searches do not backfill publications before their latest
change; previously recorded pending matches can resume. A match or queued outbox
job does not prove email delivery.

Paused or unconfigured ordinary email remains queued without consuming attempts
and resumes when restored. Queued security mail bypasses ordinary preferences and
notification pause, but honors hard-bounce/manual suppressions. Direct synchronous
registration and email-change OTP sends remain outside the outbox/delivery tracking
and ordinary notification pause/suppression; do not infer universal tracking from
the worker's policy.

Leases renew while sending; persisted in-flight markers prevent another worker
from automatically resending after lease loss or a crash. An ambiguous provider
outcome is parked for manual reconciliation, not automatic retry. In Admin >
Notifications, inspect the provider first: confirm **sent** with its message ID
to finish without resending, or confirm **not sent** with a reason to requeue.
Both actions are audited. Active sends and terminal provider outcomes cannot be
blindly retried. Exactly-once email delivery is not guaranteed.

Authenticated early/failed callbacks remain retryable under bounded backoff.
Early Didit payloads are encrypted until replay and minimized after processing;
signed per-check decisions remain append-only. Generic email-log cleanup applies
only to processed SendPulse receipts, not Didit retention. Real hosted KYC,
proof-of-address field compatibility and provider delivery still require external
acceptance.

### Deployment and temporary Turnstile test keys

Workstreams 7-10 and migrations 0026-0031 were deployed with owner authorization
on 2026-10-26. Cloudflare test keys are temporarily allowed in production.
Siteverify must still report success; test secrets skip action and hostname
matching because test responses omit the action and use a placeholder hostname.
Real secrets retain strict action and hostname validation automatically.
Test keys do not provide real bot protection. Do not disable Turnstile or change
`NODE_ENV` to work around configuration errors.

When replacing both keys, configure the allowed hostname to match `APP_URL` and rebuild the frontend
(the site key is baked into the bundle), obtain a database backup and follow the
explicit stop/migrate/start procedure. Do not reseed. Recheck readiness, HTTPS
cookies, challenge hostname/actions and real provider journeys before acceptance.
Isolated MySQL and built-image HTTP checks do not satisfy that live-provider gate
or authorize physical KYC deletion.

### Administration, reports and homepage content (0029)

Migration `0029_acceptance_and_site_content` adds the hero-slide table, listing
revision column and account/category/site-content/report audit types, plus
account/vendor status notification types. It inserts exactly the existing three homepage slides; it
does not import users, listings or production assets. Back up before explicit
migration; normal startup must not migrate or reseed.

Admin account, vendor and listing directories support search, filters and
25-row pages, with safe account projections and stable ID tie-breakers. The
overview queries actual aggregate counts instead of calling a partial page the
platform total. Detail disclosures do not expose password/session/identity
ciphertext. Listing metadata edits require a reason and the loaded row revision;
stale edits fail rather than overwriting another editor. They preserve ownership,
slug, media and publication. Preview links retain authenticated authorization.
Listing status changes prompt for a reason and a no-op publish preserves its
original publication time.

The additive listing revision increments on ORM updates, including vendor,
status and category changes; conflict detection does not depend on whole-second
timestamp rounding or writing artificial future update times.

Categories can be renamed, re-slugged, reordered or hidden. Deletion refuses
listings, saved searches or child-category references. Merge requires a different
active target and atomically reassigns listing/saved-search references, deletes
the source and records counts/target/reason. Old category-slug URLs are not
redirected automatically; review external links before re-slugging or merging.
No account closure, automatic legacy activation or vendor-onboarding bypass is
provided.

Per owner decision, administrator grants/revocations remain outside the web UI:
use the existing explicit `scripts/provision-admin.ts --email ADDRESS
--confirm-email ADDRESS` command, appending `--revoke` for revocation. Grants
require an active verified password buyer account; vendor accounts cannot be
converted. Both changes revoke existing sessions and write an audit identifying
the confirmed target and the offline database-operator action. Revocation
refuses removal of the last active verified administrator. Web suspension
refuses self-suspension and the last active administrator. Account/vendor status
changes enqueue lifecycle notifications transactionally; email delivery still
follows ordinary account-notification preferences/suppression/pause policies.

Admin > Analytics exports an audited aggregate-only CSV under the selected UTC
date/vendor/category scope. No message body, private notes, email, phone or
identity fields are selected into that report. CSV quoting covers all text
fields and neutralizes spreadsheet formula prefixes. Accounts-created is
date-only; vendors-created is date/vendor scoped, not category scoped; each CSV
row states its scope. Report counts are operational aggregates, not a
point-in-time database snapshot.

Response rates count distinct inquiries with a first vendor reply, never the
number of messages. Inquiry metrics use the inquiry-creation cohort, category
and vendor; responses stop at the selected end date. Average response is time
from inquiry creation to its first vendor reply. Unread messages and top-listing
counts use that same cohort. Closed and lead-stage metrics describe its
**current** state, not reconstructed historical state as of the end date.
Event ratios (views, contact reveals, inquiries) are not attributed unique-user
conversions and can exceed 100%. Won leads are vendor-recorded, not platform
checkout/payment evidence. Directory totals count all eligible listings, not
only the six samples. Quality and review signals use stored media and actual
duplicate/burst counts; they remain heuristics, not proof of fraud.

Admin > Site content manages **hero slides only**, as approved. Create/edit,
ordering, activation, optional UTC start/end, required alt text, audit reasons,
revision conflict protection and a preview are available. CTA links must be
internal paths or credential-free HTTPS URLs. Images reuse the public image
encoder (5 MB, validated JPEG/PNG/WebP, bounded pixels, non-animated,
metadata-stripped WebP) and use a dedicated public site-content prefix.
Saving verifies the object; vendor/private/foreign images cannot be adopted.
An upload is public immediately and unused uploads are not automatically
deleted; do not upload private identity documents here.

Public content rows cache for at most 30 seconds per app process; schedule
boundaries are checked on each request. Local saves invalidate that process's
cache; other processes converge within 30 seconds. The unchanged defaults apply
only to an empty table, not when all configured slides are inactive/scheduled
out. Database errors surface rather than masquerading as an empty table.
If the public request fails, the page explicitly reports unavailable updates
while showing its bundled defaults. The slider has a pause control and respects
reduced-motion preferences. About/Support/legal copy and featured-vendor
selection remain outside the content editor.

The normal Vitest configuration now includes `client/src/**/*.test.ts`.
Query-backed isolated regressions replace the former hardcoded-array
"visibility audit" claims. Automated checks and bounded isolated browser checks
do not close real-provider, screen-reader/mobile, load/capacity, DB/object
backup/restore, original-SOW or launch approval gates in Workstream 10.

### Vendor identity countries (0031)

The Step 2 identity Country field uses the countries enabled in Admin > SMS countries; disabling one hides it for new submissions without changing saved identities. Migration `0031_identity_countries` only widens `accountOnboarding.countryCode` to `varchar(2)`; apply it with the held migrations. Residence badges remain US/CA/MX only.

### Buyer/vendor collection budgets (0030)

Migration `0030_collection_query_budgets` adds collection/order/media/message
indexes only. Apply it explicitly with the held migrations after authorization
and backup; it does not seed, delete or rewrite application records.

Buyer wishlists, history, submitted reviews, saved searches and inquiry summaries,
vendor listings/reviews/inquiry summaries, public vendor directories and storefront
offerings now have server-side pages and UI controls. Verification status retains
its `sessions` field with paged history and `pagination`. Defaults are 20 rows,
maximum 50, page range 1-10000. Marketplace search retains its maximum of 48.
All orders have an ID tie-breaker. Offset pages describe current data, not a frozen
snapshot: concurrent inserts/removals may shift subsequent pages. Counts cover the
whole authorized/filter-matching collection, not the loaded page. Empty pages
retain their true total, and UI controls recover to the last valid page after
deletion. Tabs load their collections on demand.

Inquiry lists no longer contain message histories. `buyer.messages` and
`vendor.messages` require `inquiryId`, authorize the buyer or owning vendor and
page only visible messages; no administrator bypass is provided here. Page 1 is
the newest slice, displayed chronologically within that slice; the UI requests 30
messages and offers Older/Newer controls. Summary unread counts, last activity,
pending-response state and first-response time use the full visible thread in SQL,
not the loaded message slice. Buyer summaries still omit vendor-private notes.
Inquiry deep links query the authorized inquiry directly, even beyond page 1;
Show all conversations returns to the inbox. Unread badges explicitly describe
the current page. Notifications retain their existing numeric cursor contract,
now ordered by descending ID consistently with the cursor, with Older/Newer UI
controls and lookahead to avoid an empty trailing page.

Media lookups are batched for search, related listings, history, vendor catalogs
and storefronts. Directory samples are limited to six per vendor using SQL window
ranking; trust and verification badges are batched for the page. Badge decisions
load only the latest verified decision per check/current referenced session.
Header vendor search runs before paging rather than filtering only page 1.
Public listing review averages/counts remain full-collection SQL aggregates.

Isolated MySQL regressions instrument actual driver calls at page sizes 1 and 20.
The enforced maximum SQL round trips per collection read, excluding HTTP
authentication/context work, are:

| Collection | Maximum SQL reads |
| --- | ---: |
| Buyer wishlist, reviews, saved searches | 2 |
| Buyer history, inquiry summaries, participant messages | 3 |
| Vendor listings or inquiry summaries, including vendor-ID lookup | 4 |
| Vendor reviews, including vendor-ID lookup | 3 |
| Vendor verification status, including current badges | 6 |
| Notifications, including unread count | 2 |
| Public vendor directory, including samples/trust/badges | 8 |
| Marketplace search without category-slug lookup / related listings | 3 / 2 |
| Storefront listing helper / storefront endpoint with trust/badges | 5 / 10 |
| Public listing reviews and full rating aggregate | 2 |

These are constant query-count/payload budgets, not measured production latency,
capacity or recovery acceptance. The latter remain open under 10.5.
Disposable built-app browser checks also exercised buyer inquiry navigation
(20 then 5 rows), independent thread navigation (30 then 5 messages), a linked
inquiry outside the initial page and vendor catalog navigation (20 then 6 rows).
The preview used synthetic accounts, disabled providers and a stopped worker;
its exact disposable database was dropped after the check.

**API response change:** affected collection procedures now return
`{ items, pagination: { page, pageSize, total, totalPages } }`; storefront and
review endpoints retain their existing named arrays plus `pagination`.
REST `/vendors` and `/listings` aliases use the same paged canonical responses
inside the normal success envelope. `/listings?limit=N` remains accepted up to
100, but maps to `pageSize` capped at 48; explicit `pageSize` takes precedence.
REST `/messages` now selects the participant message procedure (or the existing
admin report-message procedure), not the entire inquiry collection. Release the
frontend and API changes together and update external consumers before rollout.

## 5. Environment configuration and provider webhooks

Required server settings in a production deployment:

- `DATABASE_URL`: MySQL 8.4-compatible connection URI.
- `JWT_SECRET`: at least 32 random characters; do not reuse local/test values.
- `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`; set `S3_FORCE_PATH_STYLE=true` for Garage and most self-hosted S3 services.
- `APP_URL`: canonical public HTTPS origin, without a trailing slash.
- `PUBLIC_MEDIA_BASE_URL`: optional public CDN base. By default, public images are served through the app's `/media/public/...` route. Keep `private/verification/...` objects private.

Optional provider credentials include `DIDIT_API_KEY`, `DIDIT_WORKFLOW_ID`, `DIDIT_WEBHOOK_SECRET`, `SENDPULSE_CLIENT_ID`, `SENDPULSE_CLIENT_SECRET`, `SENDPULSE_API_KEY`, `SENDPULSE_API_FROM_EMAIL`, `SENDPULSE_WEBHOOK_TOKEN`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_VERIFY_SERVICE_SID`. Missing credentials are not proof of provider readiness or acceptance.

Turnstile is **required in production**, not an optional fail-open integration. Set `TURNSTILE_MODE=enforced`, `TURNSTILE_SECRET_KEY`, `VITE_TURNSTILE_SITE_KEY` and `TURNSTILE_EXPECTED_HOSTNAME`; the latter must match the HTTPS `APP_URL` hostname exactly. The public site key must be supplied at client build time. Missing/dummy keys, disabled production protection, missing provider action/hostname claims, and mismatched claims fail closed. Only local/test environments may explicitly use `TURNSTILE_MODE=disabled`. See [production origin/provider cutover](DIDIT_SETUP.md) for the outstanding external acceptance gates and canonical SEO routes.

These integrations are optional for browsing a private demo, **not** for completing
the agreed onboarding in production. Missing credentials produce explicit errors;
they never auto-verify an account.

- Email OTP, email changes and recovery: configure SendPulse client ID/secret (or
  a valid supported API access token), `SENDPULSE_API_FROM_EMAIL`, and optionally
  `SENDPULSE_API_FROM_NAME`. Verify the sender/domain and SPF/DKIM in SendPulse.
  The app reports OTP delivery only after explicit provider acceptance, not
  guaranteed inbox delivery.
- SMS: set `SMS_PROVIDER=twilio` with all three `TWILIO_*` settings, or
  `SMS_PROVIDER=sendpulse` with SendPulse client credentials and
  `SENDPULSE_SMS_SENDER`. Enable your selected SMS destination countries (initially US/CA/MX/NG), SMS permissions,
  sender registration and any trial-recipient restrictions in the provider.
- Didit: configure all three `DIDIT_*` settings and a workflow containing approved
  ID verification. Its signed V3 decision must expose
  `id_verifications[].first_name`, `last_name`, `date_of_birth` and `status`.
  Approval without a matching verified name/DoB stays in review and cannot
  activate a vendor. Allow these response attributes in the workflow.
  See [Didit webhook contract](https://docs.didit.me/integration/webhooks).
- Real email delivery, both SMS configurations and a hosted Didit journey must
  still be accepted using your provider accounts. Mocked provider regressions
  are not live-provider acceptance.

After moving to a public HTTPS domain, update provider callback/webhook settings:

- Didit returns onboarding users to `{APP_URL}/vendor/onboarding`; returning does not grant KYC approval. Its signed webhook endpoint is `POST {APP_URL}/api/webhooks/kyc/didit`. Configure the same `DIDIT_WEBHOOK_SECRET` in the app and provider; subscribe to `status.updated` and `data.updated`, using `X-Signature-V2` or the exact-body `X-Signature` (not envelope-only Simple signatures).
- SendPulse delivery webhook is `POST {APP_URL}/api/webhooks/email/sendpulse?token={SENDPULSE_WEBHOOK_TOKEN}`. Configure the identical random token in the provider and the app.
- Turnstile's allowed hostname and `TURNSTILE_EXPECTED_HOSTNAME` must match the deployed host; update the public site key and server secret as a pair.
- Twilio Verify is checked server-to-server; the account flow does not require a Twilio callback endpoint. No localhost endpoint is publicly reachable by a provider: use a temporary HTTPS tunnel with matching `APP_URL` for local Didit webhook testing, or a staging HTTPS domain.

When migrating existing records, preserve object keys and upload/copy the referenced public files before switching traffic. Migration `0019_storage_keys` backfills new storage-key columns while leaving legacy URL columns intact for rollback/inspection. Do not import private verification documents into the public media prefix. Test private evidence downloads with an admin account, and check that anonymous `/media/private/...` requests are rejected.

---

## 3. Worker Monitoring & Incident Response
### 3.1 Unhealthy Worker Detection
- **Symptom**: `notificationOutbox` rows remain in `queued` or `failed` state with `attempts >= 6`.
- **Admin Action**: Open Admin Control Room → **Notifications** tab.
  - Review failed delivery errors and SendPulse rejection codes.
  - Retry definite provider failures only after resolving their cause. Unknown
    outcomes require the explicit provider reconciliation described above; never
    blindly resend a possibly accepted message.
  - Unblock any active recipient email in the **Suppressions** subpanel.

### 3.2 High-Risk Abuse / Spam Incident
- **Symptom**: Spikes in review submissions or inquiries from a single IP/account.
- **Automated Shield**: Cloudflare Turnstile rejects bots at the edge; rate limiters enforce cooldowns on inquiry creation and contact reveals.
- **Admin Action**: Open Admin Control Room → **Conversation Reports** tab.
  - Click **Suspend User** or **Hide Message** to immediately remove abusive content from the marketplace without code deploys.
