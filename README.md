# KwantuHub Marketplace

KwantuHub is a React/Vite marketplace with an Express/tRPC API, Drizzle ORM, and MySQL. Public media uses stable S3 object keys; private verification evidence stays in a private prefix and is downloaded through an authenticated same-origin proxy with short-lived, user-bound links.

## Local Docker deployment

Requirements: Docker Desktop with Compose and the exported assets in `docs/s3-assets-export/`.

1. Copy `.env.example` to `.env` and replace the database and secret placeholders with unique random values. Keep `.env` private; it is git-ignored.
2. Start the local services:

   ```powershell
   docker compose build app
   docker compose up -d mysql garage
   docker compose --profile maintenance run --rm migrate
   if ($LASTEXITCODE -ne 0) { throw "Migration failed; do not start writers." }
   # Optional initial bundled brand-asset import:
   docker compose --profile maintenance run --rm import-assets
   docker compose up -d worker app
   ```

   Normal startup does not migrate, import or seed. Run maintenance steps deliberately after backup; never reseed existing user data. The app is bound to `http://localhost:3000`; MySQL to `127.0.0.1:3307`. Garage and worker health remain internal; named volumes persist data.
3. Check readiness and logs:

   ```powershell
   docker compose ps
   Invoke-RestMethod http://localhost:3000/api/v1/ready
   docker compose logs --tail 100 app worker
   ```

Optional demo logins are created only by explicitly running `dev-bootstrap` with the `development` profile in a separate development project/environment after migrations:

- Admin: `admin@kwantuhub.local`
- Buyer: `demo.buyer@kwantuhub.local`
- Vendor: `demo.vendor.eki@kwantuhub.local`
- Local-only password for all three: `DemoPass123!`

Do not use demo accounts or their password outside a private local environment. They are not proof of verified email/onboarding. The login page does not publish demo credentials. Provision production administrators by promoting an owner-registered, email-verified buyer using the operator-only CLI described in [Production runtime and recovery](docs/PRODUCTION_RUNTIME.md); there is no default administrator credential.

To stop services while preserving data, run `docker compose down`. To permanently delete the local database and object-store data, remove the named volumes with `docker compose down -v` (this is destructive).

## Local development without Docker

```bash
pnpm install
pnpm dev
```

The app requires a MySQL-compatible `DATABASE_URL` to use database-backed pages. Object-storage actions additionally require `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY`.

## Quality checks

```bash
pnpm run check
pnpm test
pnpm run build
```

Some legacy acceptance tests expect a running app, old demo verification states
and seeded data; their failures are not proof the isolated account/media journeys
failed, nor may they be treated as production sign-off. Current DB regressions use
dedicated `_account_test` / `_media_test` databases; see `docs/RUNBOOK.md`. Never
point test database settings at user data.

## External providers and webhooks

The app can start without external provider credentials, but those flows are unavailable until configured. See `docs/RUNBOOK.md` for environment and webhook details. Third-party webhooks cannot reach a localhost URL; use a secure public HTTPS tunnel for local webhook testing.

## API documentation

The interactive Swagger UI is available at `/api-docs`; the OpenAPI JSON contract is at `/openapi.json`.
