# KwantuHub S3-Compatible Storage Migration Bundle

This bundle contains **historical reference copies** of the KwantuHub files
identified during the original Manus Forge storage migration audit. It is not
an installable/current application snapshot or a production database/object export.

The active repository has since implemented provider-neutral S3/Garage storage,
`public/` and `private/` keys and authorized private evidence downloads. Do not
copy this bundle's `source/` over the active application, or deploy its old
configuration. `FILE_MANIFEST.md`, `file-list.txt`, `portable-env-template.txt`
and the design/sequence below are retained as export-time audit history.

Use the active `.env.example`, `docs/PRODUCTION_RUNTIME.md` and
[asset reconciliation/rehearsal guide](../ASSET_RECONCILIATION.md) instead.
The seven valid local visual assets have pinned source hashes and read-back
import checks, but no current authorized production database/object export is
available. Neither the historical bundle nor demo seed counts establishes
production reconciliation or rollback acceptance.

Do not put real secrets, database dumps, KYC documents, production images, or environment files into this bundle.

## Original recommended migration design (historical)

Use `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` in a provider-neutral server adapter. Store only stable keys in MySQL/TiDB:

```text
listings/{listingId}/{uuid}.webp
vendors/{vendorId}/logo/{uuid}.webp
vendors/{vendorId}/cover/{uuid}.webp
verification/{sessionId}/{uuid}.pdf
```

Public listing media should resolve through a stable CDN or application URL. Private KYC evidence must use short-lived signed download URLs after authorization. If the underlying provider changes, copy objects while preserving their keys and change only the adapter/CDN origin.

## Original migration sequence (historical)

1. Implement and test an S3-compatible adapter behind the existing storage contract.
2. Add server-only S3 configuration and production startup validation.
3. Add upload limits, MIME validation, safe UUID keys, object ownership checks, and path-traversal rejection.
4. Migrate existing Manus objects into the new bucket while preserving logical keys.
5. Update database references only where values contain `/manus-storage/` or provider-specific URLs.
6. Update seed data and frontend asset references.
7. Replace or remove the `/manus-storage/*` proxy.
8. Make private evidence fail closed when upload fails.
9. Add an object-existence health check before cutover.
10. Run storage, privacy, REST, KYC, notification, and full SOW acceptance suites.
11. Update Didit and SendPulse webhook destinations to the new `APP_URL`.

## Deployment notes

Docker/VPS can run the API, a persistent notification worker, and optional MySQL in Docker Compose. Vercel/Netlify should use external MySQL, external S3-compatible storage, and a scheduled/external worker rather than an in-process worker. Never use the application filesystem for persistent uploads. Never expose `AWS_SECRET_ACCESS_KEY` or other server credentials through `VITE_*` variables.

See `FILE_MANIFEST.md` for the complete source-file list and `portable-env-template.txt` for the placeholder configuration template.
