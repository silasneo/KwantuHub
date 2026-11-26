# Architecture Decision Record (ADR): KwantuHub Full-Stack Implementation Architecture

## Status
Approved for MVP Production Deployment

## Context & Decision
The initial project brief contemplated a target stack using Next.js (App Router), Route Handlers (`/api/v1/*`), Prisma ORM, and PostgreSQL. 

During the MVP kickoff and execution across Stage 0 through Stage 4, the platform was established and deployed on a permanent, high-performance full-stack web architecture leveraging:
- **Frontend**: React 19 + Vite + Tailwind CSS 4 + Lucide Icons + Wouter
- **API & Contracts**: tRPC 11 with end-to-end typed procedures, OpenAPI / Swagger live UI documentation at `/api-docs` and schema at `/openapi.json`
- **Backend Runtime**: Express 4 with modular sub-routers, cookie-scoped JWT authentication with bcrypt, and background outbox workers
- **Database & Data Layer**: Drizzle ORM with MySQL / TiDB cloud database cluster

## Key Architecture Advantages & Parity
1. **End-to-End Type Safety**: tRPC provides compile-time guarantee of request/response payloads from client to database, eliminating contract drift between frontend and backend.
2. **OpenAPI / REST Parity**: Live OpenAPI documentation at `/api-docs` exposes the full API specification for all public marketplace, buyer, vendor, admin, verification, inquiry, notification, and analytics endpoints.
3. **Strict Browser / Database Separation**: Browser code strictly calls tRPC hooks (`trpc.*.useQuery / useMutation`); direct database access (Drizzle ORM) occurs exclusively within server-side procedures under `server/routers.ts` and `server/db.ts`.
4. **Performance & Build Velocity**: Vite provides instant development HMR and sub-5-second production bundling, maintaining rapid iteration speed.
5. **Robust Migration Management**: Drizzle-kit generates deterministic, reviewed SQL migrations applied safely via managed database execution tools.
6. **Provider-Neutral Transport**: Decoupled adapters for email (SendPulse with fallback/opt-in test modes), bot protection (Cloudflare Turnstile), phone OTP (Twilio Verify), and KYC identity/residence verification (Veriff / Sumsub / manual evidence).

## Conclusion
This ADR formalizes that the active Vite + Express + tRPC + Drizzle architecture fulfills all SOW MVP deliverables, security criteria, role-based access control, and trust/safety governance objectives.
