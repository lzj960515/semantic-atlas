import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { GraphStore } from "../../src/graph/graph-store.js";
import type { BusinessGraphMutation, Evidence } from "../../src/graph/types.js";
import { inspectGitRepository } from "../../src/repository/repository-inspector.js";
import { createRepositorySnapshot } from "../../src/snapshots/repository-snapshot.js";
import { SnapshotStore } from "../../src/storage/snapshot-store.js";
import { CodeGraphStructuralBackend } from "../../src/structural-backend/codegraph-backend.js";
import { createGitFixture, type GitFixture } from "../support/git-fixture.js";

describe("shared Atlas database", () => {
  const fixtures: GitFixture[] = [];

  afterEach(async () => {
    await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
  });

  it("creates only namespaced Atlas objects beside CodeGraph's schema", async () => {
    const context = await createSharedDatabaseContext(fixtures);
    const structuralBefore = readCodeGraphOwnershipCounts(context.databasePath);
    using snapshots = new SnapshotStore(context.repository);
    snapshots.save(context.snapshot);
    using graph = new GraphStore(context.repository);
    graph.reconcileSnapshot(context.snapshot.snapshotId);

    expect(snapshots.databasePath).toBe(context.databasePath);
    expect(graph.databasePath).toBe(context.databasePath);

    using database = new DatabaseSync(context.databasePath);
    const atlasObjects = database.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE name LIKE 'atlas_%'
      ORDER BY name ASC
    `).all() as unknown as { name: string }[];
    expect(atlasObjects.length).toBeGreaterThan(0);
    expect(atlasObjects.every(({ name }) => name.startsWith("atlas_"))).toBe(true);
    expect(database.prepare("SELECT COUNT(*) AS count FROM schema_versions").get())
      .toMatchObject({ count: expect.any(Number) });
    expect(readCodeGraphOwnershipCounts(context.databasePath)).toEqual(structuralBefore);

    const obsoleteTables = database.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name IN (
          'repository_snapshots',
          'graph_node_identities',
          'structural_nodes',
          'structural_relations',
          'structural_node_locations'
        )
    `).all();
    expect(obsoleteTables).toEqual([]);
  });

  it("preserves snapshots and business knowledge across a structural clear and full index", async () => {
    const context = await createSharedDatabaseContext(fixtures);
    using snapshots = new SnapshotStore(context.repository);
    snapshots.save(context.snapshot);
    using graph = new GraphStore(context.repository);
    graph.reconcileSnapshot(context.snapshot.snapshotId);
    graph.mutateBusinessGraph(businessMutation(context.snapshot.snapshotId, context.evidence));
    graph.close();
    snapshots.close();

    await expect(context.backend.build()).resolves.toMatchObject({
      completeness: "complete",
      mode: "full",
    });

    using reopenedSnapshots = new SnapshotStore(context.repository);
    using reopenedGraph = new GraphStore(context.repository);
    expect(reopenedSnapshots.latest()).toEqual(context.snapshot);
    expect(reopenedGraph.getNode(
      { domain: "business", key: "fixture/read-value" },
      context.snapshot.snapshotId,
    )).toMatchObject({
      label: "Read value",
      validity: "valid",
      evidence: [context.evidence],
    });
  });
});

function readCodeGraphOwnershipCounts(databasePath: string) {
  using database = new DatabaseSync(databasePath);
  return {
    nodes: database.prepare("SELECT COUNT(*) AS count FROM nodes").get(),
    edges: database.prepare("SELECT COUNT(*) AS count FROM edges").get(),
    schemaVersions: database.prepare("SELECT COUNT(*) AS count FROM schema_versions").get(),
  };
}

async function createSharedDatabaseContext(fixtures: GitFixture[]) {
  const fixture = await createGitFixture();
  fixtures.push(fixture);
  const repository = await inspectGitRepository(fixture.directory);
  const backend = new CodeGraphStructuralBackend(repository);
  const build = await backend.build();
  if (build.completeness !== "complete") {
    throw new Error(`Expected CodeGraph fixture build to complete: ${JSON.stringify(build.diagnostics)}`);
  }
  const snapshot = await createRepositorySnapshot(repository);
  const symbol = (await backend.search({ query: "value", limit: 10 }))
    .find(({ node }) => node.name === "value")?.node;
  const source = snapshot.files.find((file) => file.path === "src/example.ts")?.worktree;
  if (symbol === undefined || source === null || source === undefined) {
    throw new Error("Expected the shared database fixture symbol and source");
  }
  const evidence: Evidence = {
    symbolId: symbol.reference.id,
    file: symbol.path,
    range: symbol.range,
    contentHash: source.contentHash,
  };
  return {
    fixture,
    repository,
    backend,
    snapshot,
    evidence,
    databasePath: build.databasePath,
  };
}

function businessMutation(snapshotId: string, evidence: Evidence): BusinessGraphMutation {
  return {
    baseSnapshotId: snapshotId,
    upsertNodes: [
      {
        key: "fixture/read-value",
        kind: "Operation",
        label: "Read value",
        summary: "Returns the fixture value.",
        aliases: ["fixture-value"],
        certainty: "exact",
        evidence: [evidence],
      },
    ],
    removeNodeKeys: [],
    upsertRelations: [],
    removeRelations: [],
  };
}
