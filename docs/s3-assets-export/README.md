# Historical public visual export — not a current production inventory

This archive contains eight historical export files, not evidence of the current
production database or object store. The old export reported 10 `listingMedia`
rows, four `storefronts` rows and zero `vendorVerificationEvidence` rows. Those
counts are historical only; local seed data cannot establish current production
counts or absence of private evidence. No current authorized production database
and matching object export has been supplied for reconciliation.

## Exact local evidence

- Seven valid assets: six PNG images retaining their original `.jpg` filenames,
  plus one SVG. Valid assets total **32,787,134 bytes**.
- `kwantu-christmas-market_9ea74b26_1a8e6c12.jpg` is a **9,379-byte HTML error
  response**, SHA-256
  `b620507312c5e97566a3c6cfaf99144fefc18a0da7d941401dfa0f5f58fb0368`.
  It is excluded from import, not silently counted as a migrated image. If a
  current source row still references it, recover its actual image or explicitly
  resolve the row with the owner; do not infer approval to delete production data.
- `ASSETS_MANIFEST.csv` is an export-time description. Authoritative local
  size/SHA-256 pins for the seven valid files are in
  `scripts/lib/bundled-assets.mjs`; `public/<filename>` is the destination key.
- The six large raster files are **not authorized for Git staging**. Their
  presence on this workstation does not make them available in a clean checkout.
  Only this README and the SVG have been authorized for staging in this folder.
  Supply the raster bytes through an approved checksummed artifact/export outside
  Git, or obtain separate explicit permission to include them. Do not fetch
  arbitrary URLs automatically to fill missing files.
- The local `.gitattributes` marks SVG bytes `-text` so Windows Git line-ending
  conversion cannot invalidate the pinned source checksum. Include this small
  packaging metadata file with the README/SVG in any reviewed candidate; it does
  not authorize staging raster images.

## Read-only preflight and explicit import

```powershell
node scripts\verify-bundled-assets.mjs
.\node_modules\.bin\tsx.cmd scripts\import-assets.ts --dry-run
```

Both commands fail when any required source is absent or its bytes differ from
the pinned size/hash. Import preflights **all seven sources before the first
upload**, so a missing sixth raster cannot leave a partially imported bundle.
These pins intentionally reject replacement artwork: review any change to the
historical archive and its pins rather than silently blessing new checksums.

After providing the approved sources, the explicit maintenance importer is:

```powershell
docker compose --profile maintenance run --rm import-assets
```

Normal app/worker startup does not import or seed anything. This importer writes
only the seven fixed historical public keys, reads each object back, and checks
SHA-256, size and content type (`image/png` for the six misnamed rasters).
It overwrites those fixed keys; review the target bucket before running it.
It is **not** an importer for arbitrary production/user/KYC assets.

Use `ASSET_DIR` to point the script at an approved external artifact directory.
The Docker maintenance image currently packages its asset directory at build
time; provide an explicit reviewed read-only mount and matching `ASSET_DIR` when
the raster bytes are supplied separately. Do not assume the default Docker build
can supply files deliberately omitted from Git.

Public media URLs resolve using `PUBLIC_MEDIA_BASE_URL` (normally `/media`) plus
the stable `public/` key. Private evidence must remain under `private/` and behind
authorized access; none of the historical images here are private evidence.

See [Asset reconciliation and rehearsal](../ASSET_RECONCILIATION.md) for exact
source/target inventories, counts, checksums, exception handling and remaining
external cutover/rollback acceptance. The adjacent migration bundle's `source/`
files are historical reference copies, not the active application.
