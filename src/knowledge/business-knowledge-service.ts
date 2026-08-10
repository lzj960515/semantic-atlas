import {
  graphPatchV1Schema,
  type GraphPatchV1,
} from "../contracts/graph.js";
import type { GraphStore } from "../graph/graph-store.js";
import type { BusinessGraphMutation } from "../graph/types.js";
import type { GitRepository } from "../repository/types.js";
import { createRepositorySnapshot } from "../snapshots/repository-snapshot.js";

export interface AppliedGraphPatch {
  readonly baseSnapshotId: string;
  readonly snapshotId: string;
  readonly applied: {
    readonly nodeOperations: number;
    readonly relationOperations: number;
  };
}

export class GraphPatchConflictError extends Error {
  readonly code = "BASE_SNAPSHOT_MISMATCH";

  constructor(
    readonly baseSnapshotId: string,
    readonly currentSnapshotId: string,
  ) {
    super(
      `GraphPatch base snapshot ${baseSnapshotId} does not match current snapshot ${currentSnapshotId}`,
    );
    this.name = "GraphPatchConflictError";
  }
}

export class BusinessKnowledgeService {
  constructor(
    private readonly repository: GitRepository,
    private readonly graph: GraphStore,
  ) {}

  async learn(input: unknown): Promise<AppliedGraphPatch> {
    const patch = graphPatchV1Schema.parse(input);
    const currentSnapshot = await createRepositorySnapshot(this.repository);
    this.requireCurrentBaseSnapshot(patch, currentSnapshot.snapshotId);

    this.graph.mutateBusinessGraph(toBusinessGraphMutation(patch));

    return {
      baseSnapshotId: patch.baseSnapshotId,
      snapshotId: currentSnapshot.snapshotId,
      applied: {
        nodeOperations: patch.nodeOperations.length,
        relationOperations: patch.relationOperations.length,
      },
    };
  }

  private requireCurrentBaseSnapshot(
    patch: GraphPatchV1,
    currentSnapshotId: string,
  ): void {
    if (patch.baseSnapshotId !== currentSnapshotId) {
      throw new GraphPatchConflictError(patch.baseSnapshotId, currentSnapshotId);
    }
  }
}

function toBusinessGraphMutation(patch: GraphPatchV1): BusinessGraphMutation {
  return {
    baseSnapshotId: patch.baseSnapshotId,
    upsertNodes: patch.nodeOperations.flatMap((operation) => (
      operation.op === "upsert" ? [operation.node] : []
    )),
    removeNodeKeys: patch.nodeOperations.flatMap((operation) => (
      operation.op === "remove" ? [operation.key] : []
    )),
    upsertRelations: patch.relationOperations.flatMap((operation) => (
      operation.op === "upsert" ? [operation.relation] : []
    )),
    removeRelations: patch.relationOperations.flatMap((operation) => (
      operation.op === "remove" ? [operation.relation] : []
    )),
  };
}
