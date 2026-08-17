import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

import { GraphStore } from "../../src/graph/graph-store.js";
import { inspectGitRepository } from "../../src/repository/repository-inspector.js";
import type { GitRepository } from "../../src/repository/types.js";
import { createRepositorySnapshot } from "../../src/snapshots/repository-snapshot.js";
import { CodeGraphStructuralBackend } from "../../src/structural-backend/codegraph-backend.js";
import {
  WorldModelService,
  worldPublicationMismatch,
} from "../../src/world/world-model-service.js";
import { createGitFixture, type GitFixture } from "../support/git-fixture.js";

const executeFile = promisify(execFile);

describe("world model publication", () => {
  const fixtures: GitFixture[] = [];

  afterEach(async () => {
    await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
  });

  it("publishes the repository and structural projection as one current world snapshot", async () => {
    const fixture = await createGitFixture();
    fixtures.push(fixture);
    const repository = await inspectGitRepository(fixture.directory);
    const world = new WorldModelService(repository);

    const initial = await world.build();
    expect(initial).toMatchObject({
      snapshotId: expect.stringMatching(/^[0-9a-f]{64}$/u),
      structural: { completeness: "complete", mode: "initial" },
      staleAssertions: [],
    });
    expect(world.state()).toMatchObject({
      status: "current",
      currentSnapshotId: initial.snapshotId,
      targetSnapshotId: null,
      backendVersion: "1.5.0",
    });
    expect(world.currentSnapshotId()).toBe(initial.snapshotId);

    await fixture.write("src/example.ts", "export const value = 2;\n");
    const changed = await world.sync();
    expect(changed).toMatchObject({
      structural: {
        completeness: "complete",
        mode: "incremental",
        changes: { added: [], modified: ["src/example.ts"], removed: [] },
      },
    });
    expect(changed.snapshotId).not.toBe(initial.snapshotId);
    expect(world.currentSnapshotId()).toBe(changed.snapshotId);

    using graph = new GraphStore(repository);
    expect(graph.databasePath).not.toBe(changed.structural.databasePath);
    using database = new DatabaseSync(graph.databasePath, { readOnly: true });
    expect(database.prepare(`
      SELECT
        previous.snapshot_id AS from_snapshot_id,
        publication.snapshot_id AS to_snapshot_id,
        publication.modified_paths
      FROM atlas_world_publications AS publication
      LEFT JOIN atlas_world_publications AS previous
        ON previous.publication_id = publication.previous_publication_id
      WHERE publication.snapshot_id = ?
      ORDER BY publication.publication_id DESC
      LIMIT 1
    `).get(changed.snapshotId)).toEqual({
      from_snapshot_id: initial.snapshotId,
      to_snapshot_id: changed.snapshotId,
      modified_paths: '["src/example.ts"]',
    });
    expect(await fixture.git("status", "--porcelain", "--untracked-files=all"))
      .toBe("M src/example.ts");
  });

  it("publishes when the backend records files outside the Atlas source projection", async () => {
    const fixture = await createGitFixture();
    fixtures.push(fixture);
    await fixture.write("pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
    await fixture.git("add", "pnpm-lock.yaml");
    await fixture.git("commit", "-m", "test: add package lockfile");
    const repository = await inspectGitRepository(fixture.directory);

    const publication = await new WorldModelService(repository).build();

    expect(publication.structural).toMatchObject({
      completeness: "complete",
      mode: "initial",
    });
    expect(await fixture.git("status", "--porcelain", "--untracked-files=all")).toBe("");
  });

  it("keeps a committed structural projection fail closed when central publication fails", async () => {
    const fixture = await createGitFixture();
    fixtures.push(fixture);
    const repository = await inspectGitRepository(fixture.directory);
    const world = new WorldModelService(repository);
    const initial = await world.build();
    using graph = new GraphStore(repository);
    const databasePath = graph.databasePath;
    const database = new DatabaseSync(databasePath);
    try {
      database.exec(`
        CREATE TRIGGER atlas_fixture_reconciliation_failure
        BEFORE UPDATE OF status ON atlas_worktree_states
        WHEN NEW.status = 'current'
        BEGIN
          SELECT RAISE(ABORT, 'forced world reconciliation failure');
        END;
      `);
    } finally {
      database.close();
    }
    await fixture.write("src/example.ts", "export const value = 2;\n");

    await expect(world.sync()).rejects.toThrow(/forced world reconciliation failure/iu);
    expect(world.state()).toMatchObject({
      status: "failed",
      currentSnapshotId: initial.snapshotId,
      failureMessage: expect.stringMatching(/forced world reconciliation failure/iu),
    });
    await expect(new CodeGraphStructuralBackend(repository).inspect()).resolves.toMatchObject({
      completeness: "complete",
    });
    using failedDatabase = new DatabaseSync(databasePath);
    expect(failedDatabase.prepare(`
      SELECT COUNT(*) AS count
      FROM atlas_world_publications
    `).get()).toEqual({ count: 1 });
    failedDatabase.exec("DROP TRIGGER atlas_fixture_reconciliation_failure");

    const recovered = await world.sync();
    expect(recovered.structural).toMatchObject({
      completeness: "complete",
      mode: "incremental",
    });
    expect(world.state()).toMatchObject({
      status: "current",
      currentSnapshotId: recovered.snapshotId,
      failureMessage: null,
    });
    expect(failedDatabase.prepare(`
      SELECT COUNT(*) AS count
      FROM atlas_world_publications
    `).get()).toEqual({ count: 2 });
  });

  it("appends a publication when a later sync publishes the same snapshot", async () => {
    const fixture = await createGitFixture();
    fixtures.push(fixture);
    const repository = await inspectGitRepository(fixture.directory);
    const world = new WorldModelService(repository);
    const initial = await world.build();
    await fixture.write("src/example.ts", "export const value = 2;\n");
    const changed = await world.sync();

    const unchanged = await world.sync();

    expect(unchanged.snapshotId).toBe(changed.snapshotId);
    using graph = new GraphStore(repository);
    using database = new DatabaseSync(graph.databasePath, { readOnly: true });
    expect(database.prepare(`
      SELECT previous.snapshot_id AS from_snapshot_id, publication.modified_paths
      FROM atlas_world_publications AS publication
      LEFT JOIN atlas_world_publications AS previous
        ON previous.publication_id = publication.previous_publication_id
      WHERE publication.snapshot_id = ?
      ORDER BY publication.publication_id
    `).all(changed.snapshotId)).toEqual([
      { from_snapshot_id: initial.snapshotId, modified_paths: '["src/example.ts"]' },
      { from_snapshot_id: changed.snapshotId, modified_paths: '[]' },
    ]);
  });

  it("detects indexed-source ABA when the repository returns to the captured snapshot", async () => {
    const fixture = await createGitFixture();
    fixtures.push(fixture);
    const repository = await inspectGitRepository(fixture.directory);
    const captured = await createRepositorySnapshot(repository);
    const transientContents = "export const transientValue = true;\n";

    await fixture.write("src/example.ts", transientContents);
    await fixture.write("src/example.ts", "export const value = 1;\n");
    const restored = await createRepositorySnapshot(repository);

    expect(restored.snapshotId).toBe(captured.snapshotId);
    expect(worldPublicationMismatch(captured, restored, [{
      path: "src/example.ts",
      contentHash: createHash("sha256").update(transientContents).digest("hex"),
    }])).toMatch(/indexed source src\/example\.ts/iu);
    expect(worldPublicationMismatch(captured, restored, [])).toMatch(
      /snapshot source src\/example\.ts is missing/iu,
    );
  });

  it.each([
    ["in-process SDK", false],
    ["private SDK worker", true],
  ] as const)(
    "rejects a mixed world when source changes during %s publication",
    async (_runtime, privateWorker) => {
      const fixture = await createGitFixture();
      fixtures.push(fixture);
      const repository = await inspectGitRepository(fixture.directory);
      const world = new WorldModelService(repository);
      const initial = await world.build();
      await fixture.write("src/example.ts", largeSource("indexedCandidate", privateWorker));
      if (privateWorker) {
        await executeFile("pnpm", ["build"], { cwd: projectRoot() });
      }

      const synchronization = privateWorker
        ? runBuiltPrivateWorldSync(repository)
        : world.sync();
      void synchronization.catch(() => undefined);
      const rewrite = rewriteDuringStructuralPublication(
        initial.structural.databasePath,
        fixture,
        "export const changedDuringPublication = true;\n",
      );

      await rewrite;
      await expect(synchronization).rejects.toThrow(/repository changed during world publication/iu);
      expect(world.state()).toMatchObject({
        status: "failed",
        currentSnapshotId: initial.snapshotId,
      });
      expect((await createRepositorySnapshot(repository)).snapshotId).not.toBe(initial.snapshotId);
      const backend = new CodeGraphStructuralBackend(repository);
      await expect(backend.search({ query: "value", limit: 5 })).resolves.toEqual(
        expect.arrayContaining([expect.objectContaining({
          node: expect.objectContaining({ name: "value" }),
        })]),
      );
      await expect(backend.search({ query: "changedDuringPublication", limit: 5 }))
        .resolves.toEqual([]);
    },
    60_000,
  );
});

function projectRoot(): string {
  return join(import.meta.dirname, "..", "..");
}

async function runBuiltPrivateWorldSync(repository: GitRepository): Promise<unknown> {
  const clientModule = pathToFileURL(join(
    projectRoot(),
    "dist",
    "structural-backend",
    "codegraph-worker-client.js",
  )).href;
  const client = await import(clientModule) as {
    runCodeGraphWorker(request: unknown): Promise<unknown>;
  };
  return client.runCodeGraphWorker({ operation: "worldSync", repository });
}

async function rewriteDuringStructuralPublication(
  databasePath: string,
  fixture: GitFixture,
  contents: string,
): Promise<void> {
  const publicationDirectory = join(dirname(databasePath), ".structural-publication");
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      if ((await stat(publicationDirectory)).isDirectory()) {
        await fixture.write("src/example.ts", contents);
        return;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error("Timed out waiting for active structural publication");
}

function largeSource(symbol: string, privateWorker: boolean): string {
  const count = privateWorker ? 80_000 : 30_000;
  return `${Array.from(
    { length: count },
    (_, index) => `export const ${symbol}${index} = ${index};`,
  ).join("\n")}\n`;
}
