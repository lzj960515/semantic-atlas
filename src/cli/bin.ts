#!/usr/bin/env node

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const arguments_ = process.argv.slice(2);

if (requiresSqliteCompatibilityProcess()) {
  process.exitCode = await runWithExperimentalSqlite(arguments_);
} else {
  const { runCli } = await import("./main.js");
  process.exitCode = await runCli(
    arguments_,
    { stdin: process.stdin, stdout: process.stdout, stderr: process.stderr },
    process.cwd(),
  );
}

function requiresSqliteCompatibilityProcess(): boolean {
  const nodeMajor = Number.parseInt(process.versions.node, 10);
  const warningAlreadyDisabled = process.execArgv.some((argument) => (
    argument === "--no-warnings"
    || argument === "--disable-warning=ExperimentalWarning"
  ));
  if (nodeMajor < 24 && !warningAlreadyDisabled) return true;

  return process.getBuiltinModule("node:sqlite") === undefined;
}

async function runWithExperimentalSqlite(arguments_: readonly string[]): Promise<number> {
  const child = spawn(process.execPath, [
    "--experimental-sqlite",
    "--disable-warning=ExperimentalWarning",
    fileURLToPath(import.meta.url),
    ...arguments_,
  ], { stdio: "inherit" });
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });
}
