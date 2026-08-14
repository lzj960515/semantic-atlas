import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { cliEnvelopeSchema, type CliEnvelope } from "../src/contracts/cli.js";
import {
  resolveConsumerInstallArguments,
  resolvePackageManagerInvocation,
  type PackageManager,
} from "./package-manager-command.js";

const executeFile = promisify(execFile);
const projectRoot = resolve(import.meta.dirname, "..");
const packageManager = selectedPackageManager();
const packageManagerRuntime = {
  platform: process.platform,
  nodeExecutable: process.execPath,
  packageManagerEntry: process.env.npm_execpath,
} as const;
const temporaryRoot = await mkdtemp(join(tmpdir(), "semantic-atlas-package-"));

try {
  const tarballPath = await packProject();
  const consumerRoot = await installTarball(tarballPath);
  const installedRoot = join(consumerRoot, "node_modules", "semantic-atlas");
  const installedPackage = await readPackageDocument(join(installedRoot, "package.json"));
  assertPublicPackage(installedPackage);
  await assertPackagedArtifacts(installedRoot);

  const repositoryRoot = await createFixtureRepository();
  const report = await verifyInstalledCli(consumerRoot, repositoryRoot, installedPackage.version);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

interface PackageDocument {
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  readonly license?: string;
  readonly author?: string | { readonly name?: string };
  readonly homepage?: string;
  readonly bugs?: { readonly url?: string };
  readonly repository?: { readonly type?: string; readonly url?: string };
  readonly keywords?: readonly string[];
  readonly engines?: { readonly node?: string };
  readonly bin?: Record<string, string>;
  readonly publishConfig?: { readonly access?: string; readonly provenance?: boolean };
}

interface CliResult {
  readonly exitCode: number;
  readonly stderr: string;
  readonly envelope: CliEnvelope;
}

function selectedPackageManager(): PackageManager {
  const configured = process.env.SEMANTIC_ATLAS_PACKAGE_MANAGER ?? "pnpm";
  assert.ok(configured === "npm" || configured === "pnpm",
    "SEMANTIC_ATLAS_PACKAGE_MANAGER must be npm or pnpm");
  return configured;
}

async function packProject(): Promise<string> {
  const packageDirectory = join(temporaryRoot, "artifacts");
  await mkdir(packageDirectory, { recursive: true });
  const packed = await runPackageManager([
    "pack",
    "--pack-destination",
    packageDirectory,
    "--json",
  ], projectRoot, 120_000);
  const result = parsePackOutput(packed.stdout);
  return resolve(packageDirectory, result.filename);
}

function parsePackOutput(output: string): { readonly filename: string } {
  const objectStart = output.lastIndexOf("\n{");
  const arrayStart = output.lastIndexOf("\n[");
  const jsonStart = Math.max(objectStart, arrayStart);
  const parsed = JSON.parse(output.slice(jsonStart < 0 ? 0 : jsonStart + 1)) as
    | { readonly filename: string }
    | readonly [{ readonly filename: string }];
  const result = Array.isArray(parsed) ? parsed[0] : parsed;
  assert.ok(result?.filename, "The package manager did not report a tarball filename");
  return result;
}

async function installTarball(tarballPath: string): Promise<string> {
  const consumerRoot = join(temporaryRoot, "consumer");
  await mkdir(consumerRoot, { recursive: true });
  const tarballSpecifier = relative(consumerRoot, tarballPath).replaceAll("\\", "/");
  await writeFile(join(consumerRoot, "package.json"), `${JSON.stringify({
    private: true,
    dependencies: {
      "semantic-atlas": `file:${tarballSpecifier}`,
    },
  }, null, 2)}\n`);
  const installArguments = resolveConsumerInstallArguments(packageManager);
  await runPackageManager(installArguments, consumerRoot, 120_000);
  return consumerRoot;
}

async function readPackageDocument(path: string): Promise<PackageDocument> {
  return JSON.parse(await readFile(path, "utf8")) as PackageDocument;
}

function assertPublicPackage(packageDocument: PackageDocument): void {
  assert.equal(packageDocument.name, "semantic-atlas");
  assert.match(packageDocument.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u);
  assert.notEqual(packageDocument.version, "0.0.0", "The public package needs a release version");
  assert.ok(packageDocument.description);
  assert.equal(packageDocument.license, "MIT");
  assert.ok(typeof packageDocument.author === "string" || packageDocument.author?.name);
  assert.equal(packageDocument.homepage, "https://github.com/lzj960515/semantic-atlas#readme");
  assert.equal(packageDocument.bugs?.url, "https://github.com/lzj960515/semantic-atlas/issues");
  assert.deepEqual(packageDocument.repository, {
    type: "git",
    url: "git+https://github.com/lzj960515/semantic-atlas.git",
  });
  assert.ok(packageDocument.keywords?.includes("ai-agents"));
  assert.equal(packageDocument.engines?.node, ">=22.12.0 <25");
  assert.equal(packageDocument.bin?.["semantic-atlas"], "./dist/cli/bin.js");
  assert.deepEqual(packageDocument.publishConfig, { access: "public", provenance: true });
}

async function assertPackagedArtifacts(installedRoot: string): Promise<void> {
  await Promise.all([
    "dist/index.js",
    "dist/index.d.ts",
    "dist/cli/bin.js",
    "schemas/cli-envelope-v1.schema.json",
    "schemas/graph-patch-v1.schema.json",
    ".agents/skills/semantic-atlas/SKILL.md",
    "README.md",
    "LICENSE",
  ].map((path) => access(join(installedRoot, path))));
}

async function createFixtureRepository(): Promise<string> {
  const repositoryRoot = join(temporaryRoot, "fixture");
  await mkdir(join(repositoryRoot, "src"), { recursive: true });
  await writeFile(join(repositoryRoot, "package.json"), `${JSON.stringify({
    name: "semantic-atlas-smoke-fixture",
    private: true,
    type: "module",
  }, null, 2)}\n`);
  await writeFile(join(repositoryRoot, "tsconfig.json"), `${JSON.stringify({
    compilerOptions: {
      module: "NodeNext",
      moduleResolution: "NodeNext",
      target: "ES2023",
    },
    include: ["src/**/*.ts"],
  }, null, 2)}\n`);
  await writeFile(join(repositoryRoot, "src", "greeting.ts"), [
    "export function greeting(name: string): string {",
    "  return `Hello, ${name}`;",
    "}",
    "",
  ].join("\n"));
  await git(repositoryRoot, "init", "--initial-branch=main");
  await git(repositoryRoot, "config", "user.name", "Semantic Atlas Package Verification");
  await git(repositoryRoot, "config", "user.email", "package@semantic-atlas.invalid");
  await git(repositoryRoot, "add", ".");
  await git(repositoryRoot, "commit", "-m", "test: initialize package fixture");
  return realpath(repositoryRoot);
}

async function verifyInstalledCli(
  consumerRoot: string,
  repositoryRoot: string,
  version: string,
) {
  const initialStatus = await runCli(consumerRoot, ["status"], repositoryRoot);
  assertSuccessfulCommand(initialStatus, "status");
  assert.equal(commandData(initialStatus, "status").freshness, "missing");

  const indexed = await runCli(consumerRoot, ["index"], repositoryRoot, 120_000);
  assertSuccessfulCommand(indexed, "index");
  const snapshotDiagnostics = indexed.envelope.snapshot === null
    ? await inspectInstalledSnapshotState(consumerRoot, repositoryRoot)
    : null;
  assert.equal(
    indexed.envelope.snapshot?.freshness,
    "current",
    `Index did not publish a current snapshot: ${JSON.stringify({
      envelope: indexed.envelope,
      snapshotDiagnostics,
    })}`,
  );
  assert.match(commandData(indexed, "index").snapshotId, /^[0-9a-f]{64}$/u);

  const roots = await runCli(consumerRoot, ["map", "roots"], repositoryRoot);
  assertSuccessfulCommand(roots, "map.roots");
  assert.ok(commandData(roots, "map.roots").nodes.length > 0);
  assert.equal(await git(repositoryRoot, "status", "--porcelain=v1", "--untracked-files=all"), "");
  assert.equal(isPathWithin(projectRoot, consumerRoot), false);

  return {
    schemaVersion: 1,
    package: { name: "semantic-atlas", version },
    runtime: { node: process.version, platform: process.platform, packageManager },
    smoke: {
      installedOutsideSourceCheckout: true,
      status: "missing",
      index: "current",
      mapRoots: commandData(roots, "map.roots").nodes.length,
      trackedRepositoryIntrusion: false,
    },
  };
}

async function inspectInstalledSnapshotState(
  consumerRoot: string,
  repositoryRoot: string,
): Promise<unknown> {
  try {
    const installedRoot = join(consumerRoot, "node_modules", "semantic-atlas", "dist");
    const api = await import(pathToFileURL(join(installedRoot, "index.js")).href) as
      typeof import("../src/index.js");
    const internal = await import(pathToFileURL(join(
      installedRoot,
      "world",
      "world-snapshot-store.js",
    )).href) as typeof import("../src/world/world-snapshot-store.js");
    const repository = await api.inspectGitRepository(repositoryRoot);
    const snapshots = new api.SnapshotStore(repository);
    let latestSnapshotId: string | null;
    try {
      latestSnapshotId = snapshots.latest()?.snapshotId ?? null;
    } finally {
      snapshots.close();
    }
    const world = new internal.WorldSnapshotStore(repository);
    try {
      return { latestSnapshotId, worldState: world.readState() };
    } finally {
      world.close();
    }
  } catch (error) {
    return {
      error: error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : String(error),
    };
  }
}

async function runCli(
  consumerRoot: string,
  arguments_: readonly string[],
  repositoryRoot: string,
  timeout = 30_000,
): Promise<CliResult> {
  const cliEntry = join(
    consumerRoot,
    "node_modules",
    "semantic-atlas",
    "dist",
    "cli",
    "bin.js",
  );
  const cliArguments = ["--repo", repositoryRoot, ...arguments_];
  const result = packageManager === "pnpm"
    ? await runPackageManager(["exec", "semantic-atlas", ...cliArguments], consumerRoot, timeout)
    : await executeFile(process.execPath, [cliEntry, ...cliArguments], {
      cwd: consumerRoot,
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
      timeout,
    });
  return {
    exitCode: 0,
    stderr: result.stderr,
    envelope: cliEnvelopeSchema.parse(JSON.parse(result.stdout)) as CliEnvelope,
  };
}

function assertSuccessfulCommand(
  result: CliResult,
  command: CliEnvelope["data"]["command"],
): void {
  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(result.envelope.status, "ok");
  assert.equal(result.envelope.data.command, command);
}

function commandData<Command extends CliEnvelope["data"]["command"]>(
  result: CliResult,
  command: Command,
): Extract<CliEnvelope["data"], { command: Command }> {
  const data = result.envelope.data;
  if (data.command !== command || "error" in data) {
    throw new Error(`Expected successful ${command} data`);
  }
  return data as Extract<CliEnvelope["data"], { command: Command }>;
}

function isPathWithin(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

async function runPackageManager(
  arguments_: readonly string[],
  cwd: string,
  timeout: number,
) {
  const invocation = resolvePackageManagerInvocation(
    packageManager,
    arguments_,
    packageManagerRuntime,
  );
  return executeFile(invocation.executable, invocation.arguments, {
    cwd,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    timeout,
  });
}

async function git(cwd: string, ...arguments_: string[]): Promise<string> {
  return (await executeFile("git", arguments_, {
    cwd,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  })).stdout.trimEnd();
}
