import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import { GraphStore } from "../../src/graph/graph-store.js";
import { BusinessKnowledgeService } from "../../src/knowledge/business-knowledge-service.js";
import { inspectGitRepository } from "../../src/repository/repository-inspector.js";
import { createRepositorySnapshot } from "../../src/snapshots/repository-snapshot.js";
import { AtlasDatabase } from "../../src/storage/atlas-database.js";
import { SnapshotStore } from "../../src/storage/snapshot-store.js";
import { CodeGraphStructuralBackend } from "../../src/structural-backend/codegraph-backend.js";
import { StructuralProjectionBootstrapper } from "../../src/structural-backend/structural-projection-bootstrapper.js";
import { WorldModelService } from "../../src/world/world-model-service.js";
import { WorldSnapshotStore } from "../../src/world/world-snapshot-store.js";
import { createGitFixture, type GitFixture } from "../support/git-fixture.js";

describe("split Atlas storage", () => {
  const fixtures: GitFixture[] = [];
  const linkedWorktrees = new Map<GitFixture, string[]>();

  afterEach(async () => {
    await Promise.all(fixtures.splice(0).map(async (fixture) => {
      for (const worktree of linkedWorktrees.get(fixture) ?? []) {
        await fixture.git("worktree", "remove", "--force", worktree).catch(() => undefined);
      }
      await fixture.cleanup();
    }));
    linkedWorktrees.clear();
  });

  it("keeps repository knowledge in the user store and only CodeGraph in the worktree", async () => {
    const fixture = await createFixture(fixtures);
    const repository = await inspectGitRepository(fixture.directory);
    const publication = await new WorldModelService(repository).build();
    using graph = new GraphStore(repository);
    using snapshots = new SnapshotStore(repository);

    expect(graph.databasePath).toBe(snapshots.databasePath);
    expect(graph.databasePath).not.toBe(publication.structural.databasePath);
    expect(readObjectNames(graph.databasePath, "atlas_%")).toEqual(expect.arrayContaining([
      "atlas_business_nodes",
      "atlas_repository_snapshots",
      "atlas_worktree_states",
      "atlas_world_publications",
    ]));
    expect(readObjectNames(publication.structural.databasePath, "atlas_%")).toEqual([]);
    expect(readObjectNames(publication.structural.databasePath, "files")).toEqual(["files"]);
    expect(await fixture.git("status", "--porcelain", "--untracked-files=all")).toBe("");
  });

  it("shares learned knowledge across linked worktrees and preserves it after worktree removal", async () => {
    const fixture = await createFixture(fixtures);
    const primaryRepository = await inspectGitRepository(fixture.directory);
    await new WorldModelService(primaryRepository).build();
    const primaryWorld = new WorldModelService(primaryRepository);
    const snapshotId = primaryWorld.currentSnapshotId();
    const snapshot = await createRepositorySnapshot(primaryRepository);
    const structural = new CodeGraphStructuralBackend(primaryRepository);
    const value = (await structural.search({ query: "value", limit: 10 }))
      .find(({ node }) => node.name === "value")?.node;
    const source = snapshot.files.find(({ path }) => path === "src/example.ts")?.worktree;
    if (value === undefined || source === null || source === undefined) {
      throw new Error("Expected the indexed fixture value");
    }
    using primaryGraph = new GraphStore(primaryRepository);
    await new BusinessKnowledgeService(primaryRepository, primaryGraph).learn({
      schemaVersion: 1,
      baseSnapshotId: snapshotId,
      nodeOperations: [{
        op: "upsert",
        node: {
          key: "fixture/read-value",
          kind: "Operation",
          label: "Read value",
          summary: "Returns the fixture value.",
          aliases: ["value reader"],
          certainty: "exact",
          evidence: [{
            symbolId: value.reference.id,
            file: value.path,
            range: value.range,
            contentHash: source.contentHash,
          }],
        },
      }],
      relationOperations: [],
    });

    const linkedWorktree = `${fixture.directory}-linked`;
    linkedWorktrees.set(fixture, [linkedWorktree]);
    await fixture.git("worktree", "add", "-b", "fixture-linked", linkedWorktree);
    const linkedRepository = await inspectGitRepository(linkedWorktree);
    const linkedSnapshot = await createRepositorySnapshot(linkedRepository);
    expect(await new StructuralProjectionBootstrapper(linkedRepository).bootstrap(linkedSnapshot))
      .toBe(true);
    const linkedPublication = await new WorldModelService(linkedRepository).sync();
    using linkedGraph = new GraphStore(linkedRepository);
    expect(linkedGraph.getNode(
      { domain: "business", key: "fixture/read-value" },
      linkedPublication.snapshotId,
    )).toMatchObject({ validity: "valid", label: "Read value" });

    linkedGraph.close();
    await fixture.git("worktree", "remove", "--force", linkedWorktree);
    linkedWorktrees.set(fixture, []);
    using reopenedPrimary = new GraphStore(primaryRepository);
    expect(reopenedPrimary.getNode(
      { domain: "business", key: "fixture/read-value" },
      snapshotId,
    )).toMatchObject({ validity: "valid", label: "Read value" });
  }, 30_000);

  it("rejects a relative Semantic Atlas home", async () => {
    const fixture = await createFixture(fixtures);
    const repository = await inspectGitRepository(fixture.directory);
    const previousHome = process.env.SEMANTIC_ATLAS_HOME;
    process.env.SEMANTIC_ATLAS_HOME = "relative-atlas-home";
    try {
      expect(() => new AtlasDatabase(repository)).toThrow(/absolute path/iu);
    } finally {
      process.env.SEMANTIC_ATLAS_HOME = previousHome;
    }
  });

  it("isolates worktree publications and snapshot bindings while sharing business keys", async () => {
    const fixture = await createFixture(fixtures);
    const primaryRepository = await inspectGitRepository(fixture.directory);
    const primaryPublication = await new WorldModelService(primaryRepository).build();
    const primaryValue = await requireValue(primaryRepository);
    await learnOperation(
      primaryRepository,
      primaryPublication.snapshotId,
      "fixture/primary-value",
      primaryValue,
    );

    const linkedWorktree = `${fixture.directory}-linked`;
    linkedWorktrees.set(fixture, [linkedWorktree]);
    await fixture.git("worktree", "add", "-b", "fixture-linked", linkedWorktree);
    await writeFile(join(linkedWorktree, "src/example.ts"), "export const value = 2;\n");
    const linkedRepository = await inspectGitRepository(linkedWorktree);
    const linkedSnapshot = await createRepositorySnapshot(linkedRepository);
    expect(await new StructuralProjectionBootstrapper(linkedRepository).bootstrap(linkedSnapshot))
      .toBe(true);
    const linkedPublication = await new WorldModelService(linkedRepository).sync();
    const linkedValue = await requireValue(linkedRepository);

    using primaryGraphBeforeMerge = new GraphStore(primaryRepository);
    using linkedGraph = new GraphStore(linkedRepository);
    expect(primaryGraphBeforeMerge.getNode(
      { domain: "business", key: "fixture/primary-value" },
      primaryPublication.snapshotId,
    )).toMatchObject({ validity: "valid" });
    expect(linkedGraph.getNode(
      { domain: "business", key: "fixture/primary-value" },
      linkedPublication.snapshotId,
    )).toMatchObject({ validity: "stale" });

    await learnOperation(
      linkedRepository,
      linkedPublication.snapshotId,
      "fixture/branch-value",
      linkedValue,
    );
    using primaryGraphWithBranchKnowledge = new GraphStore(primaryRepository);
    expect(primaryGraphWithBranchKnowledge.getNode(
      { domain: "business", key: "fixture/branch-value" },
      primaryPublication.snapshotId,
    )).toMatchObject({ validity: "stale" });

    using primaryWorld = new WorldSnapshotStore(primaryRepository);
    using linkedWorld = new WorldSnapshotStore(linkedRepository);
    expect(primaryWorld.requireCurrentSnapshot().snapshotId).toBe(primaryPublication.snapshotId);
    expect(linkedWorld.requireCurrentSnapshot().snapshotId).toBe(linkedPublication.snapshotId);
    expect(linkedWorld.readSemanticChanges()).toBeUndefined();

    await fixture.git("-C", linkedWorktree, "add", "src/example.ts");
    await fixture.git("-C", linkedWorktree, "commit", "-m", "test: change linked value");
    await fixture.git("merge", "--ff-only", "fixture-linked");
    const mergedPublication = await new WorldModelService(primaryRepository).sync();
    using mergedGraph = new GraphStore(primaryRepository);
    expect(mergedGraph.getNode(
      { domain: "business", key: "fixture/branch-value" },
      mergedPublication.snapshotId,
    )).toMatchObject({ validity: "valid" });

    using database = new DatabaseSync(mergedGraph.databasePath, { readOnly: true });
    const states = database.prepare(`
      SELECT git_directory, current_snapshot_id
      FROM atlas_worktree_states
      WHERE repository_id = ? AND status = 'current'
      ORDER BY git_directory
    `).all(primaryRepository.repositoryId) as unknown as {
      git_directory: string;
      current_snapshot_id: string;
    }[];
    expect(states).toHaveLength(2);
    expect(new Set(states.map(({ current_snapshot_id }) => current_snapshot_id))).toEqual(new Set([
      linkedPublication.snapshotId,
      mergedPublication.snapshotId,
    ]));
  }, 30_000);
});

async function createFixture(fixtures: GitFixture[]): Promise<GitFixture> {
  const fixture = await createGitFixture();
  fixtures.push(fixture);
  return fixture;
}

function readObjectNames(databasePath: string, pattern: string): string[] {
  using database = new DatabaseSync(databasePath, { readOnly: true });
  return (database.prepare(`
    SELECT name
    FROM sqlite_schema
    WHERE name LIKE ?
    ORDER BY name
  `).all(pattern) as unknown as { name: string }[]).map(({ name }) => name);
}

async function requireValue(repository: Awaited<ReturnType<typeof inspectGitRepository>>) {
  const value = (await new CodeGraphStructuralBackend(repository).search({
    query: "value",
    limit: 10,
  })).find(({ node }) => node.name === "value")?.node;
  const snapshot = await createRepositorySnapshot(repository);
  const source = snapshot.files.find(({ path }) => path === "src/example.ts")?.worktree;
  if (value === undefined || source === null || source === undefined) {
    throw new Error("Expected the indexed fixture value");
  }
  return { node: value, contentHash: source.contentHash };
}

async function learnOperation(
  repository: Awaited<ReturnType<typeof inspectGitRepository>>,
  snapshotId: string,
  key: string,
  value: Awaited<ReturnType<typeof requireValue>>,
): Promise<void> {
  using graph = new GraphStore(repository);
  await new BusinessKnowledgeService(repository, graph).learn({
    schemaVersion: 1,
    baseSnapshotId: snapshotId,
    nodeOperations: [{
      op: "upsert",
      node: {
        key,
        kind: "Operation",
        label: key,
        summary: `Reads the value for ${key}.`,
        aliases: [],
        certainty: "exact",
        evidence: [{
          symbolId: value.node.reference.id,
          file: value.node.path,
          range: value.node.range,
          contentHash: value.contentHash,
        }],
      },
    }],
    relationOperations: [],
  });
}
