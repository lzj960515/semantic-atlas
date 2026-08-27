import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const packageDocument = JSON.parse(await readFile(new URL("../package.json", import.meta.url)));
const releaseTag = process.env.RELEASE_TAG;

assert.match(releaseTag ?? "", /^v\d+\.\d+\.\d+$/u, "Release tag must be a stable v-prefixed version");
assert.equal(releaseTag, `v${packageDocument.version}`, "Release tag must match package version");
assert.equal(
  runGit(["cat-file", "-t", `refs/tags/${releaseTag}`]),
  "tag",
  "Release identity must be an annotated Git tag",
);
assert.equal(
  runGit(["rev-parse", "HEAD"]),
  runGit(["rev-parse", `${releaseTag}^{commit}`]),
  "Checked-out commit must match the release tag",
);

process.stdout.write(`Verified ${releaseTag} at ${runGit(["rev-parse", "HEAD"])}\n`);

function runGit(arguments_) {
  const result = spawnSync("git", arguments_, { encoding: "utf8" });
  assert.equal(
    result.status,
    0,
    `git ${arguments_.join(" ")} failed: ${result.stderr || result.stdout}`,
  );
  return result.stdout.trim();
}
