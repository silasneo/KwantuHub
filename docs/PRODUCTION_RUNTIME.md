# Production runtime and recovery

This guide covers the Compose deployment, not evidence of production acceptance.
The shipped Garage topology is **single-node, not redundant**. Persistent volumes
are not backups. TLS, external monitoring, off-instance backup storage and a
successful isolated restore rehearsal remain deployment prerequisites.

## Deliberate deployment, never demo seed on startup

Use a separate Compose project and separate environment file for each environment.
Keep credentials outside Git; restrict environment-file permissions and percent-
encode reserved characters in credentials used in `DATABASE_URL`.
Build with the actual public Turnstile site key (it is embedded in client assets).
`APP_URL` must be the final HTTPS origin before password-reset emails are enabled.
Never print `docker compose config` in CI logs: its full output expands secrets;
use `docker compose config --quiet` for syntax checks.

Run the following in a planned maintenance window after taking verified backups.
These commands intentionally modify the selected environment; none is automatic:

```sh
docker compose build app
docker compose up -d mysql garage
docker compose --profile maintenance run --rm migrate
# Optional, only when intentionally importing the bundled public brand assets:
docker compose --profile maintenance run --rm import-assets
docker compose up -d worker app
docker compose ps
```

Migrations and asset import have the explicit `maintenance` profile. Neither
app nor worker depends on or invokes a migration, import, or seed command.
Review the migrations before applying; do not use schema push against production.
The import replaces the bundled fixed public keys; it is not a user-data restore.

The `development` profile contains **only explicit demo bootstrap**. It includes
predictable demo passwords and must never run against production or a production
backup. After migrations in an isolated development project:

```sh
docker compose -p kwantu-development --env-file .env.development --profile development run --rm dev-bootstrap
```

The profile does not isolate data by itself: the project name, credentials and
volumes must also be separate. Default `docker compose up -d` never runs demo seed.

### First administrator (no generated or shared credentials)

The operator first registers a normal **buyer** account through the real UI and
verifies ownership of its email. Choose a strong unique password there; no CLI
password or known default is supported. Then, with privileged deployment access:

```sh
docker compose run --rm --no-deps app pnpm exec tsx scripts/provision-admin.ts --email owner@example.org --confirm-email owner@example.org
```

The explicit matching address prevents accidental selection. The command refuses
unknown, unverified, suspended, vendor, and passwordless accounts. It locks the
row, promotes an eligible buyer in one transaction and revokes existing sessions;
sign in again afterwards. An existing admin is a no-op. Output contains only the
user ID and whether a change occurred, never a password. Deployment-host/DB
access is the trust boundary for this maintenance action; record approval and
the returned ID in restricted operator audit records. No HTTP admin-bootstrap
endpoint exists. Do not promote demo accounts.

## Readiness, liveness and shutdown

* `/api/v1/live` checks process serviceability, not dependencies.
* `/api/v1/ready` and its compatibility alias `/api/v1/health` return 200 only
  when MySQL responds, the configured S3 bucket is reachable, the pinned email
  policy snapshot loads, and the worker heartbeat is healthy and at most
  120 seconds old. Failure is 503. Responses contain only dependency names and
  `ok`/`unavailable`, no endpoints, credentials, exceptions, or queue payloads.
* Checks run concurrently with a two-second response budget and a single in-flight
  check per dependency. A timed-out check is not duplicated while still pending.
  S3 is checked with authenticated `HeadBucket`, never a public bucket listing.
* The worker listens internally on port 3001: `/live` and `/ready`; no host port
  is published. It requires healthy delivery, retention and registration cleanup
  loops. Its atomic heartbeat file is shared read-only with the app using the
  `worker-runtime` volume, not a table or a durable data backup. Do not scale
  workers or inline workers concurrently without designing per-instance health.
* Each job starts immediately and schedules its next run only after completion.
  Delivery processes at most five rows, stops claiming after a 60-second batch
  budget, and renews the 120-second lease per row rather than per batch. Provider
  requests retain the adapter's existing ten-second request timeouts. There is
  one delivery, one retention and one registration-cleanup job in flight at most.
  Retention deletes at most 500 rows per table per run; registration cleanup
  removes at most 500 expired pending registrations every five minutes.
* A 90-second job watchdog reports a stalled job and makes worker readiness fail;
  it does not start overlapping retries against a still-running DB operation.
  A failed job retries on the next scheduled run. Batch failure/dead-letter/
  reclaimed counts and sanitized component/error-type events go to stdout/stderr;
  inspect restricted DB delivery/error records for details, not public health.
* SIGTERM/SIGINT stop admission and new claims, drain active HTTP requests and
  jobs, invalidate the worker heartbeat, and exit. Application drain deadline is
  45 seconds; Compose gives 50 seconds before force-kill. A stuck operation exits
  nonzero at that deadline. Already claimed outbox work is recovered using leases;
  provider idempotency remains necessary if a send succeeded before interruption.
* Production binds exactly `PORT` and exits nonzero if it is occupied or invalid.
  Development may still select one of the next 19 ports. There is no production
  fallback that silently bypasses a proxy or probe.

Readiness is not proof of provider delivery or legal/provider acceptance. Worker
failure never disables password-reset or account-email processing; they remain
on the normal outbox path. Configure SendPulse in **both** app and worker as
needed, and separately complete approved provider acceptance tests.

## Edge TLS and host monitoring (operator-owned)

The app binds `127.0.0.1:3000` on the host. Use a host reverse proxy with an
automatically renewed certificate; expose only ports 80/443 publicly. MySQL's
3307 binding is also loopback-only; remove it entirely if host DB access is not
needed. Garage S3/admin and worker health must remain private.

Example Caddy host configuration, after replacing the domain and provisioning DNS:

```caddyfile
market.example.org {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000
    header Strict-Transport-Security "max-age=31536000"
}
```

Set `APP_URL=https://market.example.org`. Trust only the actual proxy's source
address/CIDR in `TRUST_PROXY`; do not use blanket trust or assume all Docker
private ranges are trusted. Inspect the proxy's observed source address on this
host and verify spoofed forwarded headers cannot bypass IP controls. If the
proxy runs in Docker instead, keep app on a private network, do not publish it
publicly, and configure trust for that specific network boundary. Preserve
forwarded scheme/host/IP headers. Verify secure cookies, OTP rate limits,
private-download authorization and certificate renewal before opening traffic.

Compose caps each JSON log at 10 MiB with three rotated files per container.
Baseline limits are MySQL 1 GiB/2 CPUs, Garage 512 MiB/1 CPU, app 512 MiB/1 CPU,
worker 512 MiB/1 CPU and 256 PIDs per service; these are starting budgets, not
load-test results. Reserve host/backup/proxy memory beyond these budgets.
Do not reduce MySQL memory without testing its buffer/cache configuration.

An external monitor must alert on sustained 503/stale heartbeat, dead letters,
restart/OOM events, failed backups/certificate renewal, disk or inode pressure
(for example >80% warning, >90% critical), and sustained memory pressure.
Docker marks unhealthy services but **does not automatically restart a running
unhealthy container**; arrange an operator alert/remediation policy. Keep log
shipping access-controlled and redact personal data; rotation alone is not
retention or monitoring. Confirm budget/retention/threshold choices under load.

## Off-instance backup and isolated restore procedure

Agree RPO/RTO, retention, destination, encryption/key custody and an owner first.
No external backup destination, scheduler or monitoring account is provisioned
by this change. Never put backup keys or production dumps in Git.

1. Enter a maintenance window. Block public writes at the proxy and gracefully
   stop app and worker. Capture the deployment image digest, schema migration
   journal, configuration version and backup timestamp (no secrets in manifests).
2. Take a consistent MySQL logical dump using a restricted backup account:
   `mysqldump --single-transaction --routines --triggers --events --hex-blob
   --no-tablespaces ...`. Read credentials from a restricted option/secret file,
   not command-line passwords. Stream the result directly to an encrypted archive
   in a restricted persistent backup directory. Check command exit codes; do not
   treat an empty/partial dump as success.
3. With object writes still stopped, either export **all public and private**
   S3 objects plus metadata/checksums using an approved authenticated S3 backup
   tool, or stop Garage and archive **both** `garage-meta` and `garage-data`
   volumes together, preserving permissions and matching Garage configuration
   and version. Restart Garage after the archive completes. Do not copy live
   Garage metadata files and assume crash consistency. Record object counts,
   bytes and checksums. Do not back up worker-runtime as application data.
4. Encrypt and copy the DB/object archives and manifest to a versioned,
   access-restricted **off-instance** destination. Verify remote checksums and
   decryptability with the recovery key before expiring older backups. Keep an
   independently controlled/immutable copy to survive host or credential loss.
   A copy on another volume of this host is not off-instance recovery.
5. Resume Garage/app/worker and public traffic only after dependency health
   recovers. Alert on missed/failed scheduled backups and test backup-age limits.
6. For restore, provision an **isolated** project/host with new volumes and no
   public traffic. Disable provider credentials and egress so restored queued
   emails cannot contact real users. Load the matching DB dump into an empty
   MySQL database; restore the matching Garage pair/config or import the S3
   export into a new private bucket. Retain the recorded version first, then
   review/apply forward migrations explicitly. Never seed into restored data.
7. Validate row counts/migration journal, representative public and private
   object checksums/metadata, ownership/authorization, sign-in, health, and
   outbox/lease state. Deliberately decide how restored pending notifications
   are suppressed or replayed before enabling production providers; snapshot
   recovery can otherwise resend already delivered messages.
8. Record measured restore time, data-loss window and verifier results under
   task 10. Only then approve controlled cutover and re-enable providers.
   Roll back to the original isolated source if validation fails; never overwrite
   the only good backup or the live volumes during rehearsal.

**Still open:** actual domain/certificate/proxy deployment, trustworthy proxy-IP
verification, external alerts, off-instance encrypted backup automation and key
custody, load-tested sizing, and an evidenced restore rehearsal/RPO/RTO signoff.
Do not mark task 2.4 or recovery acceptance complete from documentation alone.
