# KwantuHub Stage 0 + Stage 1 Acceptance

**Status:** Passed end-to-end on 27 September 2026

**Application:** https://3000-inbybxr6nnjqu3jlamnsv-e56237f1.us1.manus.computer

**Health:** https://3000-inbybxr6nnjqu3jlamnsv-e56237f1.us1.manus.computer/api/v1/health

> The sandbox URL is temporary. Production deployment remains a separate next step.

## Test credentials

All deterministic accounts use password `DemoPass123!`.

| Role            | Email                             | Route      |
| --------------- | --------------------------------- | ---------- |
| Admin           | `admin@kwantuhub.local`           | `/admin`   |
| Approved vendor | `demo.vendor.eki@kwantuhub.local` | `/vendor`  |
| Buyer           | `demo.buyer@kwantuhub.local`      | `/account` |

The seed also creates `demo.vendor.pending@kwantuhub.local` in `PENDING` status for repeatable admin moderation testing.

## Checkpoints

| #   | Checkpoint                    | Result | Evidence                                                                                                                                      |
| --- | ----------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Running full-stack foundation | Passed | Next.js App Router, PostgreSQL, Prisma migration `20260927124047_init`, seed, and `/api/v1/health` all run successfully.                      |
| 2   | Authentication + RBAC         | Passed | Buyer/vendor registration, login, logout, current session, opaque hashed sessions, protected layouts, vendor/admin API role rejection.        |
| 3   | Vendor onboarding + approval  | Passed | Vendor profile submission persists `PENDING`; unapproved listing creation returns `403`; admin approval persists `APPROVED`.                  |
| 4   | Storefront + listing          | Passed | Stable collision-safe storefront slug, listing `DRAFT`, validated image upload, publication, hide/archive lifecycle, PostgreSQL persistence.  |
| 5   | Marketplace vertical slice    | Passed | API-backed search, category, type, location, price text, approved vendor, remote, sorting, URL state, pagination, listing detail, storefront. |
| 6   | Buyer save + inquiry          | Passed | Save/unsave, inquiry creation, vendor inbox, vendor reply, and buyer-visible reply all persist in PostgreSQL.                                 |

## Final automated workflow

The final acceptance execution created:

- Vendor: `acceptance.vendor.1790521497446@kwantuhub.local`
- Storefront: `/vendors/acceptance-textiles-1790521497446`
- Listing: `/listings/acceptance-ankara-1790521497446`
- Buyer: `acceptance.buyer.1790521497446@kwantuhub.local`
- Inquiry: `cmujy9tj3001jpn0rv219fdj5`
- Reply: `cmujy9tnr001opn0r85zr2ves`

The script validated health, pre-approval blocking, admin approval, storefront creation, draft/media/publish, filtered search, public detail/storefront pages, buyer save/inquiry, vendor reply, buyer reply visibility, and unauthorized RBAC rejection.

Run it again with:

```bash
pnpm run test:acceptance
```

## Database evidence

After the final workflow, PostgreSQL contained:

| Entity          | Count |
| --------------- | ----: |
| Users           |    13 |
| Vendor profiles |     9 |
| Storefronts     |     7 |
| Listings        |    14 |
| Wishlists       |     3 |
| Inquiries       |     3 |
| Messages        |     6 |

The deterministic seed includes 18 approved categories, 5 clearly labelled demo vendors (4 approved and 1 pending), and 12 clearly labelled demo listings.

## Quality gates

- Prisma schema validation: passed
- Unit tests: 4/4 passed
- TypeScript: passed
- ESLint: passed with no errors
- Next.js production build: passed
- Desktop and 390px mobile screenshots: captured
- Public application and health URLs: HTTP 200

## Visual evidence

- `docs/screenshots/homepage-desktop.png`
- `docs/screenshots/homepage-mobile.png`
- `docs/screenshots/marketplace-desktop.png`
- `docs/screenshots/vendor-dashboard.png`
- `docs/screenshots/buyer-account.png`
- `docs/screenshots/admin-dashboard.png`

## Docker / Manus Desktop

Docker is optional. The current sandbox runs native PostgreSQL and Next.js successfully. `Dockerfile`, `docker-compose.yml`, and `docs/docker-desktop.md` are included for a reproducible move to Manus Desktop/My Computer.

## Known blocker and next task

There is no blocker to local Stage 0/1 testing. The remaining production blocker is infrastructure selection and credentials for a durable PostgreSQL database, S3-compatible object storage, and public hosting. The next implementation task is production deployment/hardening followed by the remaining MVP moderation, reviews, SEO, and analytics work.
