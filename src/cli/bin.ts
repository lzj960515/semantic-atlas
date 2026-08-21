#!/usr/bin/env node

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  createSqliteCompatibilityArguments,
  requiresSqliteCompatibilityProcess,
} from "../runtime/sqlite-compatibility-process.js";
import { runInsightsCli } from "./insights-cli.js";
import { runStandaloneCli } from "./standalone-cli.js";

const arguments_ = process.argv.slice(2);
const standaloneExitCode = await runStandaloneCli(
  arguments_,
  { stdin: process.stdin, stdout: process.stdout, stderr: process.stderr },
);

if (standaloneExitCode !== undefined) {
  process.exitCode = standaloneExitCode;
} else if (requiresSqliteCompatibilityProcess({
  nodeVersion: process.versions.node,
  execArguments: process.execArgv,
  sqliteAvailable: process.getBuiltinModule("node:sqlite") !== undefined,
})) {
  process.exitCode = await runWithExperimentalSqlite(arguments_);
} else {
  const io = { stdin: process.stdin, stdout: process.stdout, stderr: process.stderr };
  const { runWebCli } = await import("./web-cli.js");
  const webExitCode = await runWebCli(arguments_, io, process.cwd());
  if (webExitCode !== undefined) {
    process.exitCode = webExitCode;
  } else {
    const insightsExitCode = await runInsightsCli(arguments_, io);
    if (insightsExitCode !== undefined) {
      process.exitCode = insightsExitCode;
    } else {
      const { runCli } = await import("./main.js");
      process.exitCode = await runCli(arguments_, io, process.cwd());
    }
  }
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
