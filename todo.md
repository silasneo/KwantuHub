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
- [x] Add idempotent inquiry notification event enqueueing for create, reply, and resolution flows.
- [x] Add retry-safe outbox worker with in-app fan-out and queued email delivery records.
- [x] Document notification procedures in Swagger/OpenAPI and add worker policy tests.
- [x] Integrate the server-only SendPulse adapter with OAuth/API-key auth, token caching, timeouts, and provider delivery status updates.
- [x] Add SendPulse payload/configuration tests without issuing live email sends.

## Verification

- [x] `pnpm run check`
- [x] `pnpm test` — 6 tests passed.
- [x] `pnpm run build`
- [x] `git diff --check`
- [x] Live route checks for public pages, portals, `/api-docs`, and `/openapi.json`.
- [x] Live JWT checks for buyer, vendor, and admin sessions.
- [x] Live contact reveal, related listings, vendor analytics/reviews, admin feature flags, and dispute schema checks.
- [x] Desktop visual QA screenshots captured for homepage, marketplace, listing detail, account, vendor, and admin routes.

## Publish

- [x] Commit and push this release to GitHub in PR #3 after final checkpoint.
