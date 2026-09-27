# KwantuHub MVP

Production-oriented Next.js marketplace MVP for African diaspora vendors, service providers, and buyers in North America.

## Stack

- Next.js App Router, React, TypeScript
- Next.js Route Handlers under `/api/v1/*`
- PostgreSQL and Prisma ORM
- Opaque, hashed database-backed sessions in secure HTTP-only cookies
- Local image-storage adapter for development; S3-compatible production adapter seam

The browser never imports Prisma or accesses PostgreSQL directly.

## Local setup

```bash
cp .env.example .env
pnpm install
pnpm exec prisma migrate dev
pnpm run db:seed
pnpm dev
```

Open `http://localhost:3000`. Docker is optional; this project works with any reachable PostgreSQL instance configured through `DATABASE_URL`.

For a reproducible Docker Desktop stack, use the [Docker Desktop runbook](docs/docker-desktop.md).

## Deterministic demo credentials

All seeded accounts use password `DemoPass123!`.

| Role            | Email                             |
| --------------- | --------------------------------- |
| Admin           | `admin@kwantuhub.local`           |
| Buyer           | `demo.buyer@kwantuhub.local`      |
| Approved vendor | `demo.vendor.eki@kwantuhub.local` |

Demo vendors and listings are explicitly labelled as demo data.

## Verification

```bash
pnpm run db:validate
pnpm run db:seed
pnpm test
pnpm run lint
pnpm run build
pnpm run test:acceptance
```

The acceptance script uses real HTTP requests and PostgreSQL records to test:

1. Health and database connectivity
2. Vendor registration/profile submission
3. Pre-approval publication rejection
4. Admin approval
5. Storefront creation
6. Listing draft, image upload, and publication
7. Marketplace search/filter and public detail/storefront routes
8. Buyer save and inquiry
9. Vendor inbox and reply
10. Buyer-visible reply and unauthorized RBAC rejection

## Important routes

| Route              | Purpose                                 |
| ------------------ | --------------------------------------- |
| `/`                | Branded homepage                        |
| `/marketplace`     | Searchable and paginated marketplace    |
| `/listings/[slug]` | Listing detail, save, inquiry           |
| `/vendors/[slug]`  | Public vendor storefront                |
| `/vendor`          | Protected vendor dashboard              |
| `/account`         | Protected buyer saves and conversations |
| `/admin`           | Protected vendor approvals              |
| `/api/v1/health`   | Application/database health             |

The current API contract is in [`docs/openapi.yaml`](docs/openapi.yaml).

## Storage

Development uploads are written under `public/uploads` through `lib/storage`. Production should set `STORAGE_DRIVER=s3` and implement/configure the S3-compatible adapter without changing route or service callers. Uploaded binaries are never stored in PostgreSQL.

## Scope guardrails

This is a lead-generation/classifieds marketplace. Checkout, payments, subscriptions, logistics, and advertising are intentionally excluded from the MVP.
