#!/usr/bin/env node

import { runCli } from "./main.js";

process.exitCode = await runCli(
  process.argv.slice(2),
  { stdin: process.stdin, stdout: process.stdout, stderr: process.stderr },
  process.cwd(),
);
