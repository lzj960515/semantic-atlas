import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const packageDirectory = await mkdtemp(path.join(os.tmpdir(), "semantic-atlas-pack-"));

try {
  run("pnpm", ["pack", "--pack-destination", packageDirectory]);
  const archiveName = (await readdir(packageDirectory)).find((name) => name.endsWith(".tgz"));
  assert.ok(archiveName, "pnpm pack did not create an archive");

  const archivePath = path.join(packageDirectory, archiveName);
  const entries = run("tar", ["-tzf", archivePath]).stdout.trim().split("\n");
  const skillPath = "package/.agents/skills/semantic-atlas/SKILL.md";
  const metadataPath = "package/.agents/skills/semantic-atlas/agents/openai.yaml";
  const queryAdapterPath = "package/.agents/skills/semantic-atlas/scripts/query-context.mjs";

  assert.ok(entries.includes(skillPath), "packed archive is missing the repository Skill");
  assert.ok(entries.includes(metadataPath), "packed archive is missing Skill metadata");
  assert.ok(entries.includes(queryAdapterPath), "packed archive is missing the query adapter");

  const skillDocument = run("tar", ["-xOzf", archivePath, skillPath]).stdout;
  assert.match(skillDocument, /^---\nname: semantic-atlas\n/);

  const packageDocument = JSON.parse(await readFile("package.json", "utf8"));
  assert.equal(packageDocument.name, "semantic-atlas-next");
} finally {
  await rm(packageDirectory, { recursive: true, force: true });
}

function run(command, arguments_) {
  const result = spawnSync(command, arguments_, {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(
    result.status,
    0,
    `${command} ${arguments_.join(" ")} failed:\n${result.stderr || result.stdout}`,
  );
  return result;
}
