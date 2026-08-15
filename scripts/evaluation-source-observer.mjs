#!/usr/bin/env node

import {
  appendFileSync,
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";

import { get_encoding } from "tiktoken";

const SOURCE_TOKEN_METHOD = "tiktoken-o200k_base-v1";
const SOURCE_EXTENSIONS = new Set([".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const ATLAS_SKILL_PATH = /^\.agents\/skills\/semantic-atlas\/(?:SKILL\.md|references\/[a-z0-9-]+\.md)$/u;

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
  const path = requireReadablePath(root, file);
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
  if (ATLAS_SKILL_PATH.test(fileName)) {
    writeSkillLoad(requireEnvironment("EVALUATION_SKILL_TRACE"), fileName);
  } else {
    writeObservedPayload(tracePath, fileName, payload);
  }
  process.stdout.write(payload);
}

function observeSearch(root, tracePath, arguments_) {
  const [pattern, ...pathValues] = arguments_;
  if (pattern === undefined || pattern.length === 0) {
    throw new Error("search requires <pattern> [path ...]");
  }
  const paths = pathValues.length === 0 ? ["."] : pathValues;
  const matcher = new RegExp(pattern, "u");
  const sourceFiles = new Map();
  for (const value of paths) {
    const path = requirePath(root, value);
    for (const sourcePath of findSourceFiles(root, path)) {
      sourceFiles.set(relativePath(root, sourcePath), sourcePath);
    }
  }

  for (const [file, path] of [...sourceFiles].sort(([left], [right]) => (
    left.localeCompare(right)
  ))) {
    const lines = readFileSync(path, "utf8")
      .split(/\r?\n/u)
      .flatMap((line, index) => (
        matcher.test(line) ? [`${file}:${index + 1}:${line}`] : []
      ));
    if (lines.length === 0) continue;
    const payload = `=== ${file}:matches ===\n${lines.join("\n")}\n`;
    writeObservedPayload(tracePath, file, payload);
    process.stdout.write(payload);
  }
}

function findSourceFiles(root, path) {
  const entry = lstatSync(path);
  if (entry.isSymbolicLink()) {
    requireInsideRoot(root, realpathSync(path), relativePath(root, path));
    return [];
  }
  if (entry.isFile()) {
    return SOURCE_EXTENSIONS.has(extname(path)) ? [path] : [];
  }
  if (!entry.isDirectory()) return [];

  return readdirSync(path, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((child) => {
      if (child.name.startsWith(".") || child.name === "node_modules") return [];
      return findSourceFiles(root, join(path, child.name));
    });
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

function writeSkillLoad(tracePath, file) {
  appendFileSync(tracePath, `${JSON.stringify({
    sequence: nextSequence(tracePath),
    file,
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

function requireReadablePath(root, value) {
  const path = requirePath(root, value);
  const relativeFile = relativePath(root, path);
  if (!SOURCE_EXTENSIONS.has(extname(path)) && !ATLAS_SKILL_PATH.test(relativeFile)) {
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
