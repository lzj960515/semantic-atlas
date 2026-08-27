import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  access,
  appendFile,
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
const packageIdentity = JSON.parse(
  await readFile(path.join(packageRoot, "package.json"), "utf8"),
);
const sandbox = await mkdtemp(path.join(os.tmpdir(), "semantic-atlas-package-"));
const archiveDirectory = path.join(sandbox, "archive");
const consumerDirectory = path.join(sandbox, "consumer");
const repositoryRoot = path.join(sandbox, "repository");
const userHome = path.join(sandbox, "home");
const installedPackageRoot = path.join(
  consumerDirectory,
  "node_modules",
  packageIdentity.name,
);
const installedCli = path.join(installedPackageRoot, "dist", "cli", "bin.js");
const managedSkillDirectory = path.join(
  userHome,
  ".agents",
  "skills",
  "semantic-atlas",
);
const cliEnvironment = {
  ...process.env,
  HOME: userHome,
  USERPROFILE: userHome,
  PATH: `${path.join(consumerDirectory, "node_modules", ".bin")}${path.delimiter}${process.env.PATH ?? ""}`,
};

try {
  await mkdir(archiveDirectory, { recursive: true });
  const archivePath = await packProduct(archiveDirectory);
  assertPublicArchive(archivePath);

  await installPackedProduct(archivePath);
  await exerciseInstalledProduct();
  await exerciseManagedSkillLifecycle();
} finally {
  await rm(sandbox, { recursive: true, force: true });
}

async function packProduct(directory) {
  run("pnpm", ["pack", "--pack-destination", directory], packageRoot);
  const archiveName = (await readdir(directory))
    .find((name) => name.endsWith(".tgz"));
  assert.ok(archiveName, "pnpm pack did not create an archive");
  return path.join(directory, archiveName);
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
  const mapDirectory = path.join(repositoryRoot, "docs", "business-map");
  const outputPath = path.join(repositoryRoot, "semantic-atlas.html");
  await mkdir(mapDirectory, { recursive: true });
  await copyFile(
    path.join(installedPackageRoot, "examples", "commerce.yaml"),
    path.join(mapDirectory, "commerce.yaml"),
  );

  const version = runInstalledCli(["--version"]);
  assert.equal(version.stdout.trim(), packageIdentity.version);

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

  const packagedSkillAdapter = path.join(
    installedPackageRoot,
    ".agents",
    "skills",
    "semantic-atlas",
    "scripts",
    "query-context.mjs",
  );
  const packagedSkillContext = run(
    process.execPath,
    [packagedSkillAdapter, "Checkout", "--repo", repositoryRoot],
    consumerDirectory,
    cliEnvironment,
  );
  assert.equal(packagedSkillContext.stderr, "");
  assert.equal(
    JSON.parse(packagedSkillContext.stdout).data.selected.id,
    "commerce.orders.place-order",
  );
}

async function exerciseManagedSkillLifecycle() {
  const siblingSkill = path.join(userHome, ".agents", "skills", "user-owned-skill");
  const repositorySentinel = path.join(repositoryRoot, "setup-must-not-touch.txt");
  await mkdir(siblingSkill, { recursive: true });
  await writeFile(path.join(siblingSkill, "keep.txt"), "user-owned\n");
  await writeFile(repositorySentinel, "repository-owned\n");

  const firstSetup = JSON.parse(runInstalledCli(["setup"]).stdout);
  assert.equal(firstSetup.ok, true);
  assert.equal(firstSetup.command, "setup");
  assert.equal(firstSetup.data.outcome, "installed");
  assert.equal(firstSetup.data.targetDirectory, managedSkillDirectory);
  assert.deepEqual(firstSetup.data.identity, {
    packageName: packageIdentity.name,
    packageVersion: packageIdentity.version,
    skillName: "semantic-atlas",
    fingerprint: firstSetup.data.identity.fingerprint,
  });
  assert.match(firstSetup.data.identity.fingerprint, /^[a-f0-9]{64}$/u);

  const marker = JSON.parse(
    await readFile(
      path.join(managedSkillDirectory, ".semantic-atlas-managed.json"),
      "utf8",
    ),
  );
  assert.deepEqual(marker, {
    schemaVersion: 1,
    managedBy: "semantic-atlas",
    packageName: packageIdentity.name,
    packageVersion: packageIdentity.version,
    skillName: "semantic-atlas",
    fingerprint: firstSetup.data.identity.fingerprint,
  });

  const repeatedSetup = JSON.parse(runInstalledCli(["setup"]).stdout);
  assert.equal(repeatedSetup.data.outcome, "current");

  const installedSkillDocument = path.join(managedSkillDirectory, "SKILL.md");
  await appendFile(installedSkillDocument, "\nmodified managed copy\n");
  const repairedSetup = JSON.parse(runInstalledCli(["setup"]).stdout);
  assert.equal(repairedSetup.data.outcome, "repaired");
  assert.equal(
    await readFile(installedSkillDocument, "utf8"),
    await readFile(
      path.join(installedPackageRoot, ".agents", "skills", "semantic-atlas", "SKILL.md"),
      "utf8",
    ),
  );

  await writeFile(
    path.join(managedSkillDirectory, ".semantic-atlas-managed.json"),
    `${JSON.stringify({ version: "0.4.0", fingerprint: "a".repeat(64) }, null, 2)}\n`,
  );
  await writeFile(path.join(managedSkillDirectory, "legacy-only.txt"), "legacy\n");
  const upgradedLegacy = JSON.parse(runInstalledCli(["setup"]).stdout);
  assert.equal(upgradedLegacy.data.outcome, "upgraded");
  await assertMissing(path.join(managedSkillDirectory, "legacy-only.txt"));

  const backupDirectory = `${managedSkillDirectory}.backup`;
  const orphanStage = `${managedSkillDirectory}.installing-interrupted`;
  await rename(managedSkillDirectory, backupDirectory);
  await mkdir(orphanStage, { recursive: true });
  await writeFile(path.join(orphanStage, "partial.txt"), "partial replacement\n");
  await copyFile(
    path.join(backupDirectory, ".semantic-atlas-managed.json"),
    path.join(orphanStage, ".semantic-atlas-managed.json"),
  );
  const recoveredSetup = JSON.parse(runInstalledCli(["setup"]).stdout);
  assert.equal(recoveredSetup.data.outcome, "recovered");
  await assertMissing(backupDirectory);
  await assertMissing(orphanStage);

  const managedAdapter = path.join(
    managedSkillDirectory,
    "scripts",
    "query-context.mjs",
  );
  const managedContext = run(
    process.execPath,
    [managedAdapter, "Checkout", "--repo", repositoryRoot],
    consumerDirectory,
    cliEnvironment,
  );
  assert.equal(JSON.parse(managedContext.stdout).data.selected.id, "commerce.orders.place-order");

  const fakeBin = path.join(sandbox, "incompatible-bin");
  const fakeCli = path.join(fakeBin, "semantic-atlas");
  const misleadingHomeCli = path.join(userHome, "dist", "cli", "bin.js");
  await mkdir(fakeBin, { recursive: true });
  await mkdir(path.dirname(misleadingHomeCli), { recursive: true });
  await writeFile(
    fakeCli,
    "#!/usr/bin/env node\nprocess.stdout.write('0.4.0\\n');\n",
  );
  await writeFile(
    misleadingHomeCli,
    "process.stdout.write(JSON.stringify({ schemaVersion: 1, ok: true, command: 'context' }) + '\\n');\n",
  );
  await chmod(fakeCli, 0o755);
  const incompatible = runCommand(
    process.execPath,
    [managedAdapter, "Checkout", "--repo", repositoryRoot],
    consumerDirectory,
    {
      ...cliEnvironment,
      PATH: `${fakeBin}${path.delimiter}${cliEnvironment.PATH}`,
    },
  );
  assert.equal(incompatible.status, 2);
  assert.match(incompatible.stderr, /requires CLI .* but 0\.4\.0 is available/u);

  await rm(managedSkillDirectory, { recursive: true });
  await mkdir(managedSkillDirectory, { recursive: true });
  const unrelatedDocument = "---\nname: semantic-atlas\n---\n\n# User-owned Skill\n";
  await writeFile(path.join(managedSkillDirectory, "SKILL.md"), unrelatedDocument);
  const conflict = runInstalledCliAllowFailure(["setup"]);
  assert.equal(conflict.status, 1);
  assert.deepEqual(JSON.parse(conflict.stdout), {
    schemaVersion: 1,
    ok: false,
    command: "setup",
    error: {
      code: "MANAGED_SKILL_CONFLICT",
      message: `Refusing to replace '${managedSkillDirectory}' because it is not a recognized managed Semantic Atlas Skill`,
      directory: managedSkillDirectory,
    },
  });
  assert.equal(
    await readFile(path.join(managedSkillDirectory, "SKILL.md"), "utf8"),
    unrelatedDocument,
  );
  assert.equal(await readFile(path.join(siblingSkill, "keep.txt"), "utf8"), "user-owned\n");
  assert.equal(await readFile(repositorySentinel, "utf8"), "repository-owned\n");
}

function runInstalledCli(arguments_) {
  return run(process.execPath, [installedCli, ...arguments_], consumerDirectory, cliEnvironment);
}

function runInstalledCliAllowFailure(arguments_) {
  return runCommand(
    process.execPath,
    [installedCli, ...arguments_],
    consumerDirectory,
    cliEnvironment,
  );
}

async function assertMissing(filePath) {
  await assert.rejects(access(filePath));
}

function run(command, arguments_, cwd, environment = process.env) {
  const result = runCommand(command, arguments_, cwd, environment);
  assert.equal(
    result.status,
    0,
    `${command} ${arguments_.join(" ")} failed:\n${result.stderr || result.stdout}`,
  );
  return result;
}

function runCommand(command, arguments_, cwd, environment = process.env) {
  return spawnSync(command, arguments_, {
    cwd,
    encoding: "utf8",
    env: environment,
  });
}
