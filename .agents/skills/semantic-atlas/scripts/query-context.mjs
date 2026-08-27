import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const arguments_ = process.argv.slice(2);
if (arguments_.length === 0) {
  fail("Usage: query-context.mjs <business-term> --repo <repository-root>");
}

const bundledCli = fileURLToPath(
  new URL("../../../../dist/cli/bin.js", import.meta.url),
);
const command = await resolveCliCommand();
const result = spawnSync(command.executable, command.arguments, {
  encoding: "utf8",
});

if (result.error) {
  fail(`Could not run the semantic-atlas CLI: ${result.error.message}`);
}

let envelope;
try {
  envelope = JSON.parse(result.stdout);
} catch {
  fail(
    "The available semantic-atlas command does not implement the v1 context contract.",
  );
}

if (envelope?.schemaVersion !== 1 || envelope?.command !== "context") {
  fail(
    "The available semantic-atlas command returned an incompatible context envelope.",
  );
}

process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.status ?? 2;

async function resolveCliCommand() {
  const managedIdentity = await readManagedIdentity();
  if (managedIdentity) {
    const versionResult = spawnSync("semantic-atlas", ["--version"], {
      encoding: "utf8",
    });
    if (versionResult.error) {
      fail(`Could not verify the managed semantic-atlas CLI: ${versionResult.error.message}`);
    }
    const installedVersion = versionResult.stdout.trim();
    if (versionResult.status !== 0 || installedVersion !== managedIdentity.packageVersion) {
      fail(
        `The managed Semantic Atlas Skill requires CLI ${managedIdentity.packageVersion}, but ${installedVersion || "no compatible CLI"} is available.`,
      );
    }
    return {
      executable: "semantic-atlas",
      arguments: ["context", ...arguments_],
    };
  }

  if (await fileExists(bundledCli)) {
    return {
      executable: process.execPath,
      arguments: [bundledCli, "context", ...arguments_],
    };
  }

  return {
    executable: "semantic-atlas",
    arguments: ["context", ...arguments_],
  };
}

async function readManagedIdentity() {
  try {
    const marker = JSON.parse(
      await readFile(
        new URL("../.semantic-atlas-managed.json", import.meta.url),
        "utf8",
      ),
    );
    if (
      marker?.schemaVersion === 1
      && marker?.managedBy === "semantic-atlas"
      && marker?.skillName === "semantic-atlas"
      && typeof marker?.packageVersion === "string"
    ) {
      return { packageVersion: marker.packageVersion };
    }
    fail("The managed Semantic Atlas Skill has an invalid package identity.");
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    fail("The managed Semantic Atlas Skill package identity could not be read.");
  }
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}
