import {
  graphPatchV1Schema,
  type GraphPatchV1,
} from "../contracts/graph.js";
import type { GraphStore } from "../graph/graph-store.js";
import type {
  BusinessGraphMutation,
  Evidence,
  SourceRange,
} from "../graph/types.js";
import type { GitRepository } from "../repository/types.js";
import { createRepositorySnapshot } from "../snapshots/repository-snapshot.js";
import { CodeGraphStructuralBackend } from "../structural-backend/codegraph-backend.js";
import {
  requiresBundledCodeGraphRuntime,
  runCodeGraphWorker,
} from "../structural-backend/codegraph-worker-client.js";
import type {
  StructuralIndexBackend,
  StructuralNode,
  StructuralIndexState,
} from "../structural-backend/types.js";
import { WorldSnapshotStore } from "../world/world-snapshot-store.js";
import type {
  StructuralEvidenceResolver,
  WorldWriteCoordinator,
} from "../world/types.js";
import {
  bindStructuralTarget as attachStructuralTargetBinding,
  type StructuralTargetBinding,
} from "./structural-target-binding.js";

export interface AppliedGraphPatch {
  readonly baseSnapshotId: string;
  readonly snapshotId: string;
  readonly applied: {
    readonly nodeOperations: number;
    readonly relationOperations: number;
  };
}

interface StoredEvidence extends Evidence {
  readonly qualifiedSymbol: string;
  readonly structuralKind: StructuralNode["kind"];
  readonly atlasSnapshotId: string;
  readonly backendVersion: string;
  readonly backendLocator: string;
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
    private readonly structural: StructuralIndexBackend & WorldWriteCoordinator =
      new CodeGraphStructuralBackend(repository),
  ) {}

  async learn(input: unknown): Promise<AppliedGraphPatch> {
    if (requiresBundledCodeGraphRuntime()) {
      return runCodeGraphWorker({ operation: "learn", repository: this.repository, input });
    }
    return this.structural.withWorldWriteLock((state, resolver) => (
      this.learnLocked(input, state, resolver)
    ));
  }

  private async learnLocked(
    input: unknown,
    structuralState: StructuralIndexState,
    resolver: StructuralEvidenceResolver,
  ): Promise<AppliedGraphPatch> {
    const patch = graphPatchV1Schema.parse(input);
    const currentSnapshot = await createRepositorySnapshot(this.repository);
    this.requireCurrentBaseSnapshot(patch, currentSnapshot.snapshotId);
    using world = new WorldSnapshotStore(this.repository);
    if (world.requireCurrentSnapshot().snapshotId !== patch.baseSnapshotId) {
      throw new Error("GraphPatch base snapshot is not the current world snapshot");
    }
    const structuralNodes = this.requireCurrentStructuralEvidence(patch, resolver);
    const verifiedSnapshot = await createRepositorySnapshot(this.repository);
    this.requireCurrentBaseSnapshot(patch, verifiedSnapshot.snapshotId);

    this.graph.mutateBusinessGraph(toBusinessGraphMutation(
      patch,
      structuralNodes,
      resolver,
      verifiedSnapshot.snapshotId,
      structuralState.backendVersion,
    ));

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

  private requireCurrentStructuralEvidence(
    patch: GraphPatchV1,
    resolver: StructuralEvidenceResolver,
  ): ReadonlyMap<string, StructuralNode> {
    const nodes = new Map<string, StructuralNode>();
    const resolve = (id: string): StructuralNode => {
      const known = nodes.get(id);
      if (known !== undefined) {
        return known;
      }
      const node = resolver.getNode(id);
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
      const node = resolve(item.symbolId);
      if (node.path !== item.file || !sameRange(node, item.range)) {
        throw new Error(
          `Evidence ${item.symbolId} at ${item.file} does not match the current structural index`,
        );
      }
    }

    for (const operation of patch.relationOperations) {
      if (operation.op === "upsert" && operation.relation.to.domain === "structural") {
        resolve(operation.relation.to.id);
      }
    }
    return nodes;
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

function toBusinessGraphMutation(
  patch: GraphPatchV1,
  structuralNodes: ReadonlyMap<string, StructuralNode>,
  resolver: StructuralEvidenceResolver,
  snapshotId: string,
  backendVersion: string,
): BusinessGraphMutation {
  const bindEvidence = (evidence: Evidence): StoredEvidence => {
    const node = structuralNodes.get(evidence.symbolId);
    if (node === undefined) {
      throw new Error(`Structural reference ${evidence.symbolId} was not verified`);
    }
    return {
      ...evidence,
      qualifiedSymbol: node.qualifiedName,
      structuralKind: node.kind,
      atlasSnapshotId: snapshotId,
      backendVersion,
      backendLocator: resolver.backendLocator(node) ?? node.reference.id,
    };
  };
  const createStructuralTargetBinding = (
    reference: string,
  ): StructuralTargetBinding => {
    const node = structuralNodes.get(reference);
    if (node === undefined) {
      throw new Error(`Structural relation target ${reference} was not verified`);
    }
    return {
      structuralReference: reference,
      file: node.path,
      qualifiedSymbol: node.qualifiedName,
      structuralKind: node.kind,
      range: node.range,
      atlasSnapshotId: snapshotId,
      backendVersion,
      backendLocator: resolver.backendLocator(node) ?? node.reference.id,
    };
  };
  return {
    baseSnapshotId: patch.baseSnapshotId,
    upsertNodes: patch.nodeOperations.flatMap((operation) => (
      operation.op === "upsert"
        ? [{ ...operation.node, evidence: operation.node.evidence.map(bindEvidence) }]
        : []
    )),
    removeNodeKeys: patch.nodeOperations.flatMap((operation) => (
      operation.op === "remove" ? [operation.key] : []
    )),
    upsertRelations: patch.relationOperations.flatMap((operation) => (
      operation.op === "upsert"
        ? [operation.relation.to.domain === "structural"
            ? attachStructuralTargetBinding({
                ...operation.relation,
                evidence: operation.relation.evidence.map(bindEvidence),
              }, createStructuralTargetBinding(operation.relation.to.id))
            : {
                ...operation.relation,
                evidence: operation.relation.evidence.map(bindEvidence),
              }]
        : []
    )),
    removeRelations: patch.relationOperations.flatMap((operation) => (
      operation.op === "remove" ? [operation.relation] : []
    )),
  };
}
