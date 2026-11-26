import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const requiredColumns = {
  users: ["id", "avatarUrl"],
  listingMedia: ["id", "url"],
  storefronts: ["id", "logoUrl", "coverUrl"],
  vendorVerificationEvidence: ["id", "fileStoragePath"],
};
const optionalColumns = {
  users: [],
  listingMedia: ["storageKey"],
  storefronts: ["logoStorageKey", "coverStorageKey"],
  vendorVerificationEvidence: ["deletedAt"],
};

export function assetSelect(table, present) {
  if (!Object.hasOwn(requiredColumns, table))
    throw new Error("Unsupported asset table");
  for (const name of requiredColumns[table]) {
    if (!present.includes(name))
      throw new Error(`Missing source column ${table}.${name}`);
  }
  const columns = [
    ...requiredColumns[table].map(name => `\`${name}\``),
    ...optionalColumns[table].map(name =>
      present.includes(name) ? `\`${name}\`` : `NULL AS \`${name}\``
    ),
  ];
  return `SELECT ${columns.join(", ")} FROM \`${table}\` ORDER BY \`id\``;
}

export async function exportAssetReferences(connection, metadata, inventory) {
  const tables = {};
  const rowCounts = {};
  const schemaColumns = {};
  await connection.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
  await connection.query(
    "START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY"
  );
  try {
    for (const table of Object.keys(requiredColumns)) {
      const [schema] = await connection.query(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
        [table]
      );
      const present = schema.map(row => row.COLUMN_NAME);
      schemaColumns[table] = present.filter(name =>
        [...requiredColumns[table], ...optionalColumns[table]].includes(name)
      );
      const [count] = await connection.query(
        `SELECT COUNT(*) AS total FROM \`${table}\``
      );
      rowCounts[table] = Number(count[0].total);
      [tables[table]] = await connection.query(assetSelect(table, present));
    }
    await connection.query("COMMIT");
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  }
  return {
    source: {
      kind: "rehearsal",
      label: metadata.label,
      snapshotId: metadata.snapshotId,
      exportedAt: new Date().toISOString(),
      rowCounts,
      schemaColumns,
    },
    tables,
    mappings: [],
    inventory,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  let connection;
  try {
    const [snapshotId, label, inventoryPath] = process.argv.slice(2);
    if (!snapshotId || !label || !inventoryPath || process.argv.length !== 5) {
      throw new Error(
        "Usage: node scripts/export-asset-references.mjs SNAPSHOT_ID LABEL INVENTORY.json"
      );
    }
    const url = new URL(process.env.ASSET_REHEARSAL_DATABASE_URL || "");
    if (
      url.protocol !== "mysql:" ||
      !/^\/[A-Za-z0-9_]+_asset_rehearsal$/.test(url.pathname)
    ) {
      throw new Error(
        "ASSET_REHEARSAL_DATABASE_URL must identify an isolated MySQL database ending in _asset_rehearsal"
      );
    }
    const inventory = JSON.parse(
      (await readFile(inventoryPath, "utf8")).replace(/^\uFEFF/u, "")
    );
    if (inventory.snapshotId !== snapshotId)
      throw new Error(
        "Inventory snapshot ID differs from requested source snapshot"
      );
    const mysql = await import("mysql2/promise");
    connection = await mysql.createConnection(url.href);
    const report = await exportAssetReferences(
      connection,
      { snapshotId, label },
      inventory
    );
    console.log(JSON.stringify(report, null, 2));
  } catch {
    console.error(
      "Reference export failed. Check arguments, isolated database suffix, inventory snapshot and read-only schema access; no connection details are logged."
    );
    process.exitCode = 1;
  } finally {
    if (connection) await connection.end();
  }
}
