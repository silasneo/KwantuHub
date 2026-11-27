import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const columns = {
  users: [{ key: "avatarUrl", visibility: "public" }],
  listingMedia: [
    {
      key: "storageKey",
      fallback: "url",
      visibility: "public",
      required: true,
    },
  ],
  storefronts: [
    { key: "logoStorageKey", fallback: "logoUrl", visibility: "public" },
    { key: "coverStorageKey", fallback: "coverUrl", visibility: "public" },
  ],
  vendorVerificationEvidence: [
    { key: "fileStoragePath", visibility: "private", required: true },
  ],
};

export async function readJsonFile(path) {
  return JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/u, ""));
}

function validKey(key, visibility) {
  return (
    typeof key === "string" &&
    key.startsWith(`${visibility}/`) &&
    key.length <= 512 &&
    !/[\\?#\u0000-\u001f\u007f]/u.test(key) &&
    key.split("/").every(part => part && part !== "." && part !== "..")
  );
}

function objectMetadata(object) {
  return (
    object &&
    ["public", "private"].includes(object.visibility) &&
    validKey(object.key, object.visibility) &&
    Number.isSafeInteger(object.size) &&
    object.size >= 0 &&
    /^[a-f0-9]{64}$/.test(object.sha256) &&
    typeof object.contentType === "string" &&
    /^[\w.+-]+\/[\w.+-]+(?:;[^\r\n\u0000]*)?$/.test(object.contentType) &&
    typeof object.file === "string" &&
    object.file.length > 0
  );
}

async function verifyFile(root, object) {
  if (isAbsolute(object.file) || /^[A-Za-z]:|^[/\\]/.test(object.file))
    throw new Error("unsafe-file-path");
  const actual = await realpath(resolve(root, object.file));
  const rel = relative(await realpath(root), actual);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel))
    throw new Error("unsafe-file-path");
  const info = await stat(actual);
  if (!info.isFile()) throw new Error("not-a-file");
  if (info.size !== object.size) throw new Error("size-mismatch");
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(actual)) hash.update(chunk);
  if (hash.digest("hex") !== object.sha256) throw new Error("sha256-mismatch");
}

async function inspectInventory(inventory, root, label, exceptions) {
  const objects = new Map();
  let verifiedBytes = 0;
  let verifiedObjects = 0;
  if (inventory?.complete !== true || !Array.isArray(inventory?.objects)) {
    exceptions.push({ scope: label, reason: "incomplete-inventory" });
    return { objects, verifiedBytes, verifiedObjects };
  }
  for (const object of inventory.objects) {
    if (!objectMetadata(object)) {
      exceptions.push({
        scope: label,
        key: object?.key ?? null,
        reason: "invalid-object-metadata",
      });
      continue;
    }
    if (objects.has(object.key)) {
      exceptions.push({
        scope: label,
        key: object.key,
        reason: "duplicate-key",
      });
      continue;
    }
    objects.set(object.key, object);
    try {
      await verifyFile(root, object);
      verifiedBytes += object.size;
      verifiedObjects++;
    } catch (error) {
      exceptions.push({
        scope: label,
        key: object.key,
        reason:
          error.code === "ENOENT"
            ? "missing-file"
            : [
                  "unsafe-file-path",
                  "not-a-file",
                  "size-mismatch",
                  "sha256-mismatch",
                ].includes(error.message)
              ? error.message
              : "unreadable-file",
      });
    }
  }
  const expected = inventory.totals;
  const publicObjects = [...objects.values()].filter(
    object => object.visibility === "public"
  ).length;
  const privateObjects = objects.size - publicObjects;
  const bytes = [...objects.values()].reduce(
    (sum, object) => sum + object.size,
    0
  );
  if (
    !expected ||
    ![expected.publicObjects, expected.privateObjects, expected.bytes].every(
      value => Number.isSafeInteger(value) && value >= 0
    ) ||
    expected.publicObjects !== publicObjects ||
    expected.privateObjects !== privateObjects ||
    expected.bytes !== bytes
  ) {
    exceptions.push({ scope: label, reason: "inventory-total-mismatch" });
  }
  return { objects, verifiedBytes, verifiedObjects };
}

export async function reconcileAssets(input, root, target, targetRoot = root) {
  const exceptions = [];
  const source = input?.source;
  if (
    !source ||
    !["production", "rehearsal"].includes(source.kind) ||
    !source.label ||
    !source.snapshotId ||
    !Number.isFinite(Date.parse(source.exportedAt))
  ) {
    throw new Error(
      "source requires kind, label, snapshotId and an ISO exportedAt timestamp"
    );
  }
  if (
    input.inventory?.snapshotId !== source.snapshotId ||
    (target && target.snapshotId !== source.snapshotId)
  ) {
    exceptions.push({ scope: "snapshot", reason: "snapshot-id-mismatch" });
  }
  const mappings = new Map();
  for (const mapping of input.mappings ?? []) {
    if (
      typeof mapping?.value !== "string" ||
      !["public", "private"].some(v => validKey(mapping.key, v)) ||
      mappings.has(mapping.value)
    ) {
      exceptions.push({
        scope: "mapping",
        reason: "invalid-or-duplicate-mapping",
      });
    } else {
      mappings.set(mapping.value, mapping.key);
    }
  }
  const inventory = await inspectInventory(
    input.inventory,
    root,
    "source",
    exceptions
  );
  const references = new Map();
  const tableCounts = {};
  let referenceCount = 0;
  let deletedEvidenceRows = 0;
  for (const [table, fields] of Object.entries(columns)) {
    const rows = input.tables?.[table];
    const expected = source.rowCounts?.[table];
    tableCounts[table] = {
      expected: expected ?? null,
      actual: Array.isArray(rows) ? rows.length : null,
      references: 0,
    };
    if (
      !Array.isArray(rows) ||
      !Number.isSafeInteger(expected) ||
      expected < 0 ||
      expected !== rows.length
    ) {
      exceptions.push({ table, reason: "row-count-mismatch-or-missing-table" });
      if (!Array.isArray(rows)) continue;
    }
    const ids = new Set();
    for (const row of rows) {
      if (
        !row ||
        !Number.isSafeInteger(row.id) ||
        row.id <= 0 ||
        ids.has(row.id)
      ) {
        exceptions.push({
          table,
          rowId: row?.id ?? null,
          reason: "invalid-or-duplicate-row",
        });
        continue;
      }
      ids.add(row.id);
      // Retained tombstones do not require the already-deleted evidence object.
      if (table === "vendorVerificationEvidence") {
        if (!Object.hasOwn(row, "deletedAt")) {
          exceptions.push({
            table,
            rowId: row.id,
            reason: "missing-deletion-state",
          });
        } else if (row.deletedAt !== null) {
          if (!Number.isFinite(Date.parse(row.deletedAt))) {
            exceptions.push({
              table,
              rowId: row.id,
              reason: "invalid-deletion-state",
            });
          } else {
            deletedEvidenceRows++;
            continue;
          }
        }
      }
      for (const field of fields) {
        if (
          !Object.hasOwn(row, field.key) ||
          (field.fallback && !Object.hasOwn(row, field.fallback))
        ) {
          exceptions.push({
            table,
            rowId: row.id,
            field: field.key,
            reason: "missing-export-column",
          });
          continue;
        }
        const value = row[field.key] || (field.fallback && row[field.fallback]);
        if (value == null || value === "") {
          if (field.required)
            exceptions.push({
              table,
              rowId: row.id,
              field: field.key,
              reason: "empty-required-reference",
            });
          continue;
        }
        referenceCount++;
        tableCounts[table].references++;
        const key = mappings.get(value) ?? value;
        if (!validKey(key, field.visibility)) {
          exceptions.push({
            table,
            rowId: row.id,
            field: field.key,
            reason: "unmapped-reference-or-wrong-visibility",
          });
          continue;
        }
        references.set(key, (references.get(key) ?? 0) + 1);
        const object = inventory.objects.get(key);
        if (!object) {
          exceptions.push({
            table,
            rowId: row.id,
            field: field.key,
            key,
            reason: "missing-source-object",
          });
        } else if (object.visibility !== field.visibility) {
          exceptions.push({
            table,
            rowId: row.id,
            field: field.key,
            key,
            reason: "visibility-mismatch",
          });
        }
        if (field.fallback && row[field.key] && row[field.fallback]) {
          const fallback =
            mappings.get(row[field.fallback]) ?? row[field.fallback];
          if (fallback !== key) {
            exceptions.push({
              table,
              rowId: row.id,
              field: field.fallback,
              reason: "unmapped-or-conflicting-legacy-reference",
            });
          }
        }
      }
    }
  }
  let destination;
  if (target) {
    destination = await inspectInventory(
      target,
      targetRoot,
      "target",
      exceptions
    );
    for (const [key, object] of inventory.objects) {
      const copy = destination.objects.get(key);
      if (!copy) {
        exceptions.push({
          scope: "target",
          key,
          reason: "missing-target-object",
        });
      } else if (
        ["size", "sha256", "visibility", "contentType"].some(
          field => object[field] !== copy[field]
        )
      ) {
        exceptions.push({
          scope: "target",
          key,
          reason: "target-metadata-mismatch",
        });
      }
    }
    for (const key of destination.objects.keys()) {
      if (!inventory.objects.has(key))
        exceptions.push({
          scope: "target",
          key,
          reason: "unexpected-target-object",
        });
    }
  }
  const count = visibility =>
    [...inventory.objects.values()].filter(o => o.visibility === visibility)
      .length;
  return {
    version: 1,
    source,
    status: exceptions.length ? "blocked" : "reconciled-offline",
    productionAcceptance: false,
    tableCounts,
    referenceCount,
    uniqueReferencedObjects: references.size,
    deletedEvidenceRows,
    sourceObjects: inventory.objects.size,
    sourcePublicObjects: count("public"),
    sourcePrivateObjects: count("private"),
    verifiedSourceObjects: inventory.verifiedObjects,
    verifiedSourceBytes: inventory.verifiedBytes,
    unreferencedSourceKeys: [...inventory.objects.keys()]
      .filter(key => !references.has(key))
      .sort(),
    target: destination
      ? {
          objects: destination.objects.size,
          verifiedObjects: destination.verifiedObjects,
          verifiedBytes: destination.verifiedBytes,
        }
      : null,
    objects: [...inventory.objects.values()]
      .map(({ file, ...metadata }) => ({
        ...metadata,
        references: references.get(metadata.key) ?? 0,
      }))
      .sort((a, b) => a.key.localeCompare(b.key)),
    exceptions,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const [sourcePath, ...args] = process.argv.slice(2);
    if (
      !sourcePath ||
      args.length % 2 ||
      args.some(
        (arg, i) =>
          i % 2 === 0 && !["--root", "--target", "--target-root"].includes(arg)
      )
    ) {
      throw new Error(
        "Usage: node scripts/reconcile-assets.mjs SOURCE.json [--root FILES] [--target TARGET.json --target-root FILES]"
      );
    }
    const options = Object.fromEntries(
      Array.from({ length: args.length / 2 }, (_, i) => [
        args[i * 2],
        args[i * 2 + 1],
      ])
    );
    const input = await readJsonFile(sourcePath);
    const target = options["--target"]
      ? await readJsonFile(options["--target"])
      : undefined;
    const result = await reconcileAssets(
      input,
      resolve(options["--root"] || "."),
      target,
      resolve(options["--target-root"] || options["--root"] || ".")
    );
    console.log(JSON.stringify(result, null, 2));
    if (result.exceptions.length) process.exitCode = 1;
  } catch (error) {
    console.error(`Asset reconciliation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
