import {
  graphPatchV1Schema,
  type GraphPatchV1,
} from "../contracts/graph.js";
import type { GraphStore } from "../graph/graph-store.js";
import type { BusinessGraphMutation, SourceRange } from "../graph/types.js";
import type { GitRepository } from "../repository/types.js";
import { createRepositorySnapshot } from "../snapshots/repository-snapshot.js";
import { CodeGraphStructuralBackend } from "../structural-backend/codegraph-backend.js";
import type {
  StructuralIndexBackend,
  StructuralNode,
} from "../structural-backend/types.js";

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
    private readonly structural: StructuralIndexBackend = new CodeGraphStructuralBackend(repository),
  ) {}

  async learn(input: unknown): Promise<AppliedGraphPatch> {
    const patch = graphPatchV1Schema.parse(input);
    const currentSnapshot = await createRepositorySnapshot(this.repository);
    this.requireCurrentBaseSnapshot(patch, currentSnapshot.snapshotId);
    await this.requireCurrentStructuralEvidence(patch);
    const verifiedSnapshot = await createRepositorySnapshot(this.repository);
    this.requireCurrentBaseSnapshot(patch, verifiedSnapshot.snapshotId);

    this.graph.mutateBusinessGraph(toBusinessGraphMutation(patch));

    return {
      baseSnapshotId: patch.baseSnapshotId,
      snapshotId: verifiedSnapshot.snapshotId,
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

  private async requireCurrentStructuralEvidence(patch: GraphPatchV1): Promise<void> {
    const nodes = new Map<string, StructuralNode>();
    const resolve = async (id: string): Promise<StructuralNode> => {
      const known = nodes.get(id);
      if (known !== undefined) {
        return known;
      }
      const node = await this.structural.getNode({ id });
      if (node === undefined) {
        throw new Error(`Structural reference ${id} does not resolve in the current index`);
      }
      nodes.set(id, node);
      return node;
    };

    const evidence = [
      ...patch.nodeOperations.flatMap((operation) => (
        operation.op === "upsert" ? operation.node.evidence : []
      )),
      ...patch.relationOperations.flatMap((operation) => (
        operation.op === "upsert" ? operation.relation.evidence : []
      )),
    ];
    for (const item of evidence) {
      const node = await resolve(item.symbolId);
      if (node.path !== item.file || !sameRange(node, item.range)) {
        throw new Error(
          `Evidence ${item.symbolId} at ${item.file} does not match the current structural index`,
        );
      }
    }

    for (const operation of patch.relationOperations) {
      if (operation.op === "upsert" && operation.relation.to.domain === "structural") {
        await resolve(operation.relation.to.id);
      }
    }
  }
}

function sameRange(
  node: StructuralNode,
  range: SourceRange,
): boolean {
  return node.range.start.line === range.start.line
    && node.range.start.column === range.start.column
    && node.range.end.line === range.end.line
    && node.range.end.column === range.end.column;
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
