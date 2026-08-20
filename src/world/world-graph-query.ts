import type { GitRepository } from "../repository/types.js";
import { GraphStore } from "../graph/graph-store.js";
import type {
  BusinessGraphView,
  BusinessGraphNode,
  BusinessGraphRelation,
  BusinessMapView,
  GraphNeighbor,
  GraphNode,
  GraphNodeReference,
  GraphSearchResult,
  StructuralGraphNode,
} from "../graph/types.js";
import { CodeGraphStructuralBackend } from "../structural-backend/codegraph-backend.js";
import type {
  StructuralIndexBackend,
  StructuralNode,
} from "../structural-backend/types.js";
import type { RepositorySnapshot } from "../snapshots/types.js";
import { BusinessMapProjector } from "./business-map-projector.js";
import { WorldSnapshotStore } from "./world-snapshot-store.js";
import type {
  SemanticGraphChangeOptions,
  SemanticGraphChanges,
} from "./types.js";

interface WorldGraphQueryDependencies {
  readonly graph: GraphStore;
  readonly structural: StructuralIndexBackend;
  readonly ownsGraph: boolean;
}

export class WorldGraphQuery implements Disposable {
  readonly #repository: GitRepository;
  readonly #graph: GraphStore;
  readonly #structural: StructuralIndexBackend;
  readonly #ownsGraph: boolean;

  constructor(
    repository: GitRepository,
    graph?: GraphStore,
    structural: StructuralIndexBackend = new CodeGraphStructuralBackend(repository),
  ) {
    const dependencies = createDependencies(repository, graph, structural);
    this.#repository = repository;
    this.#graph = dependencies.graph;
    this.#structural = dependencies.structural;
    this.#ownsGraph = dependencies.ownsGraph;
  }

  async view(focusKey?: string): Promise<BusinessMapView | undefined> {
    return this.withCurrentWorld(async (snapshot) => {
      const nodes = this.#graph.listBusinessNodes(snapshot.snapshotId);
      const relations = this.#graph.listBusinessRelations(snapshot.snapshotId);
      return new BusinessMapProjector(nodes, relations).project(focusKey);
    });
  }

  async searchBusiness(
    query: string,
    options: { readonly limit?: number } = {},
  ): Promise<readonly GraphSearchResult<BusinessGraphNode>[]> {
    const terms = lexicalTerms(query);
    if (terms.length === 0) {
      return [];
    }
    return this.withCurrentWorld(async (snapshot) => {
      const limit = requireSearchLimit(options.limit);
      return this.#graph.search(query, { snapshotId: snapshot.snapshotId, limit })
        .flatMap((result): GraphSearchResult<BusinessGraphNode>[] => (
          result.node.domain === "business" ? [{ score: result.score, node: result.node }] : []
        ));
    });
  }

  async searchCode(
    query: string,
    options: { readonly limit?: number } = {},
  ): Promise<readonly GraphSearchResult<StructuralGraphNode>[]> {
    const terms = lexicalTerms(query);
    if (terms.length === 0) {
      return [];
    }
    return this.withCurrentWorld(async (snapshot) => {
      const limit = requireSearchLimit(options.limit);
      const results = await this.#structural.search({ query, limit });
      return Promise.all(results.map(async (result, index) => ({
        score: reciprocalRank(index),
        node: await this.structuralNode(result.node, snapshot),
      })));
    });
  }

  async showBusiness(key: string): Promise<BusinessGraphView | undefined> {
    return this.withCurrentWorld(async (snapshot) => {
      const node = this.#graph.getNode({ domain: "business", key }, snapshot.snapshotId);
      if (node?.domain !== "business") {
        return undefined;
      }
      return {
        node,
        relations: (await this.businessAdjacency(
          { domain: "business", key },
          snapshot,
        )).sort(compareNeighbors),
      };
    });
  }

  changes(options: SemanticGraphChangeOptions = {}): SemanticGraphChanges | undefined {
    using store = new WorldSnapshotStore(this.#repository);
    return store.readSemanticChanges(options);
  }

  close(): void {
    if (this.#ownsGraph) {
      this.#graph.close();
    }
  }

  [Symbol.dispose](): void {
    this.close();
  }

  private currentWorld(): ReturnType<WorldSnapshotStore["requireCurrentWorld"]> {
    using store = new WorldSnapshotStore(this.#repository);
    return store.requireCurrentWorld();
  }

  private async withCurrentWorld<Result>(
    query: (snapshot: RepositorySnapshot) => Promise<Result>,
  ): Promise<Result> {
    const currentWorld = this.currentWorld();
    const snapshot = currentWorld.snapshot;
    const result = await query(snapshot);
    const verifiedWorld = this.currentWorld();
    if (verifiedWorld.publicationId !== currentWorld.publicationId) {
      throw new Error(
        `World publication changed from ${currentWorld.publicationId} ` +
        `to ${verifiedWorld.publicationId} during the query`,
      );
    }
    return result;
  }

  private async getNode(
    reference: GraphNodeReference,
    snapshot: RepositorySnapshot,
  ): Promise<GraphNode | undefined> {
    if (reference.domain === "business") {
      return this.#graph.getNode(reference, snapshot.snapshotId);
    }
    const node = await this.#structural.getNode({ id: reference.id });
    return node === undefined ? undefined : this.structuralNode(node, snapshot);
  }

  private async businessAdjacency(
    reference: GraphNodeReference,
    snapshot: RepositorySnapshot,
  ): Promise<GraphNeighbor[]> {
    const result: GraphNeighbor[] = [];
    for (const relation of this.#graph.listBusinessRelations(snapshot.snapshotId)) {
      const relationDirection = directionForRelation(reference, relation);
      if (relationDirection === undefined) {
        continue;
      }
      const otherReference = relationDirection === "outgoing" ? relation.to : relation.from;
      const node = await this.getNode(otherReference, snapshot);
      if (node !== undefined) {
        result.push({ depth: 1, direction: relationDirection, relation, node });
      }
    }
    return result;
  }

  private async structuralNode(
    node: StructuralNode,
    snapshot: RepositorySnapshot,
  ): Promise<StructuralGraphNode> {
    return {
      domain: "structural",
      id: node.reference.id,
      kind: node.kind,
      label: node.name,
      snapshotId: snapshot.snapshotId,
      validity: "valid",
      locations: node.virtual === true ? [] : [sourceLocation(node, snapshot)],
      support: node.support,
    };
  }

}

function createDependencies(
  repository: GitRepository,
  graph: GraphStore | undefined,
  structural: StructuralIndexBackend,
): WorldGraphQueryDependencies {
  return {
    graph: graph ?? new GraphStore(repository),
    structural,
    ownsGraph: graph === undefined,
  };
}

function sourceLocation(node: StructuralNode, snapshot: RepositorySnapshot) {
  return {
    file: node.path,
    range: node.range,
    contentHash: contentHashFor(node.path, snapshot),
  };
}

function contentHashFor(path: string, snapshot: RepositorySnapshot): string {
  const file = snapshot.files.find((candidate) => candidate.path === path);
  if (file?.worktree === null || file?.worktree === undefined) {
    throw new Error(`Structural source ${path} is absent from world snapshot ${snapshot.snapshotId}`);
  }
  return file.worktree.contentHash;
}

function directionForRelation(
  reference: GraphNodeReference,
  relation: BusinessGraphRelation,
): "incoming" | "outgoing" | undefined {
  if (sameReference(reference, relation.from)) {
    return "outgoing";
  }
  return sameReference(reference, relation.to) ? "incoming" : undefined;
}

function sameReference(left: GraphNodeReference, right: GraphNodeReference): boolean {
  return referenceIdentity(left) === referenceIdentity(right);
}

function referenceIdentity(reference: GraphNodeReference): string {
  return reference.domain === "business"
    ? `business:${reference.key}`
    : `structural:${reference.id}`;
}

function nodeIdentity(node: GraphNode): string {
  return node.domain === "business" ? `business:${node.key}` : `structural:${node.id}`;
}

function compareNeighbors(left: GraphNeighbor, right: GraphNeighbor): number {
  return left.depth - right.depth
    || left.relation.type.localeCompare(right.relation.type)
    || nodeIdentity(left.node).localeCompare(nodeIdentity(right.node));
}

function reciprocalRank(index: number): number {
  return 1 / (index + 1);
}

function lexicalTerms(query: string): readonly string[] {
  return query.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [];
}

function requireSearchLimit(limit: number | undefined): number {
  const resolved = limit ?? 20;
  if (!Number.isInteger(resolved) || resolved < 1) {
    throw new Error("World graph search limit must be a positive integer");
  }
  return resolved;
}
