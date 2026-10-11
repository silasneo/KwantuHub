# KwantuHub Marketplace

KwantuHub is a full-stack diaspora marketplace built with React, Vite, tRPC, Drizzle, and the managed WebDev database.

## Current release

This release includes the approved `Kwantu-identity.svg` brand mark, a vendor directory with vendor-specific storefronts, prototype-inspired hero slider and managed media, masonry marketplace cards with a sticky filter rail, JWT authentication for buyers/vendors/admins, user profile avatars, vendor listing and inquiry workflows, and admin vendor moderation.

## Authentication

User, vendor, and admin login uses email/password with bcrypt password hashing and a signed `kwantu_jwt` httpOnly cookie. Manus OAuth is not used by the active application login path. Seeded demo accounts use password `DemoPass123!`:

- `admin@kwantuhub.local`
- `demo.buyer@kwantuhub.local`
- `demo.vendor.eki@kwantuhub.local`

## API documentation

The live interactive Swagger UI is available at `/api-docs`; the raw OpenAPI 3 JSON contract is available at `/openapi.json`. The documented API is the current tRPC-over-HTTP surface under `/api/trpc`.

## Local development

```bash
pnpm install
pnpm dev
```

Quality gates:

```bash
pnpm run check
pnpm test
pnpm run build
```

Prototype images and the correct identity mark are stored through the managed `/manus-storage/` path rather than committed to `client/public`.
