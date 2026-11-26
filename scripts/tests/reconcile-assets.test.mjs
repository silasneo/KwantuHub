import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { after, before, test } from "node:test";
import { readJsonFile, reconcileAssets } from "../reconcile-assets.mjs";
import {
  bundledAssets,
  inspectBundledAssets,
  verifyBundledBody,
} from "../lib/bundled-assets.mjs";
import {
  assetSelect,
  exportAssetReferences,
} from "../export-asset-references.mjs";

// Keep fixtures under the repository; remove only files created by this suite.
const root = resolve(`.asset-reconciliation-test-${process.pid}`);
const publicBody = Buffer.from("synthetic public asset");
const privateBody = Buffer.from(
  "synthetic private evidence, not a real document"
);
const digest = body => createHash("sha256").update(body).digest("hex");
before(async () => {
  await mkdir(root);
  await writeFile(resolve(root, "public.bin"), publicBody);
  await writeFile(resolve(root, "private.bin"), privateBody);
});
after(async () => {
  await rm(resolve(root, "public.bin"));
  await rm(resolve(root, "private.bin"));
  await rm(resolve(root, "bom.json"));
  await rm(resolve(root, "source.json"));
  await rm(resolve(root, "inventory.json"));
  await rmdir(root);
});

function fixture() {
  return {
    source: {
      kind: "rehearsal",
      label: "synthetic node-test fixture",
      snapshotId: "test-only",
      exportedAt: "2026-10-25T22:00:00Z",
      rowCounts: {
        users: 1,
        listingMedia: 2,
        storefronts: 1,
        vendorVerificationEvidence: 2,
      },
    },
    tables: {
      users: [{ id: 1, avatarUrl: null }],
      listingMedia: [
        {
          id: 1,
          storageKey: "public/shared.bin",
          url: "/manus-storage/shared.bin",
        },
        { id: 2, storageKey: "public/shared.bin", url: null },
      ],
      storefronts: [
        {
          id: 1,
          logoStorageKey: null,
          logoUrl: "/manus-storage/shared.bin",
          coverStorageKey: null,
          coverUrl: null,
        },
      ],
      vendorVerificationEvidence: [
        { id: 1, fileStoragePath: "private/evidence.bin", deletedAt: null },
        {
          id: 2,
          fileStoragePath: "private/deleted.bin",
          deletedAt: "2026-10-24T22:00:00Z",
        },
      ],
    },
    mappings: [
      { value: "/manus-storage/shared.bin", key: "public/shared.bin" },
    ],
    inventory: {
      snapshotId: "test-only",
      complete: true,
      totals: {
        publicObjects: 1,
        privateObjects: 1,
        bytes: publicBody.length + privateBody.length,
      },
      objects: [
        {
          key: "public/shared.bin",
          visibility: "public",
          file: "public.bin",
          size: publicBody.length,
          sha256: digest(publicBody),
          contentType: "image/png",
        },
        {
          key: "private/evidence.bin",
          visibility: "private",
          file: "private.bin",
          size: privateBody.length,
          sha256: digest(privateBody),
          contentType: "application/pdf",
        },
      ],
    },
  };
}

test("exact row/reference/object/byte counts include private evidence, sharing and tombstones", async () => {
  const input = fixture();
  const result = await reconcileAssets(input, root, input.inventory);
  assert.equal(result.status, "reconciled-offline");
  assert.equal(result.productionAcceptance, false);
  assert.equal(result.referenceCount, 4);
  assert.equal(result.uniqueReferencedObjects, 2);
  assert.equal(result.deletedEvidenceRows, 1);
  assert.equal(
    result.verifiedSourceBytes,
    publicBody.length + privateBody.length
  );
  assert.deepEqual(result.target, {
    objects: 2,
    verifiedObjects: 2,
    verifiedBytes: publicBody.length + privateBody.length,
  });
  assert.deepEqual(result.exceptions, []);
  assert.equal(
    result.objects.find(object => object.key === "public/shared.bin")
      .references,
    3
  );
});

const failures = [
  [
    "missing export table",
    input => {
      delete input.tables.users;
    },
    "row-count-mismatch-or-missing-table",
  ],
  [
    "inaccurate row count",
    input => {
      input.source.rowCounts.users = 20;
    },
    "row-count-mismatch-or-missing-table",
  ],
  [
    "duplicate row",
    input => {
      input.tables.users.push(input.tables.users[0]);
    },
    "invalid-or-duplicate-row",
  ],
  [
    "missing column",
    input => {
      delete input.tables.storefronts[0].coverUrl;
    },
    "missing-export-column",
  ],
  [
    "unknown external URL",
    input => {
      input.tables.users[0].avatarUrl = "https://unknown.invalid/avatar";
    },
    "unmapped-reference-or-wrong-visibility",
  ],
  [
    "no private-to-public mapping",
    input => {
      input.tables.vendorVerificationEvidence[0].fileStoragePath =
        "public/shared.bin";
    },
    "unmapped-reference-or-wrong-visibility",
  ],
  [
    "no traversal keys",
    input => {
      input.tables.listingMedia[0].storageKey = "public/../secret";
    },
    "unmapped-reference-or-wrong-visibility",
  ],
  [
    "no guessed URL query stripping",
    input => {
      input.tables.listingMedia[0].storageKey =
        "public/shared.bin?token=secret";
    },
    "unmapped-reference-or-wrong-visibility",
  ],
  [
    "conflicting legacy column",
    input => {
      input.tables.listingMedia[0].url = "/manus-storage/other.bin";
    },
    "unmapped-or-conflicting-legacy-reference",
  ],
  [
    "missing referenced object",
    input => {
      input.inventory.objects.pop();
    },
    "missing-source-object",
  ],
  [
    "missing local file",
    input => {
      input.inventory.objects[0].file = "missing.bin";
    },
    "missing-file",
  ],
  [
    "unsafe local file",
    input => {
      input.inventory.objects[0].file = resolve(root, "public.bin");
    },
    "unsafe-file-path",
  ],
  [
    "relative path escape",
    input => {
      input.inventory.objects[0].file = "../package.json";
    },
    "unsafe-file-path",
  ],
  [
    "checksum mismatch",
    input => {
      input.inventory.objects[0].sha256 = "0".repeat(64);
    },
    "sha256-mismatch",
  ],
  [
    "size mismatch",
    input => {
      input.inventory.objects[0].size++;
    },
    "size-mismatch",
  ],
  [
    "duplicate inventory",
    input => {
      input.inventory.objects.push(input.inventory.objects[0]);
    },
    "duplicate-key",
  ],
  [
    "wrong namespace metadata",
    input => {
      input.inventory.objects[0].visibility = "private";
    },
    "invalid-object-metadata",
  ],
  [
    "no ETag as checksum",
    input => {
      input.inventory.objects[0].sha256 = "multipart-etag-2";
    },
    "invalid-object-metadata",
  ],
  [
    "incomplete paginated inventory",
    input => {
      input.inventory.complete = false;
    },
    "incomplete-inventory",
  ],
  [
    "inexact inventory totals",
    input => {
      input.inventory.totals.publicObjects++;
    },
    "inventory-total-mismatch",
  ],
  [
    "different snapshot",
    input => {
      input.inventory.snapshotId = "other";
    },
    "snapshot-id-mismatch",
  ],
  [
    "missing tombstone state",
    input => {
      delete input.tables.vendorVerificationEvidence[0].deletedAt;
    },
    "missing-deletion-state",
  ],
  [
    "invalid tombstone date",
    input => {
      input.tables.vendorVerificationEvidence[0].deletedAt = "nonsense";
    },
    "invalid-deletion-state",
  ],
  [
    "duplicate mapping",
    input => {
      input.mappings.push(input.mappings[0]);
    },
    "invalid-or-duplicate-mapping",
  ],
];
for (const [name, mutate, reason] of failures) {
  test(name, async () => {
    const input = fixture();
    mutate(input);
    const result = await reconcileAssets(input, root);
    assert.equal(result.status, "blocked");
    assert.ok(
      result.exceptions.some(exception => exception.reason === reason),
      JSON.stringify(result.exceptions)
    );
  });
}

test("target is fully read back, including metadata, missing objects and unexpected objects", async () => {
  const input = fixture();
  const target = structuredClone(input.inventory);
  target.objects[0].contentType = "application/octet-stream";
  target.objects[1].sha256 = "0".repeat(64);
  target.objects.push({ ...target.objects[0], key: "public/unexpected.bin" });
  const report = await reconcileAssets(input, root, target);
  for (const reason of [
    "target-metadata-mismatch",
    "sha256-mismatch",
    "unexpected-target-object",
  ]) {
    assert.ok(report.exceptions.some(exception => exception.reason === reason));
  }
  target.objects = [];
  assert.ok(
    (await reconcileAssets(input, root, target)).exceptions.some(
      e => e.reason === "missing-target-object"
    )
  );
});

test("no source provenance is accepted implicitly and offline success never grants cutover acceptance", async () => {
  await assert.rejects(reconcileAssets({}, root), /source requires/);
  const input = fixture();
  input.source.kind = "production";
  assert.equal(
    (await reconcileAssets(input, root)).productionAcceptance,
    false
  );
});

test("historical bundle pins seven valid assets, excluding the HTML error response", async () => {
  assert.equal(bundledAssets.length, 7);
  assert.equal(
    bundledAssets.reduce((sum, asset) => sum + asset.size, 0),
    32787134
  );
  assert.equal(
    bundledAssets.filter(asset => asset.contentType === "image/png").length,
    6
  );
  assert.ok(!bundledAssets.some(asset => asset.name.includes("christmas")));
  const asset = bundledAssets[0];
  assert.throws(
    () => verifyBundledBody(asset, Buffer.from("<svg>tampered</svg>")),
    /mismatch/
  );
  const result = await inspectBundledAssets(root);
  assert.equal(result.assets.length, 0);
  assert.equal(result.exceptions.length, 7);
  assert.ok(
    result.exceptions.every(exception => exception.reason === "missing-file")
  );
});

test("SVG source checksum matches the pinned portable asset", async () => {
  const asset = bundledAssets[0];
  const body = await readFile(resolve("docs", "s3-assets-export", asset.name));
  assert.equal(verifyBundledBody(asset, body), body);
});

test("Windows PowerShell UTF-8 JSON with BOM is accepted", async () => {
  const path = resolve(root, "bom.json");
  await writeFile(path, '\uFEFF{"snapshotId":"fixture"}');
  assert.deepEqual(await readJsonFile(path), { snapshotId: "fixture" });
});

test("CLI reports exact synthetic source/target parity and exits nonzero for exceptions", async () => {
  const input = fixture();
  const source = resolve(root, "source.json");
  const inventory = resolve(root, "inventory.json");
  await writeFile(source, `\uFEFF${JSON.stringify(input)}`);
  await writeFile(inventory, JSON.stringify(input.inventory));
  const args = [
    resolve("scripts", "reconcile-assets.mjs"),
    source,
    "--root",
    root,
    "--target",
    inventory,
    "--target-root",
    root,
  ];
  const success = spawnSync(process.execPath, args, { encoding: "utf8" });
  assert.equal(success.status, 0, success.stderr);
  assert.equal(JSON.parse(success.stdout).verifiedSourceObjects, 2);
  input.inventory.objects[0].sha256 = "0".repeat(64);
  await writeFile(source, JSON.stringify(input));
  const blocked = spawnSync(process.execPath, args, { encoding: "utf8" });
  assert.equal(blocked.status, 1);
  assert.equal(JSON.parse(blocked.stdout).status, "blocked");
});

test("reference export CLI refuses non-rehearsal database names without leaking connection details", () => {
  const result = spawnSync(
    process.execPath,
    [
      resolve("scripts", "export-asset-references.mjs"),
      "fixture",
      "fixture",
      "not-read.json",
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        ASSET_REHEARSAL_DATABASE_URL:
          "mysql://private_user:private_password@localhost/live",
      },
    }
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Reference export failed/);
  assert.doesNotMatch(
    result.stderr,
    /private_user|private_password|localhost|mysql:\/\//
  );
  assert.equal(result.stdout, "");
});

test("legacy schema selects null only for absent migration columns, never omits asset-bearing columns", () => {
  assert.equal(
    assetSelect("listingMedia", ["id", "url"]),
    "SELECT `id`, `url`, NULL AS `storageKey` FROM `listingMedia` ORDER BY `id`"
  );
  assert.throws(() => assetSelect("users", ["id"]), /Missing source column/);
  assert.throws(
    () => assetSelect("untrusted; DROP TABLE users", []),
    /Unsupported/
  );
});

test("reference exporter uses a read-only consistent snapshot, counts all rows and omits unrelated PII", async () => {
  const queries = [];
  const connection = {
    async query(sql) {
      queries.push(sql);
      if (sql.includes("information_schema"))
        return [
          [
            ...[
              "id",
              "avatarUrl",
              "url",
              "logoUrl",
              "coverUrl",
              "fileStoragePath",
              "deletedAt",
            ].map(COLUMN_NAME => ({ COLUMN_NAME })),
          ],
        ];
      if (sql.includes("COUNT(*)")) return [[{ total: 0 }]];
      return [[]];
    },
  };
  const report = await exportAssetReferences(
    connection,
    { label: "test copy", snapshotId: "fixture" },
    {}
  );
  assert.equal(
    queries[1],
    "START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY"
  );
  assert.equal(queries.at(-1), "COMMIT");
  assert.deepEqual(report.source.rowCounts, {
    users: 0,
    listingMedia: 0,
    storefronts: 0,
    vendorVerificationEvidence: 0,
  });
  assert.ok(
    queries.every(
      sql => !/password|firstName|email|UPDATE|DELETE|INSERT/.test(sql)
    )
  );
  connection.query = async sql => {
    queries.push(sql);
    if (sql.includes("information_schema"))
      throw new Error("schema unavailable");
    return [[]];
  };
  await assert.rejects(
    exportAssetReferences(connection, {}, {}),
    /schema unavailable/
  );
  assert.equal(queries.at(-1), "ROLLBACK");
});
