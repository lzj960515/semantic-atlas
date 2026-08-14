#!/usr/bin/env node

import {
  appendFileSync,
  existsSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { extname, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

import { get_encoding } from "tiktoken";

const SOURCE_TOKEN_METHOD = "tiktoken-o200k_base-v1";
const SOURCE_EXTENSIONS = new Set([".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);

try {
  const rootValue = requireEnvironment("EVALUATION_ROOT");
  const tracePath = requireEnvironment("EVALUATION_TRACE");
  const root = realpathSync(rootValue);
  const [command, ...arguments_] = process.argv.slice(2);
  if (command === "read") {
    observeRead(root, tracePath, arguments_);
  } else if (command === "search") {
    observeSearch(root, tracePath, arguments_);
  } else {
    throw new Error("usage: evaluation-source-observer <read|search> ...");
  }
} catch (error) {
  process.stderr.write(`Evaluation source observer: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

function observeRead(root, tracePath, arguments_) {
  const [file, startValue, endValue, ...extra] = arguments_;
  if (file === undefined || extra.length > 0) {
    throw new Error("read requires <file> [start-line] [end-line]");
  }
  const path = requireSourcePath(root, file);
  const lines = readFileSync(path, "utf8").split("\n");
  const start = parseLine(startValue, 1, "start-line");
  const end = parseLine(endValue, lines.length, "end-line");
  if (end < start) throw new Error("end-line must not precede start-line");
  const source = lines
    .slice(start - 1, end)
    .map((line, index) => `${start + index}:${line}`)
    .join("\n");
  const fileName = relativePath(root, path);
  const payload = `=== ${fileName}:${start}-${Math.min(end, lines.length)} ===\n${source}\n`;
  writeObservedPayload(tracePath, fileName, payload);
  process.stdout.write(payload);
}

function observeSearch(root, tracePath, arguments_) {
  const [pattern, ...pathValues] = arguments_;
  if (pattern === undefined || pattern.length === 0) {
    throw new Error("search requires <pattern> [path ...]");
  }
  const paths = pathValues.length === 0 ? ["."] : pathValues;
  paths.forEach((path) => requirePath(root, path));
  const result = spawnSync("rg", [
    "-n",
    "--with-filename",
    "--color",
    "never",
    "--glob",
    "*.{cjs,js,jsx,mjs,ts,tsx}",
    "--",
    pattern,
    ...paths,
  ], { cwd: root, encoding: "utf8" });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(result.stderr.trim() || `rg exited ${result.status}`);
  }
  if (result.status === 1) return;

  const matches = new Map();
  for (const line of result.stdout.trimEnd().split("\n")) {
    const separator = line.indexOf(":");
    if (separator < 1) continue;
    const file = line.slice(0, separator).replace(/^\.\//, "");
    const fileLines = matches.get(file) ?? [];
    fileLines.push(line.replace(/^\.\//, ""));
    matches.set(file, fileLines);
  }
  for (const [file, lines] of [...matches].sort(([left], [right]) => left.localeCompare(right))) {
    const payload = `=== ${file}:matches ===\n${lines.join("\n")}\n`;
    writeObservedPayload(tracePath, file, payload);
    process.stdout.write(payload);
  }
}

function writeObservedPayload(tracePath, file, payload) {
  const encoder = get_encoding("o200k_base");
  const sourceTokens = encoder.encode(payload).length;
  encoder.free();
  appendFileSync(tracePath, `${JSON.stringify({
    sequence: nextSequence(tracePath),
    file,
    sourceTokens,
    sourceTokenMethod: SOURCE_TOKEN_METHOD,
  })}\n`);
}

function nextSequence(tracePath) {
  if (!existsSync(tracePath)) return 1;
  const contents = readFileSync(tracePath, "utf8").trim();
  return contents.length === 0 ? 1 : contents.split("\n").length + 1;
}

function requireEnvironment(name) {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function requireSourcePath(root, value) {
  const path = requirePath(root, value);
  if (!SOURCE_EXTENSIONS.has(extname(path))) {
    throw new Error(`source reads require a JavaScript or TypeScript file: ${value}`);
  }
  const realPath = realpathSync(path);
  requireInsideRoot(root, realPath, value);
  return realPath;
}

function requirePath(root, value) {
  const path = resolve(root, value);
  requireInsideRoot(root, path, value);
  return path;
}

function requireInsideRoot(root, path, value) {
  if (path !== root && !path.startsWith(`${root}${sep}`)) {
    throw new Error(`path must stay inside the evaluation fixture: ${value}`);
  }
}

function relativePath(root, path) {
  return relative(root, path).split(sep).join("/");
}

function parseLine(value, fallback, label) {
  if (value === undefined) return fallback;
  const line = Number(value);
  if (!Number.isInteger(line) || line < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return line;
}
