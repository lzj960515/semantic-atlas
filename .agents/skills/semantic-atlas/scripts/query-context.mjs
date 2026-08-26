import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const arguments_ = process.argv.slice(2);
if (arguments_.length === 0) {
  fail("Usage: query-context.mjs <business-term> --repo <repository-root>");
}

const bundledCli = fileURLToPath(
  new URL("../../../../dist/cli/bin.js", import.meta.url),
);
const command = await fileExists(bundledCli)
  ? {
      executable: process.execPath,
      arguments: [bundledCli, "context", ...arguments_],
    }
  : { executable: "semantic-atlas", arguments: ["context", ...arguments_] };
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
