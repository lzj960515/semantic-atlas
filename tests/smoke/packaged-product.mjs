import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
const sandbox = await mkdtemp(path.join(os.tmpdir(), "semantic-atlas-package-"));
const archiveDirectory = path.join(sandbox, "archive");
const consumerDirectory = path.join(sandbox, "consumer");
const repositoryRoot = path.join(sandbox, "repository");

try {
  await mkdir(archiveDirectory, { recursive: true });
  const archivePath = await packProduct(archiveDirectory);
  assertPublicArchive(archivePath);

  await installPackedProduct(archivePath);
  await exerciseInstalledProduct();
} finally {
  await rm(sandbox, { recursive: true, force: true });
}

async function packProduct(archiveDirectory) {
  run("pnpm", ["pack", "--pack-destination", archiveDirectory], packageRoot);
  const archiveName = (await readdir(archiveDirectory))
    .find((name) => name.endsWith(".tgz"));
  assert.ok(archiveName, "pnpm pack did not create an archive");
  return path.join(archiveDirectory, archiveName);
}

function assertPublicArchive(archivePath) {
  const entries = run("tar", ["-tzf", archivePath], packageRoot)
    .stdout.trim().split("\n");
  const requiredEntries = [
    "package/.agents/skills/semantic-atlas/SKILL.md",
    "package/.agents/skills/semantic-atlas/agents/openai.yaml",
    "package/.agents/skills/semantic-atlas/scripts/query-context.mjs",
    "package/dist/cli/bin.js",
    "package/examples/commerce.yaml",
    "package/package.json",
    "package/README.md",
  ];
  const publicRoots = [
    "package/.agents/",
    "package/dist/",
    "package/docs/",
    "package/examples/",
    "package/package.json",
    "package/README.md",
  ];

  for (const requiredEntry of requiredEntries) {
    assert.ok(entries.includes(requiredEntry), `packed archive is missing ${requiredEntry}`);
  }
  for (const entry of entries) {
    assert.ok(
      publicRoots.some((root) => entry === root || entry.startsWith(root)),
      `packed archive exposes an unintended path: ${entry}`,
    );
  }
}

async function installPackedProduct(archivePath) {
  await mkdir(consumerDirectory, { recursive: true });
  await writeFile(
    path.join(consumerDirectory, "package.json"),
    `${JSON.stringify({ name: "semantic-atlas-consumer", private: true }, null, 2)}\n`,
  );
  run(
    "pnpm",
    ["add", "--offline", "--ignore-scripts", archivePath],
    consumerDirectory,
  );
}

async function exerciseInstalledProduct() {
  const installedPackageRoot = path.join(
    consumerDirectory,
    "node_modules",
    "semantic-atlas-next",
  );
  const mapDirectory = path.join(repositoryRoot, "docs", "business-map");
  const outputPath = path.join(repositoryRoot, "semantic-atlas.html");
  await mkdir(mapDirectory, { recursive: true });
  await copyFile(
    path.join(installedPackageRoot, "examples", "commerce.yaml"),
    path.join(mapDirectory, "commerce.yaml"),
  );

  const resolvedRepositoryRoot = await realpath(repositoryRoot);
  const validate = runInstalledCli(["validate", "--repo", repositoryRoot]);
  assert.equal(validate.stderr, "");
  assert.deepEqual(JSON.parse(validate.stdout), {
    schemaVersion: 1,
    ok: true,
    command: "validate",
    repository: {
      root: resolvedRepositoryRoot,
      mapDirectory: "docs/business-map",
      documents: ["commerce.yaml"],
    },
    data: {
      documentCount: 1,
      nodeCount: 12,
      relationCount: 19,
    },
  });

  const context = runInstalledCli([
    "context",
    "Checkout",
    "--repo",
    repositoryRoot,
  ]);
  assert.equal(context.stderr, "");
  assert.equal(JSON.parse(context.stdout).data.selected.id, "commerce.orders.place-order");

  const render = runInstalledCli([
    "render",
    "--repo",
    repositoryRoot,
    "--output",
    outputPath,
  ]);
  assert.equal(render.stderr, "");
  assert.equal(JSON.parse(render.stdout).data.outputPath, outputPath);
  const projection = await readFile(outputPath, "utf8");
  assert.match(projection, /data-node-id="commerce\.orders\.place-order"/u);
  assert.match(projection, /data-channel="directed-relation"/u);

  const skillAdapter = path.join(
    installedPackageRoot,
    ".agents",
    "skills",
    "semantic-atlas",
    "scripts",
    "query-context.mjs",
  );
  const skillContext = run(
    process.execPath,
    [skillAdapter, "Checkout", "--repo", repositoryRoot],
    consumerDirectory,
  );
  assert.equal(skillContext.stderr, "");
  assert.equal(
    JSON.parse(skillContext.stdout).data.selected.id,
    "commerce.orders.place-order",
  );
}

function runInstalledCli(arguments_) {
  return run("pnpm", ["exec", "semantic-atlas", ...arguments_], consumerDirectory);
}

function run(command, arguments_, cwd) {
  const result = spawnSync(command, arguments_, { cwd, encoding: "utf8" });
  assert.equal(
    result.status,
    0,
    `${command} ${arguments_.join(" ")} failed:\n${result.stderr || result.stdout}`,
  );
  return result;
}
