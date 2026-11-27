# Asset reconciliation and isolated rehearsal (workstream 5)

## Acceptance boundary

No current authorized production SQL/schema export and matching complete object
export has been supplied. Do not substitute the local seed, this workstation's
database, or `docs/s3-migration-bundle/source/` for that evidence. The bundle is
historical; the visual archive contains seven valid public images (32,787,134
bytes), one excluded HTML response (9,379 bytes), and no exported private evidence.
This says nothing about newer production uploads or private evidence.

The read-only tooling below records exact observed row/reference/object counts,
SHA-256, byte sizes, metadata and blocking exceptions. It never writes to a
database/object store, follows external URLs, deletes objects, seeds data or
grants production acceptance. Reports always contain `productionAcceptance:false`.
Even a `reconciled-offline` report requires the separate authorization, target
access tests and rollback acceptance below.

## Prepare authorized, matching inputs

1. With approved maintenance/write isolation, obtain an encrypted complete
   database backup, schema/migration journal and complete authenticated object
   export covering **public and private** objects, including every page/version
   needed for the chosen snapshot. Record owner, capture time, snapshot ID and
   backup checksums outside Git. Never commit dumps, object bytes, credentials
   or private reports. The script cannot independently certify operator-supplied
   `complete:true` or that a capture was genuinely from production.
2. Restore the database into an isolated MySQL database whose name ends in
   `_asset_rehearsal`, with provider sends disabled. Use a read-only account for
   the reference exporter. Keep the object export encrypted/access-controlled.
   Record the source's actual `SHOW CREATE TABLE` and migration journal before
   running forward migrations; do not rewrite the original backup.
3. Produce an inventory JSON with byte-derived SHA-256 and actual source
   `Content-Type`. **ETags, especially multipart ETags, are not SHA-256.**
   Set its `snapshotId` to match the database backup. Totals must cover the full
   object inventory, not only referenced assets. Use relative `file` paths under
   a chosen object-export root. Visibility must match the intended stable key.
   Where old source keys lack prefixes, document the explicit old-value-to-new-key
   mapping; keep original source keys and file provenance in the secure backup.
4. Source and target inventory shape (example metadata only, not a real object):

   ```json
   {
     "snapshotId": "owner-approved-capture-id",
     "complete": true,
     "totals": { "publicObjects": 1, "privateObjects": 0, "bytes": 123 },
     "objects": [
       {
         "key": "public/example.webp",
         "visibility": "public",
         "file": "objects/example.webp",
         "size": 123,
         "sha256": "REPLACE_WITH_ACTUAL_64_LOWERCASE_HEX_DIGEST",
         "contentType": "image/webp"
       }
     ]
   }
   ```

   Include active private evidence objects as `private/...`, not `public/...`.
   Include nonreferenced objects too; the report lists them for owner review,
   never automatically deletes them. Counts/metadata must come from a completed
   source listing; checksums must come from authenticated downloaded bytes.

## Export references from the restored copy

The exporter reads only IDs, media columns and evidence deletion state from
`users`, `listingMedia`, `storefronts`, `vendorVerificationEvidence`, plus exact
`COUNT(*)` values in one repeatable-read, read-only consistent transaction.
All rows are counted, including null media and evidence tombstones. It omits
account details, passwords, contact details and evidence summaries.

```powershell
$env:ASSET_REHEARSAL_DATABASE_URL = 'mysql://READONLY_USER:ENCODED_PASSWORD@127.0.0.1:3307/approved_asset_rehearsal'
node scripts\export-asset-references.mjs owner-approved-capture-id "authorized restored source copy" .\private-rehearsal\inventory.json |
  Set-Content -Encoding utf8 .\private-rehearsal\references.json
Remove-Item Env:\ASSET_REHEARSAL_DATABASE_URL
```

Create/protect `private-rehearsal` yourself and exclude it locally before saving
private artifacts. Check exit status and JSON completeness before using an output;
a failed command can leave an empty redirected file. The exporter does not load
`.env` or use `DATABASE_URL`; the dedicated variable and database-name guard reduce
accidental live reads, but do not replace operator verification of the host.

Absent pre-0019 storage-key columns are exported as null; absent legacy
`deletedAt` is conservatively null (all evidence active). Missing required tables
or asset-bearing URL/path columns fail rather than silently reducing scope.
`source.schemaColumns` records which columns actually existed.

Review the exported JSON and add explicit mappings for legacy URLs, signed URLs,
`/manus-storage/...`, `/media/...` and external avatars, for example:

```json
"mappings": [
  { "value": "/manus-storage/example.webp", "key": "public/example.webp" },
  { "value": "legacy/private/evidence.pdf", "key": "private/evidence/evidence.pdf" }
]
```

No host, prefix, filename decoding or query stripping is guessed. For rows with
both stable key and legacy URL, both must resolve to the same object. An external
avatar with no authorized byte export remains a blocking exception until the
owner defines and implements its treatment; do not silently drop the reference.
Deleted evidence tombstones are counted separately and need no object, but their
deletion timestamp must be present/valid.

The full references document is:

```text
source: {kind:"rehearsal", label, snapshotId, exportedAt, rowCounts:{each table: exact count}}
tables.users: [{id, avatarUrl}]
tables.listingMedia: [{id, storageKey, url}]
tables.storefronts: [{id, logoStorageKey, logoUrl, coverStorageKey, coverUrl}]
tables.vendorVerificationEvidence: [{id, fileStoragePath, deletedAt}]
mappings: [{value, key}]
inventory: the complete source inventory document shown above
```

Manually prepared authorized exports may use `kind:"production"` only when their
provenance genuinely warrants it. The guarded restored-copy exporter always uses
`kind:"rehearsal"`; it does not claim direct production capture.

## Reconcile source, then read back an isolated target

```powershell
node scripts\reconcile-assets.mjs .\private-rehearsal\references.json --root .\private-rehearsal\source-objects
# After an explicitly approved copy into an EMPTY, isolated target bucket,
# download/list that target independently; do not reuse source hashes as proof:
node scripts\reconcile-assets.mjs .\private-rehearsal\references.json --root .\private-rehearsal\source-objects --target .\private-rehearsal\target-inventory.json --target-root .\private-rehearsal\target-objects
node --test scripts\tests\reconcile-assets.test.mjs
```

The reconciler streams every inventory file, rejects missing files, traversal or
symlink escapes, invalid/duplicate keys/rows, incomplete table coverage, row/count
differences, wrong visibility, unknown/conflicting URLs and hash/size differences.
Target parity covers **all inventoried objects**, not just sampled references:
missing/extra objects or differing size/hash/visibility/content type block success.
Source public/private counts, unique references, per-table references, total
references, tombstones, verified bytes, unused source keys and every exception
are included in the JSON report. Exit status is nonzero for any blocking exception.
Inventory metadata is preserved/compared, not inferred from file extensions.

## Clean packaging and importer preflight

```powershell
node scripts\verify-bundled-assets.mjs
.\node_modules\.bin\tsx.cmd scripts\import-assets.ts --dry-run
node scripts\rehearse-asset-package.mjs
```

These validate all seven pinned historical sources before any upload. A clean
checkout containing only authorized Git material currently lacks the six raster
files. The missing files total **32,752,796 bytes**; the portable SVG is 34,338
bytes. Therefore a default clean-checkout bootstrap with those images is
**blocked**, even though local preflight succeeds.

Provide a separately authorized checksummed artifact and a reviewed read-only
`ASSET_DIR` mount, or obtain separate authorization to commit the raster bytes.
Do not stage PNG/JPEG/JPG files under the existing README/SVG-only authorization.
Include the asset folder's scoped `.gitattributes` (`*.svg -text`) in the reviewed
candidate: Windows `core.autocrlf` otherwise changes the SVG bytes/hash at checkout.
No commits are required to test this: export a candidate index into a uniquely
named directory inside this repository with `GIT_INDEX_FILE` and `checkout-index`.
`rehearse-asset-package.mjs` automates that candidate export, runs the offline
tests inside it, reports missing source bytes and verifies the real index hash
was unchanged. It exits nonzero when packaging remains blocked, adds no raster
files, and cleans only its newly created UUID directory, entry by entry.
Use `git read-tree HEAD`, add only the reviewed candidate paths to that alternate
index, then `git checkout-index --all --prefix=<absolute-new-directory>/`.
Do not alter the real index, overwrite existing paths or recursively remove broad
paths. Run the verifier from inside the export, recording missing-file exceptions
as packaging blockers rather than calling an incomplete snapshot a clean clone.

## Remaining owner-controlled cutover and rollback gates

- Receive the actual current source schema/data/object export and resolve **all**
  report exceptions. Re-export after any approved source write; do not claim old
  counts prove current parity.
- Rehearse forward migrations on the isolated restored copy, including verifying
  the actual historical 0014 FK name against `SHOW CREATE TABLE`/migration journal.
  Compare before/after row counts, all stable keys and private evidence ownership.
  A locally edited historical migration is not proof that a deployed schema
  matches it. Do not mark an unverified migration applied.
- Test public rendering and private downloads as verified admin, non-admin and
  anonymous clients; confirm private evidence cannot be obtained via `/media`.
  Offline inventories cannot prove ACLs or application authorization.
- Record old deployment digest, schema/data backup, bucket/config credentials
  custody and pointer-switch plan. Rehearse rollback by restoring the original
  schema/data and matching objects into **another isolated** instance; do not
  attempt an automatic destructive down migration or delete newer uploads.
  Compare exact original counts/checksums, sign-in, public/private access and
  measured recovery time. Leave live source data untouched.
- Obtain owner acceptance of that evidence before any production traffic switch.
  Local synthetic tests, a successful source import or a seeded Garage database
  do not satisfy these external gates.

## Local verification recorded 2026-10-25

- `node --test scripts\tests\reconcile-assets.test.mjs`: **34 passed**,
  covering synthetic public/private parity, exact counts, tombstones, URL
  exceptions, source/target byte/metadata failures, safe paths, read-only export
  queries, CLI exit statuses and PowerShell UTF-8 BOM input.
- Existing `server/storage.test.ts` and `server/privateEvidence.test.ts`:
  **12 passed**. These are mocked regressions, not live bucket acceptance.
- Source preflight: **7 verified / 32,787,134 bytes / 0 exceptions**.
  Both the TS importer and its esbuild-bundled entry passed `--dry-run`;
  no upload was performed.
- Alternate-index candidate export: **34 offline tests passed**; only the
  **34,338-byte SVG** was available. Exactly **6 missing-file exceptions**
  represented the uncommitted raster images (**32,752,796 bytes**).
  The real index hash was unchanged, no raster entered the alternate index,
  and the uniquely created export was removed entry by entry.
- The first Windows export exposed SVG CRLF conversion invalidating its
  checksum. The scoped `*.svg -text` attribute fixed it; the repeated candidate
  export verified the original SVG bytes.
- No current production SQL export was available, no reference exporter was
  run against a database, and no production migration/rollback, reseed, bucket
  write, commit or push was performed. The remaining gates above are still open.
