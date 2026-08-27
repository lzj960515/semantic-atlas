import assert from "node:assert/strict";

const releaseTag = process.env.RELEASE_TAG;
const release = JSON.parse(await readStandardInput());

assert.match(releaseTag ?? "", /^v\d+\.\d+\.\d+$/u, "RELEASE_TAG must be a stable v-prefixed version");
assert.equal(release.tag_name, releaseTag, "GitHub Release tag must match RELEASE_TAG");
assert.equal(release.immutable, true, "GitHub Release must be immutable");
assert.equal(release.draft, false, "GitHub Release must be published");
assert.equal(release.prerelease, false, "GitHub Release must not be a prerelease");

process.stdout.write(`Verified immutable GitHub Release ${releaseTag}\n`);

async function readStandardInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}
