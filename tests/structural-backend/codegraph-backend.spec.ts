import { DatabaseSync } from "node:sqlite";
import { execFile, spawn } from "node:child_process";
import {
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
import { afterEach, describe, expect, it } from "vitest";

import * as publicApi from "../../src/index.js";
import { CodeGraphStructuralBackend } from "../../src/structural-backend/codegraph-backend.js";
import { inspectGitRepository } from "../../src/repository/repository-inspector.js";
import { StructuralWriteLock } from "../../src/structural-backend/structural-write-lock.js";
import type { StructuralBuildResult } from "../../src/structural-backend/types.js";
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
      expect(await readFile(join(fixture.directory, ".atlas", ".gitignore"), "utf8"))
        .toBe("*\n");
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
    } finally {
      if (originalDirectory === undefined) {
        delete process.env.CODEGRAPH_DIR;
      } else {
        process.env.CODEGRAPH_DIR = originalDirectory;
      }
    }
    expect(process.env.CODEGRAPH_DIR).toBe(originalDirectory);
  });

  it("publishes no destructive, watcher, CLI, MCP, or backend-specific capability", async () => {
    const { backend } = await createStructuralFixture(fixtures);
    for (const forbidden of ["recreate", "uninitialize", "clear", "watch", "unwatch", "MCPServer", "cli"]) {
      expect(forbidden in (backend as unknown as object)).toBe(false);
    }

    const packageDocument = JSON.parse(await readFile(join(import.meta.dirname, "..", "..", "package.json"), "utf8")) as {
      readonly engines: { readonly node: string };
      readonly dependencies: Record<string, string>;
      readonly bin?: unknown;
    };
    expect(packageDocument.dependencies["@colbymchenry/codegraph"]).toBe("1.5.0");
    expect(packageDocument.engines.node).toBe(">=22.12.0 <25");
    expect(packageDocument.bin).toBeUndefined();
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
      changes: { added: [], modified: ["src/entry.ts"], removed: [] },
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
      changes: { added: [], modified: ["src/entry.ts"], removed: [] },
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
    expect.stringMatching(/^\.structural-backup-/u),
  ]));
}
