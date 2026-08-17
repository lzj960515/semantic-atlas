#!/usr/bin/env node

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  createSqliteCompatibilityArguments,
  requiresSqliteCompatibilityProcess,
} from "../runtime/sqlite-compatibility-process.js";

const arguments_ = process.argv.slice(2);

if (requiresSqliteCompatibilityProcess({
  nodeVersion: process.versions.node,
  execArguments: process.execArgv,
  sqliteAvailable: process.getBuiltinModule("node:sqlite") !== undefined,
})) {
  process.exitCode = await runWithExperimentalSqlite(arguments_);
} else {
  const { runCli } = await import("./main.js");
  process.exitCode = await runCli(
    arguments_,
    { stdin: process.stdin, stdout: process.stdout, stderr: process.stderr },
    process.cwd(),
  );
}

async function runWithExperimentalSqlite(arguments_: readonly string[]): Promise<number> {
  const child = spawn(process.execPath, createSqliteCompatibilityArguments(
    fileURLToPath(import.meta.url),
    arguments_,
  ), { stdio: "inherit" });
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });
}
