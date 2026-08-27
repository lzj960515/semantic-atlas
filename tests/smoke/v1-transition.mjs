import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
const packageIdentity = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
const sandbox = await mkdtemp(path.join(os.tmpdir(), "semantic-atlas-v1-transition-"));
const archiveDirectory = path.join(sandbox, "archive");
const installPrefix = path.join(sandbox, "installation");
const userHome = path.join(sandbox, "home");
const anonymousEnvironment = withoutRegistryCredentials({
  ...process.env,
  HOME: userHome,
  USERPROFILE: userHome,
});

try {
  assert.deepEqual(
    { name: packageIdentity.name, version: packageIdentity.version },
    { name: "semantic-atlas", version: "1.0.0" },
  );
  await mkdir(archiveDirectory, { recursive: true });

  runNpm(["install", "--global", "--prefix", installPrefix, "--ignore-scripts", "semantic-atlas@0.4.0"]);
  assert.equal(runInstalledCli(["--version"]).stdout.trim(), "0.4.0");
  runInstalledCli(["setup"]);

  const archivePath = await packCandidate();
  runNpm(["install", "--global", "--prefix", installPrefix, "--ignore-scripts", archivePath]);
  assert.equal(runInstalledCli(["--version"]).stdout.trim(), packageIdentity.version);

  const setup = JSON.parse(runInstalledCli(["setup"]).stdout);
  assert.equal(setup.ok, true);
  assert.deepEqual(
    setup.data.skills.map(({ identity }) => ({
      packageName: identity.packageName,
      packageVersion: identity.packageVersion,
      skillName: identity.skillName,
    })),
    [
      {
        packageName: "semantic-atlas",
        packageVersion: "1.0.0",
        skillName: "semantic-atlas",
      },
      {
        packageName: "semantic-atlas",
        packageVersion: "1.0.0",
        skillName: "semantic-atlas-maintenance",
      },
    ],
  );

  const installedPackage = JSON.parse(await readFile(
    path.join(installedPackageRoot(), "package.json"),
    "utf8",
  ));
  assert.equal(installedPackage.name, "semantic-atlas");
  assert.equal(installedPackage.version, "1.0.0");

  for (const skillName of ["semantic-atlas", "semantic-atlas-maintenance"]) {
    const marker = JSON.parse(await readFile(
      path.join(
        userHome,
        ".agents",
        "skills",
        skillName,
        ".semantic-atlas-managed.json",
      ),
      "utf8",
    ));
    assert.equal(marker.packageName, "semantic-atlas");
    assert.equal(marker.packageVersion, "1.0.0");
    assert.equal(marker.skillName, skillName);
  }

  process.stdout.write("Verified public v0.4.0 to local v1.0.0 transition\n");
} finally {
  await rm(sandbox, { recursive: true, force: true });
}

async function packCandidate() {
  run("pnpm", ["pack", "--pack-destination", archiveDirectory], packageRoot);
  const archiveName = (await readdir(archiveDirectory)).find((name) => name.endsWith(".tgz"));
  assert.ok(archiveName, "Candidate archive is missing");
  return path.join(archiveDirectory, archiveName);
}

function runNpm(arguments_) {
  return run("npm", arguments_, packageRoot, anonymousEnvironment);
}

function runInstalledCli(arguments_) {
  return run(
    process.execPath,
    [path.join(installedPackageRoot(), "dist", "cli", "bin.js"), ...arguments_],
    installPrefix,
    anonymousEnvironment,
  );
}

function installedPackageRoot() {
  return path.join(installPrefix, "lib", "node_modules", "semantic-atlas");
}

function withoutRegistryCredentials(environment) {
  return Object.fromEntries(Object.entries(environment).filter(([name]) =>
    !/(?:AUTH|TOKEN|NPM_CONFIG_USERCONFIG)/iu.test(name)
  ));
}

function run(command, arguments_, cwd, environment = process.env) {
  const result = spawnSync(command, arguments_, {
    cwd,
    encoding: "utf8",
    env: environment,
  });
  assert.equal(
    result.status,
    0,
    `${command} ${arguments_.join(" ")} failed:\n${result.stderr || result.stdout}`,
  );
  return result;
}
