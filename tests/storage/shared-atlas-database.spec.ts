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

  it("backfills v2 structural targets only from evidence for the same reference", async () => {
    const context = await createSharedDatabaseContext(fixtures);
    using snapshots = new SnapshotStore(context.repository);
    snapshots.save(context.snapshot);
    const matchingTarget = context.evidence.symbolId;
    const independentTarget = "symbol:src/independent.ts#independent";
    using graph = new GraphStore(context.repository);
    graph.mutateBusinessGraph({
      ...businessMutation(context.snapshot.snapshotId, context.evidence),
      upsertRelations: [matchingTarget, independentTarget].map((target) => ({
        from: { domain: "business" as const, key: "fixture/read-value" },
        type: "realized_by" as const,
        to: { domain: "structural" as const, id: target },
        certainty: "exact" as const,
        evidence: [context.evidence],
      })),
    });
    graph.close();
    snapshots.close();

    downgradeTargetLocatorSchema(context.databasePath);

    using migrated = new GraphStore(context.repository);
    expect(migrated.schemaVersion).toBe(3);
    using database = new DatabaseSync(context.databasePath, { readOnly: true });
    const migratedTargets = database.prepare(`
      SELECT to_key, target_file, target_binding_status
      FROM atlas_business_relations
    `).all() as unknown as {
      to_key: string;
      target_file: string | null;
      target_binding_status: string;
    }[];
    const targetByReference = new Map(migratedTargets.map((target) => [target.to_key, target]));
    expect(targetByReference.get(matchingTarget)).toEqual({
      to_key: matchingTarget,
      target_file: context.evidence.file,
      target_binding_status: "bound",
    });
    expect(targetByReference.get(independentTarget)).toEqual({
      to_key: independentTarget,
      target_file: null,
      target_binding_status: "unresolved",
    });
  });
});

function downgradeTargetLocatorSchema(databasePath: string): void {
  using database = new DatabaseSync(databasePath);
  for (const column of [
    "target_file",
    "target_qualified_symbol",
    "target_structural_kind",
    "target_start_line",
    "target_start_column",
    "target_end_line",
    "target_end_column",
    "target_atlas_snapshot_id",
    "target_backend_version",
    "target_backend_locator",
    "target_binding_status",
  ]) {
    database.exec(`ALTER TABLE atlas_business_relations DROP COLUMN ${column}`);
  }
  database.prepare("DELETE FROM atlas_schema_migrations WHERE version = 3").run();
}

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
