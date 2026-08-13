import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { GraphStore } from "../../src/graph/graph-store.js";
import { inspectGitRepository } from "../../src/repository/repository-inspector.js";
import { WorldModelService } from "../../src/world/world-model-service.js";
import { createGitFixture, type GitFixture } from "../support/git-fixture.js";

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
    expect(graph.databasePath).toBe(changed.structural.databasePath);
    using database = new DatabaseSync(graph.databasePath, { readOnly: true });
    expect(database.prepare(`
      SELECT from_snapshot_id, to_snapshot_id, modified_paths
      FROM atlas_semantic_changes
      WHERE to_snapshot_id = ?
    `).get(changed.snapshotId)).toEqual({
      from_snapshot_id: initial.snapshotId,
      to_snapshot_id: changed.snapshotId,
      modified_paths: '["src/example.ts"]',
    });
    expect(await fixture.git("status", "--porcelain", "--untracked-files=all"))
      .toBe("M src/example.ts");
  });

  it("rolls back a reconciliation failure, records failed, and retries idempotently", async () => {
    const fixture = await createGitFixture();
    fixtures.push(fixture);
    const repository = await inspectGitRepository(fixture.directory);
    const world = new WorldModelService(repository);
    const initial = await world.build();
    const databasePath = initial.structural.databasePath;
    const database = new DatabaseSync(databasePath);
    try {
      database.exec(`
        CREATE TRIGGER atlas_fixture_reconciliation_failure
        BEFORE UPDATE OF status ON atlas_world_state
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
    using failedDatabase = new DatabaseSync(databasePath);
    expect(failedDatabase.prepare(`
      SELECT COUNT(*) AS count
      FROM atlas_semantic_changes
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
      FROM atlas_semantic_changes
    `).get()).toEqual({ count: 2 });
  });
});
