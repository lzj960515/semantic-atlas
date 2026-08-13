import { DatabaseSync } from "node:sqlite";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";
import {
  link,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as publicApi from "../../src/index.js";
import * as processInstance from "../../src/structural-backend/process-instance.js";
import { CodeGraphStructuralBackend } from "../../src/structural-backend/codegraph-backend.js";
import { inspectGitRepository } from "../../src/repository/repository-inspector.js";
import { StructuralWriteLock } from "../../src/structural-backend/structural-write-lock.js";
import type {
  StructuralBuildResult,
  StructuralIndexBackend,
  StructuralIndexState,
  StructuralNode,
  StructuralSearchResult,
} from "../../src/structural-backend/types.js";
import { createGitFixture, type GitFixture } from "../support/git-fixture.js";

interface StructuralFixture {
  readonly fixture: GitFixture;
  readonly backend: CodeGraphStructuralBackend;
}

const executeFile = promisify(execFile);

describe("CodeGraph structural backend", () => {
  const fixtures: GitFixture[] = [];
  const linkedWorktrees: string[] = [];

  afterEach(async () => {
    await Promise.all(linkedWorktrees.splice(0).map((path) => rm(path, { recursive: true, force: true })));
    await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
  });

  it("builds one ignored worktree-local index and normalizes its query surface", async () => {
    const { backend, fixture } = await createStructuralFixture(fixtures);
    const originalDirectory = process.env.CODEGRAPH_DIR;
    process.env.CODEGRAPH_DIR = ".caller-owned";

    try {
      await expect(backend.inspect()).resolves.toMatchObject({
        completeness: "missing",
        backendVersion: "1.5.0",
        databasePath: join(await realpath(fixture.directory), ".atlas", "codegraph.db"),
      });

      const result = await backend.build();

      expect(result).toMatchObject({
        completeness: "complete",
        mode: "initial",
        backendVersion: "1.5.0",
        databasePath: join(await realpath(fixture.directory), ".atlas", "codegraph.db"),
        counts: { filesErrored: 0 },
      });
      expect(result.boundaries).toEqual([
        expect.objectContaining({
          kind: "UnknownBoundary",
          operation: "calls",
          support: { status: "unresolved", provenance: "backend" },
          owner: expect.objectContaining({ id: expect.stringMatching(/^symbol:/u) }),
        }),
      ]);
      await expect(backend.listUnknownBoundaries()).resolves.toEqual(result.boundaries);
      expect(await readFile(join(fixture.directory, ".atlas", ".gitignore"), "utf8"))
        .toBe("*\n");
      await expectStructuralPublicationStateCleaned(result.databasePath);
      expect(await fixture.git("status", "--porcelain", "--untracked-files=all")).toBe("");
      await expect(readFile(join(fixture.directory, ".codegraph", "codegraph.db")))
        .rejects.toMatchObject({ code: "ENOENT" });

      const target = (await backend.search({ query: "target", limit: 5 }))[0]?.node;
      const caller = (await backend.search({ query: "caller", limit: 5 }))[0]?.node;
      expect(target).toMatchObject({
        kind: "Symbol",
        name: "target",
        path: "src/dep.ts",
        support: { status: "exact", provenance: "backend" },
      });
      expect(caller).toMatchObject({ kind: "Symbol", name: "caller" });
      if (target === undefined || caller === undefined) {
        throw new Error("Expected fixture symbols");
      }

      await expect(backend.getNode({ id: target.reference.id })).resolves.toEqual(target);
      await expect(backend.getCallers({ id: target.reference.id })).resolves.toEqual([
        expect.objectContaining({
          node: expect.objectContaining({ name: "caller" }),
          relation: expect.objectContaining({
            type: "calls",
            support: { status: "exact", provenance: "backend" },
          }),
        }),
      ]);
      await expect(backend.getCallees({ id: caller.reference.id })).resolves.toEqual([
        expect.objectContaining({ node: expect.objectContaining({ name: "target" }) }),
      ]);
      await expect(backend.traverse({
        reference: { id: caller.reference.id },
        maxDepth: 1,
        direction: "outgoing",
      })).resolves.toMatchObject({
        nodes: expect.arrayContaining([expect.objectContaining({ name: "target" })]),
        relations: expect.arrayContaining([expect.objectContaining({ type: "calls" })]),
      });
      await expect(backend.getFileDependencies("src/entry.ts")).resolves.toEqual([
        {
          path: "src/dep.ts",
          support: { status: "exact", provenance: "backend" },
        },
      ]);
      const roots = await backend.listRoots();
      expect(roots).toEqual([
        expect.objectContaining({
          reference: { id: "module:src" },
          kind: "Module",
          name: "src",
          virtual: true,
        }),
      ]);
      await expect(backend.getNode(roots[0]!.reference)).resolves.toEqual(roots[0]);
      await expect(backend.traverse({
        reference: roots[0]!.reference,
        maxDepth: 1,
        direction: "outgoing",
        relationTypes: ["contains"],
      })).resolves.toMatchObject({
        nodes: expect.arrayContaining([
          expect.objectContaining({ reference: { id: "module:src" } }),
          expect.objectContaining({ reference: { id: "file:src/dep.ts" }, kind: "File" }),
          expect.objectContaining({ reference: { id: "file:src/entry.ts" }, kind: "File" }),
        ]),
        relations: expect.arrayContaining([
          expect.objectContaining({
            from: { id: "module:src" },
            type: "contains",
            to: { id: "file:src/entry.ts" },
          }),
        ]),
      });
    } finally {
      if (originalDirectory === undefined) {
        delete process.env.CODEGRAPH_DIR;
      } else {
        process.env.CODEGRAPH_DIR = originalDirectory;
      }
    }
    expect(process.env.CODEGRAPH_DIR).toBe(originalDirectory);
  });

  it("publishes only the Atlas CLI and no destructive, watcher, MCP, or backend capability", async () => {
    const { backend } = await createStructuralFixture(fixtures);
    for (const forbidden of ["recreate", "uninitialize", "clear", "watch", "unwatch", "MCPServer", "cli"]) {
      expect(forbidden in (backend as unknown as object)).toBe(false);
    }

    const packageDocument = JSON.parse(await readFile(join(import.meta.dirname, "..", "..", "package.json"), "utf8")) as {
      readonly engines: { readonly node: string };
      readonly dependencies: Record<string, string>;
      readonly main?: string;
      readonly types?: string;
      readonly exports?: Record<string, unknown>;
      readonly files?: readonly string[];
      readonly bin?: Record<string, string>;
    };
    expect(packageDocument.dependencies["@colbymchenry/codegraph"]).toBe("1.5.0");
    expect(packageDocument.engines.node).toBe(">=22.12.0 <25");
    expect(packageDocument.main).toBe("./dist/index.js");
    expect(packageDocument.types).toBe("./dist/index.d.ts");
    expect(packageDocument.exports).toHaveProperty(".");
    expect(packageDocument.files).toContain("dist");
    expect(packageDocument.bin).toEqual({
      "semantic-atlas": "./dist/cli/bin.js",
    });
    for (const backendExport of [
      "CodeGraphStructuralBackend",
      "CodeGraph",
      "DatabaseConnection",
      "QueryBuilder",
      "MCPServer",
      "FileWatcher",
      "getDatabasePath",
      "runCodeGraphWorker",
      "CODEGRAPH_WORKER_ENVIRONMENT",
    ]) {
      expect(backendExport in publicApi).toBe(false);
    }
  });

  it("synchronizes source changes incrementally", async () => {
    const { backend, fixture } = await createStructuralFixture(fixtures);
    await backend.build();
    await fixture.write("src/dep.ts", [
      "export function target(value: number) { return value + 2; }",
      "export const added = true;",
      "",
    ].join("\n"));

    const result = await backend.sync();

    expect(result).toMatchObject({
      completeness: "complete",
      mode: "incremental",
      changes: {
        added: [],
        modified: ["src/dep.ts"],
        removed: [],
      },
    });
    await expect(backend.search({ query: "added", limit: 5 })).resolves.toEqual([
      expect.objectContaining({ node: expect.objectContaining({ name: "added" }) }),
    ]);
  });

  it("distinguishes a real no-change sync from unavailable cross-process locking", async () => {
    const { backend, fixture } = await createStructuralFixture(fixtures);
    await backend.build();

    const unchanged = await backend.sync();
    expect(unchanged).toMatchObject({
      completeness: "complete",
      mode: "incremental",
      counts: { filesDiscovered: expect.any(Number) },
      changes: { added: [], modified: [], removed: [] },
    });
    expect(unchanged.counts.filesDiscovered).toBeGreaterThan(0);

    await fixture.write("src/entry.ts", [
      "import { target } from './dep.js';",
      "export function caller() { return target(1); }",
      "export const addedWhileLocked = true;",
      "",
    ].join("\n"));

    const result = await withHeldCodeGraphLock(fixture.directory, () => backend.sync());

    expect(result).toMatchObject({
      completeness: "incomplete",
      mode: "incremental",
      counts: { filesDiscovered: 0, filesIndexed: 0 },
      changes: { added: [], modified: [], removed: [] },
      diagnostics: [expect.objectContaining({
        code: "STRUCTURAL_INDEX_INCOMPLETE",
        message: expect.stringMatching(/lock/iu),
      })],
    });
    await expect(backend.search({ query: "addedWhileLocked", limit: 5 })).resolves.toEqual([]);
  });

  it("reports lock contention from the bundled SDK worker as incomplete", async () => {
    const { backend, fixture } = await createStructuralFixture(fixtures);
    await backend.build();
    await fixture.write("src/entry.ts", [
      "import { target } from './dep.js';",
      "export function caller() { return target(1); }",
      "export const addedThroughWorker = true;",
      "",
    ].join("\n"));
    const repository = await inspectGitRepository(fixture.directory);

    const result = await withHeldCodeGraphLock(fixture.directory, () =>
      runBuiltCodeGraphWorker(repository, "sync"));

    expect(result).toMatchObject({
      completeness: "incomplete",
      mode: "incremental",
      counts: { filesDiscovered: 0, filesIndexed: 0 },
      changes: { added: [], modified: [], removed: [] },
      diagnostics: [expect.objectContaining({
        code: "STRUCTURAL_INDEX_INCOMPLETE",
        message: expect.stringMatching(/lock/iu),
      })],
    });
  });

  it("keeps a live Atlas write lock authoritative after CodeGraph's stale timeout", async () => {
    const { backend, fixture } = await createStructuralFixture(fixtures);
    await backend.build();
    await fixture.write("src/entry.ts", [
      "import { target } from './dep.js';",
      "export function caller() { return target(1); }",
      "export const addedWhileAtlasLocked = true;",
      "",
    ].join("\n"));
    const repository = await inspectGitRepository(fixture.directory);

    const [rebuild, sync] = await withHeldAtlasWriteLock(fixture.directory, async (lockContent) => {
      const rebuildResult = await backend.build();
      const syncResult = await runBuiltCodeGraphWorker(repository, "sync");
      expect(await readFile(join(fixture.directory, ".atlas", "semantic-atlas.lock"), "utf8"))
        .toBe(lockContent);
      return [rebuildResult, syncResult];
    });

    for (const result of [rebuild, sync]) {
      expect(result).toMatchObject({
        completeness: "incomplete",
        counts: { filesIndexed: 0 },
        diagnostics: [expect.objectContaining({
          code: "STRUCTURAL_INDEX_INCOMPLETE",
          message: expect.stringMatching(/lock/iu),
        })],
      });
    }
    await expect(backend.inspect()).resolves.toMatchObject({ completeness: "complete" });
    await expect(backend.search({ query: "addedWhileAtlasLocked", limit: 5 })).resolves.toEqual([]);
  });

  it("reclaims only dead Atlas lock holders and does not delete replacement ownership", async () => {
    const { backend, fixture } = await createStructuralFixture(fixtures);
    await backend.build();
    const lockPath = join(fixture.directory, ".atlas", "semantic-atlas.lock");
    const deadPid = await exitedProcessId();
    await writeFile(lockPath, `${JSON.stringify({ pid: deadPid, token: "dead-owner" })}\n`, "utf8");

    const lock = StructuralWriteLock.acquire(lockPath);

    expect(lock).toBeDefined();
    await rm(lockPath);
    const replacement = `${JSON.stringify({ pid: process.pid, token: "replacement-owner" })}\n`;
    await writeFile(lockPath, replacement, { encoding: "utf8", flag: "wx" });
    lock?.release();
    expect(await readFile(lockPath, "utf8")).toBe(replacement);
  });

  it.each([
    ["in-process SDK", false],
    ["private SDK worker", true],
  ] as const)(
    "allows only one live %s lock reclaimer",
    async (_runtime, privateWorker) => {
      if (process.platform === "win32") {
        return;
      }

      const { fixture } = await createStructuralFixture(fixtures);
      const projectRoot = join(import.meta.dirname, "..", "..");
      await executeFile("pnpm", ["build"], { cwd: projectRoot });
      const repository = await inspectGitRepository(fixture.directory);
      const builtBackend = privateWorker ? undefined : await createBuiltStructuralBackend(repository);
      const request = <T>(operation: string, input?: unknown): Promise<T> => privateWorker
        ? runBuiltPrivateWorkerRequest(repository, { operation, input })
        : executeBuiltBackendRequest(builtBackend!, operation, input);
      await expect(request<StructuralBuildResult>("build")).resolves.toMatchObject({
        completeness: "complete",
      });
      await fixture.write("src/dep.ts", [
        "export function target(value: number) { return value + 2; }",
        "export const addedAfterDeadLockRace = true;",
        "",
      ].join("\n"));

      const lockPath = join(fixture.directory, ".atlas", "semantic-atlas.lock");
      const deadPid = await exitedProcessId();
      await writeFile(lockPath, `${JSON.stringify({ pid: deadPid, token: "dead-owner" })}\n`);
      const first = startBuiltLockContender(lockPath, privateWorker, true);
      const contenders = [first];
      try {
        await waitForContenderOutput(first, "reclaiming");
        const second = startBuiltLockContender(lockPath, privateWorker, false);
        contenders.push(second);
        await waitForContenderOutcome(second);
        first.child.kill("SIGCONT");
        await waitForContenderOutcome(first);

        expect(contenders.filter((contender) => contender.output.includes("acquired\n")))
          .toHaveLength(1);
        await expect(request<StructuralBuildResult>("sync")).resolves.toMatchObject({
          completeness: "incomplete",
          diagnostics: [expect.objectContaining({
            code: "STRUCTURAL_INDEX_INCOMPLETE",
            message: expect.stringMatching(/lock/iu),
          })],
        });
      } finally {
        await Promise.all(contenders.map(finishLockContender));
      }

      await expect(request<StructuralBuildResult>("sync")).resolves.toMatchObject({
        completeness: "complete",
        mode: "incremental",
      });
      await expect(request<readonly StructuralSearchResult[]>("search", {
        query: "addedAfterDeadLockRace",
        limit: 5,
      })).resolves.toEqual(expect.arrayContaining([
        expect.objectContaining({ node: expect.objectContaining({ name: "addedAfterDeadLockRace" }) }),
      ]));
      await expectStructuralPublicationStateCleaned(join(
        fixture.directory,
        ".atlas",
        "codegraph.db",
      ));
    },
    60_000,
  );

  it.each([
    ["in-process SDK", false],
    ["private SDK worker", true],
  ] as const)(
    "recovers a %s index from a PID-reused ownership lease",
    async (_runtime, privateWorker) => {
      const { fixture } = await createStructuralFixture(fixtures);
      const projectRoot = join(import.meta.dirname, "..", "..");
      await executeFile("pnpm", ["build"], { cwd: projectRoot });
      const repository = await inspectGitRepository(fixture.directory);
      const builtBackend = privateWorker ? undefined : await createBuiltStructuralBackend(repository);
      const request = <T>(operation: string, input?: unknown): Promise<T> => privateWorker
        ? runBuiltPrivateWorkerRequest(repository, { operation, input })
        : executeBuiltBackendRequest(builtBackend!, operation, input);
      await expect(request<StructuralBuildResult>("build")).resolves.toMatchObject({
        completeness: "complete",
      });
      await fixture.write("src/dep.ts", [
        "export function target(value: number) { return value + 2; }",
        "export const addedAfterPidReuse = true;",
        "",
      ].join("\n"));

      const unrelated = await startBuiltProcessInstanceHolder();
      const atlasDirectory = join(fixture.directory, ".atlas");
      const collidingLeasePath = join(
        atlasDirectory,
        `semantic-atlas.lock.owner-${unrelated.child.pid}-open-file-${unrelated.instanceId}-00000000-0000-4000-8000-000000000000`,
      );
      await writeFile(collidingLeasePath, `${JSON.stringify({
        pid: unrelated.child.pid,
        token: "00000000-0000-4000-8000-000000000000",
        instanceId: unrelated.instanceId,
        instanceProof: "open-file",
      })}\n`);
      const legacyLeasePath = join(
        atlasDirectory,
        `semantic-atlas.lock.owner-${unrelated.child.pid}-00000000-0000-4000-8000-000000000000`,
      );
      await writeFile(legacyLeasePath, `${JSON.stringify({
        pid: unrelated.child.pid,
        token: "00000000-0000-4000-8000-000000000000",
      })}\n`);

      try {
        await expect(request<StructuralIndexState>("inspect")).resolves.toMatchObject({
          completeness: "complete",
        });
        const reusedInstanceId = "0".repeat(64);
        const leasePath = join(
          atlasDirectory,
          `semantic-atlas.lock.owner-${unrelated.child.pid}-${reusedInstanceId}-00000000-0000-4000-8000-000000000000`,
        );
        await writeFile(leasePath, `${JSON.stringify({
          pid: unrelated.child.pid,
          token: "00000000-0000-4000-8000-000000000000",
          instanceId: reusedInstanceId,
        })}\n`);
        await expect(request<readonly StructuralSearchResult[]>("search", {
          query: "target",
          limit: 5,
        })).resolves.toEqual(expect.arrayContaining([
          expect.objectContaining({ node: expect.objectContaining({ name: "target" }) }),
        ]));
        await writeFile(leasePath, "");
        await expect(request<StructuralIndexState>("inspect")).resolves.toMatchObject({
          completeness: "complete",
        });
        await expect(request<StructuralBuildResult>("sync")).resolves.toMatchObject({
          completeness: "complete",
          mode: "incremental",
        });
        await expect(request<readonly StructuralSearchResult[]>("search", {
          query: "addedAfterPidReuse",
          limit: 5,
        })).resolves.toEqual(expect.arrayContaining([
          expect.objectContaining({ node: expect.objectContaining({ name: "addedAfterPidReuse" }) }),
        ]));
        await expect(readFile(legacyLeasePath)).rejects.toMatchObject({ code: "ENOENT" });
        await expect(readFile(collidingLeasePath)).rejects.toMatchObject({ code: "ENOENT" });
        await expect(readFile(leasePath)).rejects.toMatchObject({ code: "ENOENT" });
      } finally {
        unrelated.child.stdin?.end();
        await waitForProcessExit(unrelated.child);
      }
      await expectStructuralPublicationStateCleaned(join(atlasDirectory, "codegraph.db"));
    },
    60_000,
  );

  it("assigns distinct identities to macOS processes started in the same second", async () => {
    if (process.platform !== "darwin") {
      return;
    }
    const projectRoot = join(import.meta.dirname, "..", "..");
    await executeFile("pnpm", ["build"], { cwd: projectRoot });
    await waitForEarlyWallClockSecond();

    const instances = await Promise.all(Array.from(
      { length: 4 },
      () => inspectBuiltProcessInstance(),
    ));

    expect(new Set(instances.map((instance) => instance.startedAt))).toHaveLength(1);
    expect(new Set(instances.map((instance) => instance.instanceId))).toHaveLength(instances.length);
  }, 60_000);

  it("disambiguates previous macOS process-start leases within one second", async () => {
    if (process.platform !== "darwin") {
      return;
    }
    const holder = await startBuiltProcessInstanceHolder();
    try {
      const leaseIdentity = {
        path: "/unused-for-process-start-proof",
        device: 0,
        inode: 0,
      };

      expect(processInstance.inspectProcessInstance(
        holder.child.pid,
        holder.processStartInstanceId,
        "process-start",
        { ...leaseIdentity, writtenAtMs: 0 },
      )).toBe("different");
      expect(processInstance.inspectProcessInstance(
        holder.child.pid,
        holder.processStartInstanceId,
        "process-start",
        { ...leaseIdentity, writtenAtMs: Date.now() },
      )).toBe("matching");
    } finally {
      holder.child.stdin?.end();
      await waitForProcessExit(holder.child);
    }
  }, 60_000);

  it("reclaims a legacy fixed lock whose PID belongs to a newer process", async () => {
    const atlasDirectory = await mkdtemp(join(tmpdir(), "semantic-atlas-legacy-lock-"));
    linkedWorktrees.push(atlasDirectory);
    const lockPath = join(atlasDirectory, "semantic-atlas.lock");
    const legacyLeasePath = `${lockPath}.owner-${process.pid}-00000000-0000-4000-8000-000000000000`;
    await writeFile(legacyLeasePath, `${JSON.stringify({
      pid: process.pid,
      token: "00000000-0000-4000-8000-000000000000",
    })}\n`);
    await link(legacyLeasePath, lockPath);
    const processStartedAfter = vi.spyOn(processInstance, "processStartedAfter")
      .mockReturnValue(true);

    try {
      const acquired = StructuralWriteLock.acquire(lockPath);

      expect(acquired).toBeDefined();
      acquired?.release();
      await expect(readFile(legacyLeasePath)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(readFile(lockPath)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      processStartedAfter.mockRestore();
    }
  });

  it("does not replace symlink or non-regular Atlas lock paths", async () => {
    const { backend, fixture } = await createStructuralFixture(fixtures);
    await backend.build();
    const lockPath = join(fixture.directory, ".atlas", "semantic-atlas.lock");
    const outsideDirectory = await mkdtemp(join(tmpdir(), "semantic-atlas-lock-outside-"));
    linkedWorktrees.push(outsideDirectory);
    const outsideLock = join(outsideDirectory, "outside-lock");
    await writeFile(outsideLock, "outside sentinel\n");
    await symlink(outsideLock, lockPath);

    expect(StructuralWriteLock.acquire(lockPath)).toBeUndefined();
    expect(await readFile(outsideLock, "utf8")).toBe("outside sentinel\n");

    await rm(lockPath);
    await mkdir(lockPath);
    expect(StructuralWriteLock.acquire(lockPath)).toBeUndefined();
    expect((await stat(lockPath)).isDirectory()).toBe(true);
  });

  it.each([
    ["in-process SDK", false],
    ["private SDK worker", true],
  ] as const)(
    "recovers a %s index after lock ownership publication is terminated",
    async (_runtime, privateWorker) => {
      if (process.platform === "win32") {
        return;
      }

      const { fixture } = await createStructuralFixture(fixtures);
      const projectRoot = join(import.meta.dirname, "..", "..");
      await executeFile("pnpm", ["build"], { cwd: projectRoot });
      const repository = await inspectGitRepository(fixture.directory);
      const builtBackend = privateWorker ? undefined : await createBuiltStructuralBackend(repository);
      const request = <T>(operation: string, input?: unknown): Promise<T> => privateWorker
        ? runBuiltPrivateWorkerRequest(repository, { operation, input })
        : executeBuiltBackendRequest(builtBackend!, operation, input);

      await expect(request<StructuralBuildResult>("build")).resolves.toMatchObject({
        completeness: "complete",
      });
      await crashAtlasLockDuringOwnershipPublication(fixture.directory);

      await expect(request<StructuralIndexState>("inspect")).resolves.toMatchObject({
        completeness: "complete",
      });
      await expect(request<readonly StructuralSearchResult[]>("search", {
        query: "target",
        limit: 5,
      })).resolves.toEqual(expect.arrayContaining([
        expect.objectContaining({ node: expect.objectContaining({ name: "target" }) }),
      ]));

      await fixture.write("src/dep.ts", [
        "export function target(value: number) { return value + 2; }",
        "export const addedAfterLockCrash = true;",
        "",
      ].join("\n"));
      await expect(request<StructuralBuildResult>("sync")).resolves.toMatchObject({
        completeness: "complete",
        mode: "incremental",
      });
      await expect(request<readonly StructuralSearchResult[]>("search", {
        query: "addedAfterLockCrash",
        limit: 5,
      })).resolves.toEqual(expect.arrayContaining([
        expect.objectContaining({ node: expect.objectContaining({ name: "addedAfterLockCrash" }) }),
      ]));
      await expectStructuralPublicationStateCleaned(join(
        fixture.directory,
        ".atlas",
        "codegraph.db",
      ));
    },
    60_000,
  );

  it("preserves the published graph when a full rebuild cannot acquire the write lock", async () => {
    const { backend, fixture } = await createStructuralFixture(fixtures);
    await backend.build();
    const published = (await backend.search({ query: "target", limit: 5 }))[0]?.node;
    if (published === undefined) {
      throw new Error("Expected a published symbol before rebuilding");
    }

    const result = await withHeldCodeGraphLock(fixture.directory, () => backend.build());

    expect(result).toMatchObject({
      completeness: "incomplete",
      mode: "full",
      counts: { filesIndexed: 0 },
      diagnostics: [expect.objectContaining({
        code: "STRUCTURAL_INDEX_INCOMPLETE",
        message: expect.stringMatching(/lock/iu),
      })],
    });
    await expect(backend.inspect()).resolves.toMatchObject({ completeness: "complete" });
    await expect(backend.getNode(published.reference)).resolves.toEqual(published);
    await expect(backend.search({ query: "target", limit: 5 })).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ node: expect.objectContaining({ reference: published.reference }) }),
    ]));
    await expectStructuralBackupsCleaned(fixture.directory);
  });

  it("preserves the published graph when a worker full rebuild cannot acquire the write lock", async () => {
    const { backend, fixture } = await createStructuralFixture(fixtures);
    await backend.build();
    const published = (await backend.search({ query: "target", limit: 5 }))[0]?.node;
    if (published === undefined) {
      throw new Error("Expected a published symbol before rebuilding");
    }
    const repository = await inspectGitRepository(fixture.directory);

    const result = await withHeldCodeGraphLock(fixture.directory, () =>
      runBuiltCodeGraphWorker(repository, "build"));

    expect(result).toMatchObject({
      completeness: "incomplete",
      mode: "full",
      counts: { filesIndexed: 0 },
      diagnostics: [expect.objectContaining({
        code: "STRUCTURAL_INDEX_INCOMPLETE",
        message: expect.stringMatching(/lock/iu),
      })],
    });
    await expect(backend.inspect()).resolves.toMatchObject({ completeness: "complete" });
    await expect(backend.getNode(published.reference)).resolves.toEqual(published);
    await expect(backend.search({ query: "target", limit: 5 })).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ node: expect.objectContaining({ reference: published.reference }) }),
    ]));
    await expectStructuralBackupsCleaned(fixture.directory);
  });

  it("rebuilds an existing structural index without replacing colocated Atlas data", async () => {
    const { backend } = await createStructuralFixture(fixtures);
    const initial = await backend.build();
    const database = new DatabaseSync(initial.databasePath);
    database.exec(`
      CREATE TABLE atlas_fixture_knowledge (business_key TEXT PRIMARY KEY) STRICT;
      INSERT INTO atlas_fixture_knowledge (business_key) VALUES ('orders/place-order');
    `);
    database.close();

    const rebuilt = await backend.build();
    const reopened = new DatabaseSync(rebuilt.databasePath);
    try {
      expect(rebuilt).toMatchObject({ completeness: "complete", mode: "full" });
      expect(reopened.prepare("SELECT business_key FROM atlas_fixture_knowledge").get())
        .toEqual({ business_key: "orders/place-order" });
    } finally {
      reopened.close();
    }
  });

  it("restores the published database when a full rebuild fails after acquiring the write lock", async () => {
    const { backend } = await createStructuralFixture(fixtures);
    const initial = await backend.build();
    const published = (await backend.search({ query: "target", limit: 5 }))[0]?.node;
    if (published === undefined) {
      throw new Error("Expected a published symbol before rebuilding");
    }

    const database = new DatabaseSync(initial.databasePath);
    database.exec(`
      CREATE TABLE atlas_fixture_knowledge (business_key TEXT PRIMARY KEY) STRICT;
      INSERT INTO atlas_fixture_knowledge (business_key) VALUES ('orders/place-order');
      CREATE TRIGGER fail_structural_rebuild
      BEFORE INSERT ON nodes
      BEGIN
        SELECT RAISE(ABORT, 'forced structural rebuild failure');
      END;
    `);
    database.close();

    const result = await backend.build();

    expect(result).toMatchObject({
      completeness: "incomplete",
      mode: "full",
      diagnostics: [expect.objectContaining({
        message: expect.stringMatching(/forced structural rebuild failure/iu),
      })],
    });
    await expect(backend.inspect()).resolves.toMatchObject({ completeness: "complete" });
    await expect(backend.getNode(published.reference)).resolves.toEqual(published);
    await expect(backend.search({ query: "target", limit: 5 })).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ node: expect.objectContaining({ reference: published.reference }) }),
    ]));

    const restored = new DatabaseSync(initial.databasePath, { readOnly: true });
    try {
      expect(restored.prepare("SELECT business_key FROM atlas_fixture_knowledge").get())
        .toEqual({ business_key: "orders/place-order" });
    } finally {
      restored.close();
    }
    await expectStructuralBackupsCleaned(initial.databasePath, true);
  });

  it("restores the published database when incremental sync fails after structural writes begin", async () => {
    const { backend, fixture } = await createStructuralFixture(fixtures);
    const initial = await backend.build();
    const published = (await backend.search({ query: "target", limit: 5 }))[0]?.node;
    if (published === undefined) {
      throw new Error("Expected a published symbol before synchronizing");
    }

    const database = new DatabaseSync(initial.databasePath);
    database.exec(`
      CREATE TABLE atlas_fixture_knowledge (business_key TEXT PRIMARY KEY) STRICT;
      INSERT INTO atlas_fixture_knowledge (business_key) VALUES ('orders/place-order');
      CREATE TRIGGER fail_structural_sync
      BEFORE INSERT ON nodes
      BEGIN
        SELECT RAISE(ABORT, 'forced structural sync failure');
      END;
    `);
    database.close();
    await fixture.write("src/dep.ts", [
      "export function target(value: number) { return value + 2; }",
      "export const addedDuringFailedSync = true;",
      "",
    ].join("\n"));

    const result = await backend.sync();

    await expectFailedSyncToPreservePublishedDatabase(backend, initial.databasePath, published, result);
  });

  it("restores the published database when private-worker sync fails after structural writes begin", async () => {
    const { backend, fixture } = await createStructuralFixture(fixtures);
    const initial = await backend.build();
    const published = (await backend.search({ query: "target", limit: 5 }))[0]?.node;
    if (published === undefined) {
      throw new Error("Expected a published symbol before synchronizing");
    }

    const database = new DatabaseSync(initial.databasePath);
    database.exec(`
      CREATE TABLE atlas_fixture_knowledge (business_key TEXT PRIMARY KEY) STRICT;
      INSERT INTO atlas_fixture_knowledge (business_key) VALUES ('orders/place-order');
      CREATE TRIGGER fail_worker_structural_sync
      BEFORE INSERT ON nodes
      BEGIN
        SELECT RAISE(ABORT, 'forced private-worker structural sync failure');
      END;
    `);
    database.close();
    await fixture.write("src/dep.ts", [
      "export function target(value: number) { return value + 2; }",
      "export const addedDuringFailedWorkerSync = true;",
      "",
    ].join("\n"));
    const repository = await inspectGitRepository(fixture.directory);

    const result = await runBuiltCodeGraphWorker(repository, "sync");

    await expectFailedSyncToPreservePublishedDatabase(backend, initial.databasePath, published, result);
  });

  it.each([
    ["in-process SDK", false],
    ["private SDK worker", true],
  ] as const)(
    "rejects concurrent reads and recovers a %s sync terminated between structural writes",
    async (_runtime, privateWorker) => {
      if (process.platform === "win32") {
        return;
      }

      const { fixture } = await createStructuralFixture(fixtures);
      const projectRoot = join(import.meta.dirname, "..", "..");
      await executeFile("pnpm", ["build"], { cwd: projectRoot });
      const repository = await inspectGitRepository(fixture.directory);
      const builtBackend = privateWorker ? undefined : await createBuiltStructuralBackend(repository);
      const initial = privateWorker
        ? await runBuiltPrivateWorkerRequest<StructuralBuildResult>(repository, { operation: "build" })
        : await builtBackend!.build();
      const initialSearch = privateWorker
        ? await runBuiltPrivateWorkerRequest<readonly StructuralSearchResult[]>(repository, {
            operation: "search",
            input: { query: "target", limit: 5 },
          })
        : await builtBackend!.search({ query: "target", limit: 5 });
      const published = initialSearch[0]?.node;
      if (published === undefined) {
        throw new Error("Expected a published symbol before interrupting synchronization");
      }
      const database = new DatabaseSync(initial.databasePath);
      database.exec(`
        CREATE TABLE atlas_fixture_knowledge (business_key TEXT PRIMARY KEY) STRICT;
        INSERT INTO atlas_fixture_knowledge (business_key) VALUES ('orders/place-order');
      `);
      database.close();

      await fixture.write("src/dep.ts", largeReplacementSource());
      const sync = await startBuiltStructuralSync(repository, privateWorker);
      const inspect = (): Promise<StructuralIndexState> => privateWorker
        ? runBuiltPrivateWorkerRequest(repository, { operation: "inspect" })
        : builtBackend!.inspect();
      const search = (query: string): Promise<readonly StructuralSearchResult[]> => privateWorker
        ? runBuiltPrivateWorkerRequest(repository, {
            operation: "search",
            input: { query, limit: 5 },
          })
        : builtBackend!.search({ query, limit: 5 });
      const getNode = (): Promise<StructuralNode | undefined> => privateWorker
        ? runBuiltPrivateWorkerRequest(repository, {
            operation: "getNode",
            input: published.reference,
          })
        : builtBackend!.getNode(published.reference);
      try {
        await waitForPartiallyWrittenSync(initial.databasePath, sync);

        await expect(inspect()).resolves.toMatchObject({
          completeness: "incomplete",
          diagnostics: [expect.objectContaining({
            code: "STRUCTURAL_INDEX_INCOMPLETE",
            message: expect.stringMatching(/lock|publish/iu),
          })],
        });
        await expect(search("target")).rejects.toMatchObject({
          code: "STRUCTURAL_INDEX_INCOMPLETE",
        });
      } finally {
        signalProcessGroup(sync, "SIGKILL");
        await waitForProcessExit(sync);
        await waitForStructuralWriterExit(initial.databasePath);
      }

      const recoveredState = await inspect();
      expect(recoveredState).toMatchObject({ completeness: "complete" });
      await expect(getNode()).resolves.toEqual(published);
      await expect(search("target")).resolves.toEqual(expect.arrayContaining([
        expect.objectContaining({ node: expect.objectContaining({ reference: published.reference }) }),
      ]));
      await expect(search("r29999")).resolves.toEqual([]);

      const restored = new DatabaseSync(initial.databasePath, { readOnly: true });
      try {
        expect(restored.prepare("SELECT business_key FROM atlas_fixture_knowledge").get())
          .toEqual({ business_key: "orders/place-order" });
      } finally {
        restored.close();
      }
      await expectStructuralPublicationStateCleaned(initial.databasePath);
    },
    60_000,
  );

  it("keeps linked worktrees on independent databases without visible generated files", async () => {
    const primary = await createStructuralFixture(fixtures);
    const linkedWorktree = `${primary.fixture.directory}-linked`;
    linkedWorktrees.push(linkedWorktree);
    await primary.fixture.git("worktree", "add", "-b", "fixture-linked", linkedWorktree);
    const linkedRepository = await inspectGitRepository(linkedWorktree);
    const linkedBackend = new CodeGraphStructuralBackend(linkedRepository);

    const [primaryResult, linkedResult] = await Promise.all([
      primary.backend.build(),
      linkedBackend.build(),
    ]);

    expect(primaryResult.completeness).toBe("complete");
    expect(linkedResult.completeness).toBe("complete");
    expect(primaryResult.databasePath).toBe(join(await realpath(primary.fixture.directory), ".atlas", "codegraph.db"));
    expect(linkedResult.databasePath).toBe(join(await realpath(linkedWorktree), ".atlas", "codegraph.db"));
    expect(primaryResult.databasePath).not.toBe(linkedResult.databasePath);
    expect(await primary.fixture.git("status", "--porcelain", "--untracked-files=all")).toBe("");
    expect(await primary.fixture.git("-C", linkedWorktree, "status", "--porcelain", "--untracked-files=all"))
      .toBe("");
  });

  it("preserves tree-sitter, SCIP, heuristic, and unsupported relation support", async () => {
    const { backend } = await createStructuralFixture(fixtures);
    const built = await backend.build();
    const caller = (await backend.search({ query: "caller", limit: 5 }))[0]?.node;
    if (caller === undefined) {
      throw new Error("Expected caller symbol");
    }

    const database = new DatabaseSync(built.databasePath);
    const updateCallProvenance = database.prepare(`
      UPDATE edges SET provenance = ? WHERE kind = 'calls'
    `);
    try {
      for (const [provenance, status] of [
        ["tree-sitter", "exact"],
        ["scip", "exact"],
        ["heuristic", "inferred"],
      ] as const) {
        updateCallProvenance.run(provenance);
        await expect(backend.getCallees({ id: caller.reference.id })).resolves.toEqual([
          expect.objectContaining({
            relation: expect.objectContaining({
              support: { status, provenance },
            }),
          }),
        ]);
      }

      database.prepare("UPDATE edges SET provenance = 'heuristic' WHERE kind = 'imports'").run();
      await expect(backend.getFileDependencies("src/entry.ts")).resolves.toEqual([
        {
          path: "src/dep.ts",
          support: { status: "inferred", provenance: "heuristic" },
        },
      ]);

      database.prepare("UPDATE edges SET kind = 'type_of' WHERE kind = 'calls'").run();
    } finally {
      database.close();
    }

    await expect(backend.traverse({
      reference: { id: caller.reference.id },
      maxDepth: 1,
      direction: "outgoing",
    })).resolves.toMatchObject({
      boundaries: [expect.objectContaining({
        operation: "relation",
        support: { status: "unsupported", provenance: "heuristic" },
      })],
    });
  });

  it("returns an incomplete projection when the SDK cannot open the index", async () => {
    const { backend, fixture } = await createStructuralFixture(fixtures);
    const atlasDirectory = join(fixture.directory, ".atlas");
    await mkdir(atlasDirectory);
    await writeFile(join(atlasDirectory, ".gitignore"), "*\n");
    await writeFile(join(atlasDirectory, "codegraph.db"), "not a sqlite database\n");

    await expect(backend.build()).resolves.toMatchObject({
      completeness: "incomplete",
      mode: "full",
      diagnostics: [expect.objectContaining({ code: "STRUCTURAL_BACKEND_FAILURE" })],
    });
    await expect(backend.inspect()).resolves.toMatchObject({
      completeness: "incomplete",
      diagnostics: [expect.objectContaining({ code: "STRUCTURAL_BACKEND_FAILURE" })],
    });
  });

  it("contains directory failures as an incomplete projection without writing elsewhere", async () => {
    const { backend, fixture } = await createStructuralFixture(fixtures);
    await writeFile(join(fixture.directory, ".atlas"), "not a directory\n");

    await expect(backend.build()).resolves.toMatchObject({
      completeness: "incomplete",
      diagnostics: [expect.objectContaining({ code: "STRUCTURAL_BACKEND_FAILURE" })],
    });
    await expect(stat(join(fixture.directory, ".codegraph"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects an Atlas directory symlink before the SDK can write outside the worktree", async () => {
    const { backend, fixture } = await createStructuralFixture(fixtures);
    const outsideDirectory = await mkdtemp(join(tmpdir(), "semantic-atlas-outside-"));
    linkedWorktrees.push(outsideDirectory);
    await symlink(outsideDirectory, join(fixture.directory, ".atlas"));

    await expect(backend.build()).resolves.toMatchObject({
      completeness: "incomplete",
      diagnostics: [expect.objectContaining({ code: "STRUCTURAL_BACKEND_FAILURE" })],
    });
    await expect(stat(join(outsideDirectory, "codegraph.db"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a tracked .atlas/.gitignore even when its content matches", async () => {
    const { backend, fixture } = await createStructuralFixture(fixtures);
    const atlasDirectory = join(fixture.directory, ".atlas");
    const ignorePath = join(atlasDirectory, ".gitignore");
    await mkdir(atlasDirectory);
    await writeFile(ignorePath, "*\n");
    await fixture.git("add", "-f", ".atlas/.gitignore");
    await fixture.git("commit", "-m", "test: preserve repository atlas ignore");

    await expect(backend.build()).resolves.toMatchObject({
      completeness: "incomplete",
      diagnostics: [expect.objectContaining({ code: "STRUCTURAL_BACKEND_FAILURE" })],
    });
    expect(await readFile(ignorePath, "utf8")).toBe("*\n");
    await expect(stat(join(atlasDirectory, "codegraph.db"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await fixture.git("status", "--porcelain", "--untracked-files=all")).toBe("");
  });

  it("preserves an existing non-Atlas ignore file without creating generated state", async () => {
    const { backend, fixture } = await createStructuralFixture(fixtures);
    const atlasDirectory = join(fixture.directory, ".atlas");
    const ignorePath = join(atlasDirectory, ".gitignore");
    await mkdir(atlasDirectory);
    await writeFile(ignorePath, "!keep.txt\n");

    await expect(backend.build()).resolves.toMatchObject({
      completeness: "incomplete",
      diagnostics: [expect.objectContaining({ code: "STRUCTURAL_BACKEND_FAILURE" })],
    });
    expect(await readFile(ignorePath, "utf8")).toBe("!keep.txt\n");
    await expect(stat(join(atlasDirectory, "codegraph.db"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a .atlas/.gitignore symlink without writing its outside target", async () => {
    const { backend, fixture } = await createStructuralFixture(fixtures);
    const atlasDirectory = join(fixture.directory, ".atlas");
    const outsideDirectory = await mkdtemp(join(tmpdir(), "semantic-atlas-ignore-outside-"));
    linkedWorktrees.push(outsideDirectory);
    const outsideIgnore = join(outsideDirectory, "outside-ignore");
    await mkdir(atlasDirectory);
    await writeFile(outsideIgnore, "outside sentinel\n");
    await symlink(outsideIgnore, join(atlasDirectory, ".gitignore"));

    await expect(backend.build()).resolves.toMatchObject({
      completeness: "incomplete",
      diagnostics: [expect.objectContaining({ code: "STRUCTURAL_BACKEND_FAILURE" })],
    });
    expect(await readFile(outsideIgnore, "utf8")).toBe("outside sentinel\n");
    await expect(stat(join(atlasDirectory, "codegraph.db"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a structural database symlink before opening it", async () => {
    const { backend, fixture } = await createStructuralFixture(fixtures);
    const outsideDirectory = await mkdtemp(join(tmpdir(), "semantic-atlas-database-outside-"));
    linkedWorktrees.push(outsideDirectory);
    await mkdir(join(fixture.directory, ".atlas"));
    const outsideDatabase = join(outsideDirectory, "outside.db");
    await writeFile(outsideDatabase, "not a database\n");
    await symlink(outsideDatabase, join(fixture.directory, ".atlas", "codegraph.db"));

    await expect(backend.build()).resolves.toMatchObject({
      completeness: "incomplete",
      diagnostics: [expect.objectContaining({ code: "STRUCTURAL_BACKEND_FAILURE" })],
    });
    expect(await readFile(outsideDatabase, "utf8")).toBe("not a database\n");
  });

  it("rejects a database symlink introduced after indexing before serving queries", async () => {
    const { backend, fixture } = await createStructuralFixture(fixtures);
    const built = await backend.build();
    const outsideDirectory = await mkdtemp(join(tmpdir(), "semantic-atlas-query-outside-"));
    linkedWorktrees.push(outsideDirectory);
    const outsideDatabase = join(outsideDirectory, "outside.db");
    await writeFile(outsideDatabase, "not a database\n");
    await rm(built.databasePath);
    await symlink(outsideDatabase, built.databasePath);

    await expect(backend.search({ query: "target", limit: 5 })).rejects.toMatchObject({
      code: "STRUCTURAL_QUERY_FAILED",
    });
    expect(await readFile(outsideDatabase, "utf8")).toBe("not a database\n");
  });
});

async function createStructuralFixture(fixtures: GitFixture[]): Promise<StructuralFixture> {
  const fixture = await createGitFixture();
  fixtures.push(fixture);
  await fixture.write("src/dep.ts", "export function target(value: number) { return value + 1; }\n");
  await fixture.write("src/entry.ts", [
    "import { target } from './dep.js';",
    "export function caller() { return target(1); }",
    "export function dynamic(name: string) { return globalThis[name]?.(); }",
    "",
  ].join("\n"));
  await fixture.git("add", ".");
  await fixture.git("commit", "-m", "test: add structural fixture");
  const repository = await inspectGitRepository(fixture.directory);
  return { fixture, backend: new CodeGraphStructuralBackend(repository) };
}

async function runBuiltCodeGraphWorker(
  repository: Awaited<ReturnType<typeof inspectGitRepository>>,
  operation: "build" | "sync",
): Promise<StructuralBuildResult> {
  const projectRoot = join(import.meta.dirname, "..", "..");
  await executeFile("pnpm", ["build"], { cwd: projectRoot });
  const clientModule = pathToFileURL(join(
    projectRoot,
    "dist",
    "structural-backend",
    "codegraph-worker-client.js",
  )).href;
  const encodedRepository = Buffer.from(JSON.stringify(repository), "utf8").toString("base64url");
  const script = [
    `const { runCodeGraphWorker } = await import(${JSON.stringify(clientModule)});`,
    "const repository = JSON.parse(Buffer.from(process.argv[1], 'base64url').toString('utf8'));",
    `const result = await runCodeGraphWorker({ operation: ${JSON.stringify(operation)}, repository });`,
    "process.stdout.write(JSON.stringify(result));",
  ].join(" ");
  const { stdout } = await executeFile(process.execPath, [
    "--input-type=module",
    "--disable-warning=ExperimentalWarning",
    "-e",
    script,
    encodedRepository,
  ], {
    cwd: projectRoot,
    encoding: "utf8",
  });
  return JSON.parse(stdout) as StructuralBuildResult;
}

async function startBuiltStructuralSync(
  repository: Awaited<ReturnType<typeof inspectGitRepository>>,
  privateWorker: boolean,
): Promise<ChildProcess> {
  const projectRoot = join(import.meta.dirname, "..", "..");
  const encodedRepository = Buffer.from(JSON.stringify(repository), "utf8").toString("base64url");
  const modulePath = pathToFileURL(join(
    projectRoot,
    "dist",
    "structural-backend",
    privateWorker ? "codegraph-worker-client.js" : "codegraph-backend.js",
  )).href;
  const script = privateWorker
    ? [
        `const { runCodeGraphWorker } = await import(${JSON.stringify(modulePath)});`,
        "const repository = JSON.parse(Buffer.from(process.argv[1], 'base64url').toString('utf8'));",
        "await runCodeGraphWorker({ operation: 'sync', repository });",
      ].join(" ")
    : [
        `const { CodeGraphStructuralBackend } = await import(${JSON.stringify(modulePath)});`,
        "const repository = JSON.parse(Buffer.from(process.argv[1], 'base64url').toString('utf8'));",
        "await new CodeGraphStructuralBackend(repository).sync();",
      ].join(" ");

  return spawn(process.execPath, [
    "--input-type=module",
    "--disable-warning=ExperimentalWarning",
    "-e",
    script,
    encodedRepository,
  ], {
    cwd: projectRoot,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function runBuiltPrivateWorkerRequest<T>(
  repository: Awaited<ReturnType<typeof inspectGitRepository>>,
  request: { readonly operation: string; readonly input?: unknown },
): Promise<T> {
  const clientModule = pathToFileURL(join(
    import.meta.dirname,
    "..",
    "..",
    "dist",
    "structural-backend",
    "codegraph-worker-client.js",
  )).href;
  const client = await import(clientModule) as {
    runCodeGraphWorker(request: unknown): Promise<T>;
  };
  return client.runCodeGraphWorker({ ...request, repository });
}

async function createBuiltStructuralBackend(
  repository: Awaited<ReturnType<typeof inspectGitRepository>>,
): Promise<StructuralIndexBackend> {
  const backendModule = pathToFileURL(join(
    import.meta.dirname,
    "..",
    "..",
    "dist",
    "structural-backend",
    "codegraph-backend.js",
  )).href;
  const module = await import(backendModule) as {
    CodeGraphStructuralBackend: new (
      repository: Awaited<ReturnType<typeof inspectGitRepository>>,
    ) => StructuralIndexBackend;
  };
  return new module.CodeGraphStructuralBackend(repository);
}

interface ProcessInstanceFixture {
  readonly child: ChildProcess & { readonly pid: number };
  readonly instanceId: string;
  readonly processStartInstanceId: string;
}

async function startBuiltProcessInstanceHolder(): Promise<ProcessInstanceFixture> {
  const projectRoot = join(import.meta.dirname, "..", "..");
  const modulePath = pathToFileURL(join(
    projectRoot,
    "dist",
    "structural-backend",
    "process-instance.js",
  )).href;
  const child = spawn(process.execPath, [
    "--input-type=module",
    "-e",
    [
      "const { createHash } = await import('node:crypto');",
      "const { execFileSync } = await import('node:child_process');",
      `const { currentProcessInstanceId } = await import(${JSON.stringify(modulePath)});`,
      "const startedAt = process.platform === 'darwin' ? execFileSync('ps', ['-p', String(process.pid), '-o', 'lstart='], { encoding: 'utf8', env: { ...process.env, LANG: 'C', LC_ALL: 'C', TZ: 'UTC' } }).trim() : '';",
      "const processStartInstanceId = startedAt === '' ? '' : createHash('sha256').update(`darwin:${startedAt}`).digest('hex');",
      "process.stdout.write(JSON.stringify({ instanceId: currentProcessInstanceId(), processStartInstanceId }) + '\\n');",
      "process.stdin.resume();",
      "process.stdin.once('end', () => process.exit(0));",
    ].join(" "),
  ], {
    cwd: projectRoot,
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (child.pid === undefined) {
    throw new Error("Expected the process-instance fixture to start");
  }
  const instance = JSON.parse(await readFirstChildOutputLine(child)) as {
    readonly instanceId: string;
    readonly processStartInstanceId: string;
  };
  return { child: child as ChildProcess & { readonly pid: number }, ...instance };
}

async function inspectBuiltProcessInstance(): Promise<{
  readonly instanceId: string;
  readonly startedAt: string;
}> {
  const projectRoot = join(import.meta.dirname, "..", "..");
  const modulePath = pathToFileURL(join(
    projectRoot,
    "dist",
    "structural-backend",
    "process-instance.js",
  )).href;
  const script = [
    "const { execFileSync } = await import('node:child_process');",
    `const { currentProcessInstanceId } = await import(${JSON.stringify(modulePath)});`,
    "const startedAt = execFileSync('ps', ['-p', String(process.pid), '-o', 'lstart='], { encoding: 'utf8', env: { ...process.env, LANG: 'C', LC_ALL: 'C', TZ: 'UTC' } }).trim();",
    "process.stdout.write(JSON.stringify({ instanceId: currentProcessInstanceId(), startedAt }));",
  ].join(" ");
  const { stdout } = await executeFile(process.execPath, [
    "--input-type=module",
    "-e",
    script,
  ], { cwd: projectRoot, encoding: "utf8" });
  return JSON.parse(stdout) as { readonly instanceId: string; readonly startedAt: string };
}

async function waitForEarlyWallClockSecond(): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline && Date.now() % 1_000 > 250) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

async function readFirstChildOutputLine(child: ChildProcess): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let output = "";
    child.once("error", reject);
    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
      const lineEnd = output.indexOf("\n");
      if (lineEnd !== -1) {
        resolve(output.slice(0, lineEnd));
      }
    });
    child.once("exit", (code) => {
      reject(new Error(
        `Process-instance fixture exited ${code}: ${child.stderr?.read()?.toString("utf8") ?? ""}`,
      ));
    });
  });
}

async function executeBuiltBackendRequest<T>(
  backend: StructuralIndexBackend,
  operation: string,
  input?: unknown,
): Promise<T> {
  switch (operation) {
    case "build": return backend.build() as Promise<T>;
    case "sync": return backend.sync() as Promise<T>;
    case "inspect": return backend.inspect() as Promise<T>;
    case "search": return backend.search(input as Parameters<StructuralIndexBackend["search"]>[0]) as Promise<T>;
    default: throw new Error(`Unsupported built backend fixture operation: ${operation}`);
  }
}

interface LockContender {
  readonly child: ChildProcess;
  output: string;
  stderr: string;
}

function startBuiltLockContender(
  lockPath: string,
  privateWorker: boolean,
  pauseBeforeReclaim: boolean,
): LockContender {
  const projectRoot = join(import.meta.dirname, "..", "..");
  const lockModule = pathToFileURL(join(
    projectRoot,
    "dist",
    "structural-backend",
    "structural-write-lock.js",
  )).href;
  const script = [
    "const { createRequire, syncBuiltinESMExports } = await import('node:module');",
    "const require = createRequire(import.meta.url);",
    "const fs = require('node:fs');",
    "const lockPath = process.argv[1];",
    "const pauseBeforeReclaim = process.argv[2] === 'pause';",
    "const originalUnlinkSync = fs.unlinkSync;",
    "let paused = false;",
    "fs.unlinkSync = (path) => {",
    "  if (pauseBeforeReclaim && !paused && path === lockPath) {",
    "    paused = true;",
    "    process.stdout.write('reclaiming\\n');",
    "    process.kill(process.pid, 'SIGSTOP');",
    "  }",
    "  return originalUnlinkSync(path);",
    "};",
    "syncBuiltinESMExports();",
    `const { StructuralWriteLock } = await import(${JSON.stringify(lockModule)});`,
    "const lock = StructuralWriteLock.acquire(lockPath);",
    "if (lock === undefined) { process.stdout.write('unavailable\\n'); process.exit(0); }",
    "process.stdout.write('acquired\\n');",
    "process.stdin.resume();",
    "process.stdin.once('end', () => { lock.release(); process.exit(0); });",
  ].join(" ");
  const runtime = privateWorker ? bundledCodeGraphRuntime() : process.execPath;
  const runtimeOptions = privateWorker ? ["--liftoff-only"] : [];
  const child = spawn(runtime, [
    ...runtimeOptions,
    "--input-type=module",
    "--disable-warning=ExperimentalWarning",
    "-e",
    script,
    lockPath,
    pauseBeforeReclaim ? "pause" : "continue",
  ], {
    cwd: projectRoot,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const contender: LockContender = { child, output: "", stderr: "" };
  child.stdout?.on("data", (chunk: Buffer) => {
    contender.output += chunk.toString("utf8");
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    contender.stderr += chunk.toString("utf8");
  });
  return contender;
}

function bundledCodeGraphRuntime(): string {
  const require = createRequire(import.meta.url);
  const codeGraphPackage = require.resolve("@colbymchenry/codegraph/package.json");
  const codeGraphRequire = createRequire(codeGraphPackage);
  const platformPackageName = `@colbymchenry/codegraph-${process.platform}-${process.arch}`;
  const platformPackage = codeGraphRequire.resolve(`${platformPackageName}/package.json`);
  return join(dirname(platformPackage), process.platform === "win32" ? "node.exe" : "node");
}

async function waitForContenderOutput(
  contender: LockContender,
  expected: "reclaiming" | "acquired" | "unavailable",
): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (contender.output.includes(`${expected}\n`)) {
      return;
    }
    if (contender.child.exitCode !== null || contender.child.signalCode !== null) {
      throw new Error(
        `Lock contender exited before ${expected}: ${contender.stderr || contender.output || "no output"}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error(`Timed out waiting for lock contender ${expected}: ${contender.stderr || contender.output}`);
}

async function waitForContenderOutcome(contender: LockContender): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (contender.output.includes("acquired\n") || contender.output.includes("unavailable\n")) {
      return;
    }
    if (contender.child.exitCode !== null || contender.child.signalCode !== null) {
      throw new Error(
        `Lock contender exited before reporting its outcome: ${contender.stderr || contender.output || "no output"}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error(`Timed out waiting for lock contender outcome: ${contender.stderr || contender.output}`);
}

async function finishLockContender(contender: LockContender): Promise<void> {
  if (contender.child.pid !== undefined && contender.child.exitCode === null && contender.child.signalCode === null) {
    contender.child.kill("SIGCONT");
    contender.child.stdin?.end();
  }
  await waitForProcessExit(contender.child);
}

async function crashAtlasLockDuringOwnershipPublication(worktreeRoot: string): Promise<void> {
  const projectRoot = join(import.meta.dirname, "..", "..");
  const lockPath = join(worktreeRoot, ".atlas", "semantic-atlas.lock");
  const lockModule = pathToFileURL(join(
    projectRoot,
    "dist",
    "structural-backend",
    "structural-write-lock.js",
  )).href;
  const script = [
    "const { createRequire, syncBuiltinESMExports } = await import('node:module');",
    "const require = createRequire(import.meta.url);",
    "const fs = require('node:fs');",
    "const originalOpenSync = fs.openSync;",
    "fs.openSync = (path, flags, mode) => {",
    "  if (typeof path === 'string' && path.startsWith(process.argv[1])) {",
    "    const descriptor = originalOpenSync(path, flags, mode);",
    "    fs.writeSync(1, 'writing\\n');",
    "    process.kill(process.pid, 'SIGSTOP');",
    "    return descriptor;",
    "  }",
    "  return originalOpenSync(path, flags, mode);",
    "};",
    "syncBuiltinESMExports();",
    `const { StructuralWriteLock } = await import(${JSON.stringify(lockModule)});`,
    "const lock = StructuralWriteLock.acquire(process.argv[1]);",
    "if (lock === undefined) throw new Error('Expected to acquire the Atlas write lock');",
    "process.stdout.write('locked\\n');",
    "process.stdin.resume();",
  ].join(" ");
  const child = spawn(process.execPath, [
    "--input-type=module",
    "--disable-warning=ExperimentalWarning",
    "-e",
    script,
    lockPath,
  ], {
    cwd: projectRoot,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let writing = false;
  child.stdout.on("data", (chunk: Buffer) => {
    writing ||= chunk.toString("utf8").includes("writing");
  });

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Atlas lock crash fixture exited early: ${readChildStderr(child)}`);
    }
    if (writing) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  if (!writing) {
    throw new Error("Timed out waiting for Atlas lock ownership publication");
  }

  child.kill("SIGKILL");
  await waitForProcessExit(child);
}

function largeReplacementSource(): string {
  return `${Array.from(
    { length: 30_000 },
    (_, index) => `export const r${index}=${index};`,
  ).join("\n")}\n`;
}

async function waitForPartiallyWrittenSync(
  databasePath: string,
  child: ChildProcess,
): Promise<void> {
  const atlasLockPath = join(dirname(databasePath), "semantic-atlas.lock");
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Structural sync exited before the partial-write window: ${readChildStderr(child)}`);
    }
    try {
      await stat(atlasLockPath);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1));
      continue;
    }

    signalProcessGroup(child, "SIGSTOP");
    await new Promise((resolve) => setTimeout(resolve, 2));
    try {
      const database = new DatabaseSync(databasePath, { readOnly: true });
      try {
        const publishedCount = database.prepare(
          "SELECT COUNT(*) AS count FROM nodes WHERE name = 'target'",
        ).get() as { count: number };
        const replacementCount = database.prepare(
          "SELECT COUNT(*) AS count FROM nodes WHERE name = 'r29999'",
        ).get() as { count: number };
        if (publishedCount.count === 0 && replacementCount.count === 0) {
          return;
        }
      } finally {
        database.close();
      }
    } catch {
      // The writer can briefly hold a schema or checkpoint lock between observable states.
    }
    signalProcessGroup(child, "SIGCONT");
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error(`Timed out waiting for a partial structural sync: ${readChildStderr(child)}`);
}

function signalProcessGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) {
      throw error;
    }
  }
}

async function waitForProcessExit(child: ChildProcess): Promise<void> {
  if (child.exitCode === null && child.signalCode === null) {
    await once(child, "exit");
  }
}

function readChildStderr(child: ChildProcess): string {
  return child.stderr?.read()?.toString("utf8") ?? "no stderr";
}

async function waitForStructuralWriterExit(databasePath: string): Promise<void> {
  const lockPath = join(dirname(databasePath), "semantic-atlas.lock");
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const lock = JSON.parse(await readFile(lockPath, "utf8")) as { pid?: unknown };
      if (typeof lock.pid === "number") {
        try {
          process.kill(lock.pid, 0);
        } catch (error) {
          if (error instanceof Error && "code" in error && error.code === "ESRCH") {
            return;
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for the interrupted structural writer to exit");
}

async function withHeldCodeGraphLock<T>(
  worktreeRoot: string,
  operation: () => Promise<T>,
): Promise<T> {
  const lockPath = join(worktreeRoot, ".atlas", "codegraph.lock");
  const holder = spawn(process.execPath, [
    "-e",
    [
      "const { FileLock } = require('@colbymchenry/codegraph');",
      "const lock = new FileLock(process.argv[1]);",
      "lock.acquire();",
      "process.stdout.write('locked\\n');",
      "process.stdin.resume();",
      "process.stdin.once('end', () => { lock.release(); process.exit(0); });",
    ].join(" "),
    lockPath,
  ], {
    cwd: import.meta.dirname,
    stdio: ["pipe", "pipe", "pipe"],
  });

  await new Promise<void>((resolve, reject) => {
    holder.once("error", reject);
    holder.stdout.once("data", (chunk: Buffer) => {
      if (chunk.toString("utf8").includes("locked")) {
        resolve();
      } else {
        reject(new Error(`Unexpected lock-holder output: ${chunk.toString("utf8")}`));
      }
    });
    holder.once("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`Lock-holder process exited ${code}: ${holder.stderr.read()?.toString("utf8") ?? ""}`));
      }
    });
  });

  try {
    return await operation();
  } finally {
    holder.stdin.end();
    await new Promise<void>((resolve) => holder.once("exit", () => resolve()));
  }
}

async function withHeldAtlasWriteLock<T>(
  worktreeRoot: string,
  operation: (lockContent: string) => Promise<T>,
): Promise<T> {
  const lockPath = join(worktreeRoot, ".atlas", "semantic-atlas.lock");
  const holder = spawn(process.execPath, [
    "-e",
    [
      "const { randomUUID } = require('node:crypto');",
      "const fs = require('node:fs');",
      "const path = process.argv[1];",
      "const content = JSON.stringify({ pid: process.pid, token: randomUUID() }) + '\\n';",
      "fs.writeFileSync(path, content, { flag: 'wx', mode: 0o600 });",
      "const stale = new Date(Date.now() - 180_000);",
      "fs.utimesSync(path, stale, stale);",
      "process.stdout.write(Buffer.from(content).toString('base64url') + '\\n');",
      "process.stdin.resume();",
      "process.stdin.once('end', () => {",
      "  try { if (fs.readFileSync(path, 'utf8') === content) fs.unlinkSync(path); } catch {}",
      "  process.exit(0);",
      "});",
    ].join(" "),
    lockPath,
  ], {
    cwd: import.meta.dirname,
    stdio: ["pipe", "pipe", "pipe"],
  });

  const lockContent = await new Promise<string>((resolve, reject) => {
    holder.once("error", reject);
    holder.stdout.once("data", (chunk: Buffer) => {
      try {
        resolve(Buffer.from(chunk.toString("utf8").trim(), "base64url").toString("utf8"));
      } catch (error) {
        reject(error);
      }
    });
    holder.once("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`Atlas lock-holder process exited ${code}: ${holder.stderr.read()?.toString("utf8") ?? ""}`));
      }
    });
  });

  try {
    return await operation(lockContent);
  } finally {
    holder.stdin.end();
    await new Promise<void>((resolve) => holder.once("exit", () => resolve()));
  }
}

async function exitedProcessId(): Promise<number> {
  const child = spawn(process.execPath, ["-e", "process.stdout.write(String(process.pid))"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const chunks: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
  await new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`PID fixture process exited ${code}: ${child.stderr.read()?.toString("utf8") ?? ""}`));
      }
    });
  });
  return Number.parseInt(Buffer.concat(chunks).toString("utf8"), 10);
}

async function expectFailedSyncToPreservePublishedDatabase(
  backend: CodeGraphStructuralBackend,
  databasePath: string,
  published: NonNullable<Awaited<ReturnType<CodeGraphStructuralBackend["getNode"]>>>,
  result: StructuralBuildResult,
): Promise<void> {
  expect(result).toMatchObject({
    completeness: "incomplete",
    mode: "incremental",
    diagnostics: [expect.objectContaining({
      message: expect.stringMatching(/forced .*structural sync failure/iu),
    })],
  });
  await expect(backend.inspect()).resolves.toMatchObject({ completeness: "complete" });
  await expect(backend.getNode(published.reference)).resolves.toEqual(published);
  await expect(backend.search({ query: "target", limit: 5 })).resolves.toEqual(expect.arrayContaining([
    expect.objectContaining({ node: expect.objectContaining({ reference: published.reference }) }),
  ]));
  await expect(backend.search({ query: "addedDuringFailed", limit: 5 })).resolves.toEqual([]);

  const restored = new DatabaseSync(databasePath, { readOnly: true });
  try {
    expect(restored.prepare("SELECT business_key FROM atlas_fixture_knowledge").get())
      .toEqual({ business_key: "orders/place-order" });
  } finally {
    restored.close();
  }
  await expectStructuralBackupsCleaned(databasePath, true);
}

async function expectStructuralBackupsCleaned(
  path: string,
  pathIsDatabase = false,
): Promise<void> {
  const atlasDirectory = pathIsDatabase ? dirname(path) : join(path, ".atlas");
  expect(await readdir(atlasDirectory)).not.toEqual(expect.arrayContaining([
    expect.stringMatching(/^\.structural-publication/u),
  ]));
}

async function expectStructuralPublicationStateCleaned(databasePath: string): Promise<void> {
  const atlasDirectory = dirname(databasePath);
  expect(await readdir(atlasDirectory)).not.toEqual(expect.arrayContaining([
    expect.stringMatching(/^\.structural-(?:backup|publication)/u),
    expect.stringMatching(/^semantic-atlas\.lock\.owner-/u),
    "semantic-atlas.lock",
    "codegraph.lock",
  ]));
}
