import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { GraphStore } from "../../src/graph/graph-store.js";
import type {
  Evidence,
  GraphSourceLocation,
  StructuralGraphNodeInput,
} from "../../src/graph/types.js";
import { inspectGitRepository } from "../../src/repository/repository-inspector.js";
import type { GitRepository } from "../../src/repository/types.js";
import { createRepositorySnapshot } from "../../src/snapshots/repository-snapshot.js";
import type { RepositorySnapshot } from "../../src/snapshots/types.js";
import { SnapshotStore } from "../../src/storage/snapshot-store.js";
import { createGitFixture, type GitFixture } from "../support/git-fixture.js";

const exampleSymbolId = "symbol:src/example.ts#value";

export interface GraphTestContext {
  readonly fixture: GitFixture;
  readonly repository: GitRepository;
  readonly snapshot: RepositorySnapshot;
  readonly dataDirectory: string;
  readonly graph: GraphStore;
  cleanup(): Promise<void>;
}

export async function createGraphTestContext(): Promise<GraphTestContext> {
  const fixture = await createGitFixture();
  const dataDirectory = await mkdtemp(join(tmpdir(), "semantic-atlas-graph-data-"));
  const repository = await inspectGitRepository(fixture.directory);
  const snapshot = await createRepositorySnapshot(repository);
  saveSnapshot(dataDirectory, repository, snapshot);
  const graph = new GraphStore(dataDirectory, repository);

  return {
    fixture,
    repository,
    snapshot,
    dataDirectory,
    graph,
    async cleanup() {
      graph.close();
      await Promise.all([
        fixture.cleanup(),
        rm(dataDirectory, { recursive: true, force: true }),
      ]);
    },
  };
}

export function saveSnapshot(
  dataDirectory: string,
  repository: GitRepository,
  snapshot: RepositorySnapshot,
): void {
  using snapshotStore = new SnapshotStore(dataDirectory, repository);
  snapshotStore.save(snapshot);
}

export function locationFor(
  snapshot: RepositorySnapshot,
  overrides: Partial<GraphSourceLocation> = {},
): GraphSourceLocation {
  const source = snapshot.files.find((file) => file.path === "src/example.ts");
  if (source?.worktree === null || source?.worktree === undefined) {
    throw new Error("Expected the graph fixture source file");
  }

  return {
    file: "src/example.ts",
    range: {
      start: { line: 1, column: 1 },
      end: { line: 1, column: 24 },
    },
    contentHash: source.worktree.contentHash,
    ...overrides,
  };
}

export function evidenceFor(snapshot: RepositorySnapshot): Evidence {
  return {
    symbolId: exampleSymbolId,
    ...locationFor(snapshot),
  };
}

export function coreStructuralNodes(
  snapshot: RepositorySnapshot,
): readonly StructuralGraphNodeInput[] {
  const location = locationFor(snapshot);
  return [
    {
      id: "repository:fixture",
      kind: "Repository",
      label: "Fixture repository",
      locations: [],
    },
    {
      id: "module:src",
      kind: "Module",
      label: "Source module",
      locations: [location],
    },
    {
      id: "file:src/example.ts",
      kind: "File",
      label: "src/example.ts",
      locations: [location],
    },
    {
      id: exampleSymbolId,
      kind: "Symbol",
      label: "value",
      locations: [location],
    },
    {
      id: "test:src/example.ts#value",
      kind: "Test",
      label: "value test",
      locations: [location],
    },
  ];
}
