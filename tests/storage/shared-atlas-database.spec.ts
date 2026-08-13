import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { GraphStore } from "../../src/graph/graph-store.js";
import type { BusinessGraphMutation, Evidence } from "../../src/graph/types.js";
import { inspectGitRepository } from "../../src/repository/repository-inspector.js";
import { createRepositorySnapshot } from "../../src/snapshots/repository-snapshot.js";
import { SnapshotStore } from "../../src/storage/snapshot-store.js";
import { CodeGraphStructuralBackend } from "../../src/structural-backend/codegraph-backend.js";
import { WorldSnapshotStore } from "../../src/world/world-snapshot-store.js";
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
    expect(migrated.schemaVersion).toBe(4);
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

  it("migrates snapshot-keyed changes into an ordered publication chain", async () => {
    const context = await createSharedDatabaseContext(fixtures);
    using world = new WorldSnapshotStore(context.repository);
    world.begin(context.snapshot.snapshotId);
    world.publish(context.snapshot, "1.5.0", 1, emptyResolver(), {
      fromSnapshotId: null,
      toSnapshotId: context.snapshot.snapshotId,
      structural: { added: ["src/example.ts"], modified: [], removed: [] },
    });
    await context.fixture.write("src/example.ts", "export const value = 2;\n");
    const changed = await createRepositorySnapshot(context.repository);
    world.begin(changed.snapshotId);
    world.publish(changed, "1.5.0", 1, emptyResolver(), {
      fromSnapshotId: context.snapshot.snapshotId,
      toSnapshotId: changed.snapshotId,
      structural: { added: [], modified: ["src/example.ts"], removed: [] },
    });
    world.close();

    downgradePublicationSchema(context.databasePath);

    using migrated = new WorldSnapshotStore(context.repository);
    expect(migrated.readState()).toMatchObject({
      status: "current",
      currentSnapshotId: changed.snapshotId,
    });
    expect(migrated.readSemanticChanges()).toEqual({
      fromSnapshotId: context.snapshot.snapshotId,
      toSnapshotId: changed.snapshotId,
      nodes: { added: [], changed: ["file:src/example.ts"], removed: [] },
      relations: { added: [], changed: [], removed: [] },
      staleAssertions: [],
    });
    using database = new DatabaseSync(context.databasePath, { readOnly: true });
    expect(database.prepare(`
      SELECT
        publication.snapshot_id,
        previous.snapshot_id AS previous_snapshot_id
      FROM atlas_world_publications AS publication
      LEFT JOIN atlas_world_publications AS previous
        ON previous.publication_id = publication.previous_publication_id
      ORDER BY publication.publication_id
    `).all()).toEqual([
      { snapshot_id: context.snapshot.snapshotId, previous_snapshot_id: null },
      {
        snapshot_id: changed.snapshotId,
        previous_snapshot_id: context.snapshot.snapshotId,
      },
    ]);
    expect(database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });
});

function downgradeTargetLocatorSchema(databasePath: string): void {
  using database = new DatabaseSync(databasePath);
  database.exec(`
    ALTER TABLE atlas_world_state DROP COLUMN current_publication_id;
    DROP TABLE atlas_world_publications;
    CREATE TABLE atlas_semantic_changes (
      repository_id TEXT NOT NULL,
      from_snapshot_id TEXT,
      to_snapshot_id TEXT NOT NULL,
      added_paths TEXT NOT NULL,
      modified_paths TEXT NOT NULL,
      removed_paths TEXT NOT NULL,
      stale_assertions TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (repository_id, to_snapshot_id),
      FOREIGN KEY (repository_id, to_snapshot_id)
        REFERENCES atlas_repository_snapshots(repository_id, snapshot_id) ON DELETE CASCADE
    ) STRICT;
  `);
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
  database.prepare("DELETE FROM atlas_schema_migrations WHERE version >= 3").run();
}

function downgradePublicationSchema(databasePath: string): void {
  using database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE atlas_semantic_changes (
      repository_id TEXT NOT NULL,
      from_snapshot_id TEXT,
      to_snapshot_id TEXT NOT NULL,
      added_paths TEXT NOT NULL,
      modified_paths TEXT NOT NULL,
      removed_paths TEXT NOT NULL,
      stale_assertions TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (repository_id, to_snapshot_id),
      FOREIGN KEY (repository_id, to_snapshot_id)
        REFERENCES atlas_repository_snapshots(repository_id, snapshot_id) ON DELETE CASCADE
    ) STRICT;

    INSERT INTO atlas_semantic_changes (
      repository_id,
      from_snapshot_id,
      to_snapshot_id,
      added_paths,
      modified_paths,
      removed_paths,
      stale_assertions,
      created_at
    )
    SELECT
      publication.repository_id,
      previous.snapshot_id,
      publication.snapshot_id,
      publication.added_paths,
      publication.modified_paths,
      publication.removed_paths,
      publication.stale_assertions,
      publication.published_at
    FROM atlas_world_publications AS publication
    LEFT JOIN atlas_world_publications AS previous
      ON previous.publication_id = publication.previous_publication_id
    ORDER BY publication.publication_id;

    ALTER TABLE atlas_world_state DROP COLUMN current_publication_id;
    DROP TABLE atlas_world_publications;
    DELETE FROM atlas_schema_migrations WHERE version = 4;
  `);
}

function emptyResolver() {
  return {
    getNode: () => undefined,
    findCandidates: () => [],
    backendLocator: () => undefined,
  };
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
