import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { GraphStore } from "../../src/graph/graph-store.js";
import type {
  Evidence,
  GraphSourceLocation,
} from "../../src/graph/types.js";
import { inspectGitRepository } from "../../src/repository/repository-inspector.js";
import type { GitRepository } from "../../src/repository/types.js";
import { createRepositorySnapshot } from "../../src/snapshots/repository-snapshot.js";
import type { RepositorySnapshot } from "../../src/snapshots/types.js";
import { SnapshotStore } from "../../src/storage/snapshot-store.js";
import type {
  StructuralBuildResult,
  StructuralIndexBackend,
  StructuralNode,
} from "../../src/structural-backend/types.js";
import type {
  EvidenceLocator,
  StructuralEvidenceResolver,
  WorldWriteCoordinator,
} from "../../src/world/types.js";
import { WorldSnapshotStore } from "../../src/world/world-snapshot-store.js";
import { createGitFixture, type GitFixture } from "../support/git-fixture.js";

export interface GraphTestContext {
  readonly fixture: GitFixture;
  readonly repository: GitRepository;
  readonly snapshot: RepositorySnapshot;
  readonly graph: GraphStore;
  readonly structuralBackend: StructuralIndexBackend & WorldWriteCoordinator;
  readonly evidence: Evidence;
  cleanup(): Promise<void>;
}

export async function createGraphTestContext(): Promise<GraphTestContext> {
  const fixture = await createGitFixture();
  const repository = await inspectGitRepository(fixture.directory);
  await initializeSharedDatabaseFixture(repository.worktreeRoot);
  const structuralBackend = createStructuralBackendFixture(repository.worktreeRoot);
  const snapshot = await createRepositorySnapshot(repository);
  const structuralNode = await structuralBackend.getNode({ id: "symbol:src/example.ts#value" });
  const source = snapshot.files.find((file) => file.path === "src/example.ts")?.worktree;
  if (structuralNode === undefined || source === undefined || source === null) {
    throw new Error("Expected the graph fixture structural value");
  }
  const evidence: Evidence = {
    symbolId: structuralNode.reference.id,
    file: structuralNode.path,
    range: structuralNode.range,
    contentHash: source.contentHash,
  };
  saveSnapshot(repository, snapshot);
  const graph = new GraphStore(repository);
  graph.reconcileSnapshot(snapshot.snapshotId);
  using world = new WorldSnapshotStore(repository);
  world.begin(snapshot.snapshotId);
  world.publish(snapshot, "1.5.0", 1, {
    getNode: (reference) => (
      reference === structuralNode.reference.id ? structuralNode : undefined
    ),
    findCandidates: (locator) => (
      structuralNode.path === locator.file ? [structuralNode] : []
    ),
    backendLocator: (node) => `backend:${node.reference.id}`,
  }, {
    fromSnapshotId: null,
    toSnapshotId: snapshot.snapshotId,
    structural: { added: [], modified: [], removed: [] },
  });

  return {
    fixture,
    repository,
    snapshot,
    graph,
    structuralBackend,
    evidence,
    async cleanup() {
      graph.close();
      await fixture.cleanup();
    },
  };
}

async function initializeSharedDatabaseFixture(worktreeRoot: string): Promise<void> {
  const atlasDirectory = join(worktreeRoot, ".atlas");
  await mkdir(atlasDirectory);
  await writeFile(join(atlasDirectory, ".gitignore"), "*\n");
  using database = new DatabaseSync(join(atlasDirectory, "codegraph.db"));
  database.exec(`
    CREATE TABLE schema_versions (version INTEGER PRIMARY KEY) STRICT;
    INSERT INTO schema_versions (version) VALUES (8);
  `);
}

function createStructuralBackendFixture(
  worktreeRoot: string,
): StructuralIndexBackend & WorldWriteCoordinator {
  const nodeFor = (id: string): StructuralNode | undefined => {
    if (id === "symbol:src/example.ts#value") {
      return structuralNode(id, "value", "src/example.ts", 24);
    }
    if (id === "symbol:src/stable.ts#stable") {
      return structuralNode(id, "stable", "src/stable.ts", 28);
    }
    return undefined;
  };
  const completeState = {
    completeness: "complete" as const,
    databasePath: join(worktreeRoot, ".atlas", "codegraph.db"),
    backendVersion: "1.5.0",
    extractionVersion: 1,
    indexedAt: "2026-08-13T00:00:00.000Z",
    diagnostics: [],
  };
  const buildResult: StructuralBuildResult = {
    ...completeState,
    mode: "incremental",
    counts: {
      filesDiscovered: 0,
      filesIndexed: 0,
      filesSkipped: 0,
      filesErrored: 0,
      nodes: 0,
      relations: 0,
    },
    changes: { added: [], modified: [], removed: [] },
    boundaries: [],
  };
  const candidatesFor = (locator: EvidenceLocator): StructuralNode[] => [
    nodeFor("symbol:src/example.ts#value"),
    nodeFor("symbol:src/stable.ts#stable"),
  ].filter((node): node is StructuralNode => (
    node !== undefined
      && node.path === locator.file
      && (locator.qualifiedSymbol === null || node.qualifiedName === locator.qualifiedSymbol)
      && (locator.structuralKind === null || node.kind === locator.structuralKind)
  ));
  const resolver: StructuralEvidenceResolver = {
    getNode: (reference) => nodeFor(reference),
    findCandidates: candidatesFor,
    backendLocator: (node) => `backend:${node.reference.id}`,
  };
  return {
    inspect: async () => completeState,
    build: async () => ({ ...buildResult, mode: "full" }),
    sync: async () => buildResult,
    listRoots: async () => [],
    search: async ({ query }) => [
      nodeFor("symbol:src/example.ts#value"),
      nodeFor("symbol:src/stable.ts#stable"),
    ].filter((node): node is StructuralNode => (
      node !== undefined && node.name.toLowerCase().includes(query.toLowerCase())
    )).map((node) => ({ score: 1, node })),
    getNode: async ({ id }) => nodeFor(id),
    traverse: async ({ reference }) => ({
      roots: [reference],
      nodes: [],
      relations: [],
      boundaries: [],
    }),
    getCallers: async () => [],
    getCallees: async () => [],
    getFileDependencies: async () => [],
    withWorldWriteLock: async (operation) => operation(completeState, resolver),
  };
}

function structuralNode(
  id: string,
  name: string,
  path: string,
  endColumn: number,
): StructuralNode {
  return {
    reference: { id },
    kind: "Symbol",
    name,
    qualifiedName: name,
    path,
    language: "typescript",
    range: {
      start: { line: 1, column: 1 },
      end: { line: 1, column: endColumn },
    },
    support: { status: "exact", provenance: "backend" },
  };
}

export function saveSnapshot(
  repository: GitRepository,
  snapshot: RepositorySnapshot,
): void {
  using snapshotStore = new SnapshotStore(repository);
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
    symbolId: "symbol:src/example.ts#value",
    ...locationFor(snapshot),
  };
}
