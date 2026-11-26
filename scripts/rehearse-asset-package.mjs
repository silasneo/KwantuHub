import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, mkdir, readdir, rmdir, unlink } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

const candidatePaths = [
  "docs/s3-migration-bundle",
  "docs/s3-assets-export/.gitattributes",
  "docs/s3-assets-export/README.md",
  "docs/s3-assets-export/Kwantu-identity_fc192da7.svg",
  "docs/ASSET_RECONCILIATION.md",
  "scripts/verify-bundled-assets.mjs",
  "scripts/lib/bundled-assets.mjs",
  "scripts/reconcile-assets.mjs",
  "scripts/export-asset-references.mjs",
  "scripts/rehearse-asset-package.mjs",
  "scripts/import-assets.ts",
  "scripts/tests/reconcile-assets.test.mjs",
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.error) throw result.error;
  return result;
}

function git(args, options) {
  const result = run("git", ["--no-pager", ...args], options);
  if (result.status !== 0)
    throw new Error(`git ${args[0]} failed: ${result.stderr}`);
  return result.stdout.trim();
}

// Only remove entries inside this invocation's new UUID directory, never a broad
// checkout/worktree path or pre-existing directory.
async function removeCreatedDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await removeCreatedDirectory(path);
    else await unlink(path);
  }
  await rmdir(directory);
}

let root;
try {
  const repository = resolve(git(["rev-parse", "--show-toplevel"]));
  if (repository !== resolve("."))
    throw new Error("Run this script from the repository root");
  const realIndex = resolve(git(["rev-parse", "--git-path", "index"]));
  const digest = async path =>
    createHash("sha256")
      .update(await readFile(path))
      .digest("hex");
  const before = await digest(realIndex);
  const created = join(repository, `.asset-package-rehearsal-${randomUUID()}`);
  await mkdir(created);
  root = created;
  const checkout = join(root, "checkout");
  await mkdir(checkout);
  const env = { ...process.env, GIT_INDEX_FILE: join(root, "candidate.index") };
  git(["read-tree", "HEAD"], { env });
  git(["add", "--", ...candidatePaths], { env });
  const rasters = git(["diff", "--cached", "--name-only", "--diff-filter=A"], {
    env,
  })
    .split("\n")
    .filter(path => /\.(?:png|jpe?g)$/i.test(path));
  if (rasters.length)
    throw new Error("Raster file unexpectedly added to candidate");
  git(["checkout-index", "--all", `--prefix=${checkout}${sep}`], { env });
  const verification = run(
    process.execPath,
    [join("scripts", "verify-bundled-assets.mjs")],
    { cwd: checkout }
  );
  if (![0, 1].includes(verification.status))
    throw new Error("Candidate asset verifier did not complete");
  const report = JSON.parse(verification.stdout);
  const tests = run(
    process.execPath,
    [
      "--test",
      "--test-reporter=dot",
      join("scripts", "tests", "reconcile-assets.test.mjs"),
    ],
    { cwd: checkout }
  );
  const indexUnchanged = before === (await digest(realIndex));
  console.log(
    JSON.stringify(
      {
        scope: "HEAD-plus-reviewed-candidate-paths-not-a-committed-release",
        expectedObjects: report.expectedObjects,
        verifiedObjects: report.verifiedObjects,
        verifiedBytes: report.verifiedBytes,
        exceptions: report.exceptions,
        offlineTestsPassed: tests.status === 0,
        realIndexUnchanged: indexUnchanged,
        rastersAddedToCandidateIndex: rasters,
        productionAcceptance: false,
      },
      null,
      2
    )
  );
  if (tests.status !== 0) console.error(tests.stdout, tests.stderr);
  if (!indexUnchanged)
    throw new Error(
      "Real index changed concurrently; inspect without resetting it"
    );
  if (report.exceptions.length || tests.status !== 0) process.exitCode = 1;
} catch (error) {
  console.error(`Package rehearsal failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (root) await removeCreatedDirectory(root);
}
