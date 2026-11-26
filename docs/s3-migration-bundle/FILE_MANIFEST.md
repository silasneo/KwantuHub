# KwantuHub S3 Migration File Manifest

The `source/` directory contains copies of current files from the KwantuHub application. Paths below are relative to the application root.

## Tier 1 — Must modify for S3 portability

| File | Required change |
|---|---|
| `server/storage.ts` | Replace Forge presign/upload/get behavior with AWS SDK S3-compatible adapter; preserve stable keys; add signed URLs and delete/head operations. |
| `server/_core/storageProxy.ts` | Remove the Forge `/manus-storage/*` proxy or replace it with a provider-neutral public-media route. Never expose private KYC objects through an unauthenticated route. |
| `server/_core/env.ts` | Remove storage dependence on Forge variables; add S3, CDN, URL, worker, and production validation settings. |
| `server/_core/index.ts` | Remove/register the storage proxy as appropriate; make worker startup optional when using an external worker. |
| `server/routers.ts` | Add secure upload/presign/delete procedures; validate ownership, MIME, size, prefixes, and media count; reject missing private uploads. |
| `drizzle/schema.ts` | Ensure media/evidence rows store stable object keys and safe metadata, not provider URLs. Add visibility/content type/size/checksum/lifecycle fields if required. |
| `drizzle/relations.ts` | Update relations if storage metadata tables or columns are added. |
| `server/db.ts` | Ensure public projections generate provider-neutral URLs and never return private evidence paths. |
| `server/seed.ts` | Replace seeded `/manus-storage/...` asset references with migrated keys/CDN URLs. |
| `server/seoService.ts` | Remove hardcoded Manus domain and use required production `APP_URL`. |
| `client/src/components/SEOHead.tsx` | Remove hardcoded Manus canonical/OG base URL. |
| `client/index.html` | Replace hardcoded Manus Open Graph/canonical URLs. |
| `client/src/components/SiteChrome.tsx` | Replace Manus-hosted identity mark. |
| `client/src/pages/Home.tsx` | Replace Manus-hosted hero/story image URLs. |
| `client/src/pages/LoginPage.tsx` | Replace Manus-hosted identity image URL. |

## Tier 2 — Must inspect/update for hardcoded assets or URL leakage

```text
client/src/pages/ListingDetail.tsx
client/src/pages/VendorDirectory.tsx
client/src/pages/VendorStorefront.tsx
client/src/pages/VendorPortal.tsx
server/apiV1Router.ts
server/openapi.ts
server/privacyAudit.test.ts
server/seoService.test.ts
server/apiV1.test.ts
server/apiV1Http.test.ts
server/apiV1LiveAcceptance.test.ts
server/acceptanceMatrix.test.ts
```

These files cover media rendering, public projections, REST/OpenAPI contracts, privacy assertions, the vendor upload UX, and end-to-end acceptance.

## Tier 3 — Add for the portable implementation

```text
server/storageProvider.ts
server/storageProvider.test.ts
server/config.ts
server/worker.ts
scripts/migrate-storage.ts
scripts/check-storage-objects.ts
scripts/check-manus-dependencies.sh
Dockerfile
docker-compose.yml
.dockerignore
docs/DEPLOYMENT.md
```

Use the new adapter for AWS S3, Cloudflare R2, MinIO, DigitalOcean Spaces, and other S3-compatible providers. Add a standalone worker for Docker/VPS/ECS and a scheduled worker path for Vercel/Netlify.

## Tier 4 — Remove, isolate, or make optional

```text
vite.config.ts
package.json
pnpm-lock.yaml
client/public/__manus__/
.manus-logs/
server/_core/oauth.ts
server/_core/sdk.ts
server/_core/types/manusTypes.ts
shared/const.ts
server/_core/dataApi.ts
server/_core/imageGeneration.ts
server/_core/llm.ts
server/_core/map.ts
server/_core/notification.ts
server/_core/voiceTranscription.ts
server/_core/heartbeat.ts
```

Inspect imports first. Remove legacy/template modules only when confirmed unused; replace actively used Forge features with independent adapters.

## Tier 5 — Update documentation

```text
README.md
docs/ARCHITECTURE_DECISION.md
docs/MVP_FINAL_ACCEPTANCE_MATRIX.md
docs/RUNBOOK.md
docs/SEED_DATA_STRATEGY.md
docs/DIDIT_SETUP.md
docs/SENDPULSE.md
docs/CLAUDE_HANDOVER_AUDIT_PROMPT.md
todo.md
```

## Do not include in a migration archive

```text
.env
.env.* with real values
node_modules/
dist/
.manus-logs/
production database dumps
KYC documents or identity images
private provider credentials
```
