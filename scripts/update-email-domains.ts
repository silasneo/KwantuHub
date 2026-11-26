import { createHash } from "node:crypto";
import { mkdir, writeFile, rename, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { normalizeDomain } from "../server/emailPolicy";

const revision = process.argv[2];
if (!/^[a-f0-9]{40}$/.test(revision || "")) {
  throw new Error("Supply a reviewed 40-character upstream Git commit SHA.");
}
const directory = resolve("data", "email");
await mkdir(directory, { recursive: true });
try {
  const source = `https://raw.githubusercontent.com/eramitgupta/disposable-email/${revision}`;
  const download = async (name: string) => {
    const response = await fetch(`${source}/${name}`, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Snapshot download failed: HTTP ${response.status}`);
    const text = await response.text();
    if (Buffer.byteLength(text) > 10_000_000) throw new Error("Unexpectedly large snapshot.");
    return text;
  };
  const [raw, license] = await Promise.all([download("disposable_email.txt"), download("LICENSE")]);
  if (!license.includes("MIT License")) throw new Error("Review upstream license before updating.");
  const rejected: string[] = [];
  const normalized: string[] = [];
  const lines = raw.split(/\r?\n/).filter(line => line.trim() && !line.startsWith("#"));
  for (const line of lines) {
    try { normalized.push(normalizeDomain(line)); }
    catch { rejected.push(line); }
  }
  if (rejected.length > lines.length * 0.001) throw new Error("Over 0.1% malformed domains; review upstream.");
  if (rejected.length) console.warn("[EmailPolicy] Excluded malformed upstream entries:", rejected);
  const domains = [...new Set(normalized)].sort();
  if (domains.length < 1000) throw new Error("Snapshot unexpectedly small; preserving current list.");
  let previousCount = 0;
  try { previousCount = JSON.parse(await readFile(resolve(directory, "snapshot.json"), "utf8")).metadata.count; }
  catch (error) { if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error; }
  if (previousCount && domains.length < previousCount * 0.8) throw new Error("Snapshot shrank over 20%; review upstream.");
  const metadata = { source: "https://github.com/eramitgupta/disposable-email", revision,
    updatedAt: new Date().toISOString(), count: domains.length, rejected,
    sha256: createHash("sha256").update(domains.join("\n") + "\n").digest("hex") };
  await writeFile(resolve(directory, "LICENSE"), license);
  const temporary = resolve(directory, "snapshot.json.tmp");
  await writeFile(temporary, JSON.stringify({ metadata, domains }) + "\n");
  await rename(temporary, resolve(directory, "snapshot.json"));
  console.log(`Validated ${domains.length} domains at ${revision}. Review and deploy this snapshot.`);
} catch (error) {
  console.error("[EmailPolicy] UPDATE FAILED: existing snapshot retained. Administrator action required.", error);
  process.exitCode = 1;
}
