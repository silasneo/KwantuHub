# Architecture Decision Record (ADR): KwantuHub Full-Stack Implementation Architecture

## Status
Implemented architecture; stakeholder/SOW sign-off and production acceptance pending.

## Context & Decision
The initial project brief contemplated a target stack using Next.js (App Router), Route Handlers (`/api/v1/*`), Prisma ORM, and PostgreSQL. 

The current implementation uses the following stack. This records code reality,
not approval to substitute contractual deliverables or deploy to production:
- **Frontend**: React 19 + Vite + Tailwind CSS 4 + Lucide Icons + Wouter
- **API & Contracts**: tRPC 11 with end-to-end typed procedures, OpenAPI / Swagger live UI documentation at `/api-docs` and schema at `/openapi.json`
- **Backend Runtime**: Express 4 with modular sub-routers, cookie-scoped JWT authentication with bcrypt, and background outbox workers
- **Database & Data Layer**: Drizzle ORM with local Docker MySQL 8.4. A managed MySQL-compatible production host has not been accepted.
- **Storage & Workers**: S3-compatible storage (local Garage) and an independent durable-outbox worker. Local volumes are not off-instance backups or evidence of redundancy/encryption.

## Key Architecture Advantages & Parity
1. **Typed application contracts**: tRPC shares request/response types. Runtime validation, database constraints and API tests remain necessary; types alone do not prove contract parity or correct authorization.
2. **OpenAPI / REST Parity**: Live OpenAPI documentation at `/api-docs` exposes the full API specification for all public marketplace, buyer, vendor, admin, verification, inquiry, notification, and analytics endpoints.
3. **Strict Browser / Database Separation**: Browser code strictly calls tRPC hooks (`trpc.*.useQuery / useMutation`); direct database access (Drizzle ORM) occurs exclusively within server-side procedures under `server/routers.ts` and `server/db.ts`.
4. **Build tooling**: Vite provides development HMR and production bundling. No production capacity, build-duration or latency guarantee is inferred without measured evidence.
5. **Robust Migration Management**: Drizzle-kit generates deterministic, reviewed SQL migrations applied safely via managed database execution tools.
6. **Provider integrations**: SendPulse email, enforced production Cloudflare Turnstile, Twilio Verify (or manually selected SendPulse SMS), signed Didit identity/results and scoped manual document review. Veriff/Sumsub are disabled. Missing credentials do not auto-verify users or imply automatic provider failover.

## Conclusion
The active stack is Vite + Express + tRPC + Drizzle/MySQL, not the originally
contemplated Next.js/Prisma/PostgreSQL stack. The original signed SOW, kickoff and
brand PDFs are not present in this worktree for re-verification. Obtain those
sources and stakeholder approval before declaring contractual equivalence.

Payments, checkout and payouts remain outside the authorized MVP. Account
deletion/export, physical KYC retention and legal terms need separate policy
approval. Real provider/HTTPS acceptance, off-instance DB/object recovery,
accessibility and measured load acceptance remain open in `todo.md`.
The deployment hold for real Turnstile keys remains in force; this document
does not authorize migrations, deployment, commits or release.
