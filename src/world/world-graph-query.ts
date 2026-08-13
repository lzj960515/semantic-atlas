import type { GitRepository } from "../repository/types.js";
import { GraphStore } from "../graph/graph-store.js";
import type {
  BusinessGraphNode,
  BusinessGraphRelation,
  GraphNeighbor,
  GraphNode,
  GraphNodeReference,
  GraphSearchResult,
  GraphTraversalOptions,
  StructuralGraphNode,
  StructuralGraphRelation,
  UnknownBoundary,
  WorldGraphTraversalResult,
  WorldGraphView,
} from "../graph/types.js";
import { CodeGraphStructuralBackend } from "../structural-backend/codegraph-backend.js";
import type {
  StructuralIndexBackend,
  StructuralNode,
  StructuralRelation,
  StructuralTraversalResult,
  StructuralUnknownBoundary,
} from "../structural-backend/types.js";
import type { RepositorySnapshot } from "../snapshots/types.js";
import { WorldSnapshotStore } from "./world-snapshot-store.js";
import type { SemanticGraphChanges } from "./types.js";

export type WorldGraphTraversalOptions = Omit<GraphTraversalOptions, "snapshotId">;

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

  async roots(): Promise<readonly (BusinessGraphNode | StructuralGraphNode)[]> {
    return this.withCurrentWorld(async (snapshot) => {
      const businessRoots = this.#graph.listCapabilityRoots(snapshot.snapshotId);
      if (businessRoots.length > 0) {
        return businessRoots;
      }
      return Promise.all((await this.#structural.listRoots())
        .map((node) => this.structuralNode(node, snapshot)));
    });
  }

  async children(reference: GraphNodeReference): Promise<readonly GraphNode[]> {
    return this.withCurrentWorld(async (snapshot) => {
      const direction = reference.domain === "business" ? "incoming" : "outgoing";
      const relationTypes = reference.domain === "business"
        ? ["part_of"] as const
        : ["contains"] as const;
      return (await this.traverseSnapshot(reference, {
        maxDepth: 1,
        direction,
        relationTypes,
      }, snapshot)).neighbors.map(({ node }) => node);
    });
  }

  async search(
    query: string,
    options: { readonly limit?: number } = {},
  ): Promise<readonly GraphSearchResult[]> {
    const terms = lexicalTerms(query);
    if (terms.length === 0) {
      return [];
    }
    return this.withCurrentWorld(async (snapshot) => {
      const limit = requireSearchLimit(options.limit);
      const [businessResults, structuralResults] = await Promise.all([
        Promise.resolve(this.#graph.search(query, { snapshotId: snapshot.snapshotId, limit })),
        this.#structural.search({ query, limit }),
      ]);
      const combined = [
        ...businessResults.map((result, index) => ({
          score: reciprocalRank(index),
          node: result.node,
        })),
        ...await Promise.all(structuralResults.map(async (result, index) => ({
          score: reciprocalRank(index),
          node: await this.structuralNode(result.node, snapshot),
        }))),
      ];
      return uniqueSearchResults(combined)
        .sort((left, right) => right.score - left.score || nodeIdentity(left.node).localeCompare(nodeIdentity(right.node)))
        .slice(0, limit);
    });
  }

  async show(
    reference: GraphNodeReference,
    options: Pick<WorldGraphTraversalOptions, "maxDepth"> = {},
  ): Promise<WorldGraphView | undefined> {
    return this.withCurrentWorld(async (snapshot) => {
      const node = await this.getNode(reference, snapshot);
      if (node === undefined) {
        return undefined;
      }
      const depth = requireTraversalDepth(options.maxDepth);
      const traversal = await this.traverseSnapshot(reference, { maxDepth: depth }, snapshot);
      return {
        node,
        depth,
        neighbors: traversal.neighbors,
        invariants: uniqueNodes(traversal.neighbors
          .map(({ node: neighbor }) => neighbor)
          .filter((neighbor): neighbor is BusinessGraphNode => (
            neighbor.domain === "business" && neighbor.kind === "Invariant"
          ))),
        tests: uniqueNodes(traversal.neighbors
          .map(({ node: neighbor }) => neighbor)
          .filter((neighbor): neighbor is StructuralGraphNode => (
            neighbor.domain === "structural" && neighbor.kind === "Test"
          ))),
        unknowns: traversal.unknowns,
      };
    });
  }

  changes(options: {
    readonly fromSnapshotId?: string;
    readonly toSnapshotId?: string;
  } = {}): SemanticGraphChanges | undefined {
    using store = new WorldSnapshotStore(this.#repository);
    const changes = store.readSemanticChanges(options.toSnapshotId);
    if (
      changes !== undefined
      && options.fromSnapshotId !== undefined
      && changes.fromSnapshotId !== options.fromSnapshotId
    ) {
      throw new Error(
        `The requested transition starts at ${options.fromSnapshotId}, ` +
        `but ${changes.toSnapshotId} was published from ${changes.fromSnapshotId ?? "no snapshot"}`,
      );
    }
    return changes;
  }

  async traverse(
    start: GraphNodeReference,
    options: WorldGraphTraversalOptions = {},
  ): Promise<WorldGraphTraversalResult> {
    return this.withCurrentWorld((snapshot) => this.traverseSnapshot(start, options, snapshot));
  }

  private async traverseSnapshot(
    start: GraphNodeReference,
    options: WorldGraphTraversalOptions,
    snapshot: RepositorySnapshot,
  ): Promise<WorldGraphTraversalResult> {
    const maxDepth = requireTraversalDepth(options.maxDepth);
    const direction = options.direction ?? "both";
    const relationTypes = options.relationTypes === undefined
      ? undefined
      : new Set(options.relationTypes);
    const queue: { readonly reference: GraphNodeReference; readonly depth: number }[] = [
      { reference: start, depth: 0 },
    ];
    const visitedNodes = new Set([referenceIdentity(start)]);
    const emittedRelations = new Set<string>();
    const emittedUnknowns = new Set<string>();
    const neighbors: GraphNeighbor[] = [];
    const unknowns: UnknownBoundary[] = [];

    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index]!;
      if (current.depth >= maxDepth) {
        continue;
      }
      const adjacent = await this.adjacent(current.reference, snapshot, direction);
      for (const boundary of adjacent.unknowns) {
        if (!emittedUnknowns.has(boundary.id)) {
          emittedUnknowns.add(boundary.id);
          unknowns.push(boundary);
        }
      }
      for (const candidate of adjacent.neighbors) {
        const relationKey = relationIdentity(candidate.relation);
        if (
          emittedRelations.has(relationKey)
          || (relationTypes !== undefined && !relationTypes.has(candidate.relation.type))
        ) {
          continue;
        }
        emittedRelations.add(relationKey);
        const depth = current.depth + 1;
        neighbors.push({ ...candidate, depth });
        const nextReference = referenceForNode(candidate.node);
        const nextIdentity = referenceIdentity(nextReference);
        if (!visitedNodes.has(nextIdentity)) {
          visitedNodes.add(nextIdentity);
          queue.push({ reference: nextReference, depth });
        }
      }
    }

    return {
      neighbors: neighbors.sort(compareNeighbors),
      unknowns: unknowns.sort((left, right) => left.id.localeCompare(right.id)),
    };
  }

  close(): void {
    if (this.#ownsGraph) {
      this.#graph.close();
    }
  }

  [Symbol.dispose](): void {
    this.close();
  }

  private currentSnapshot(): RepositorySnapshot {
    using store = new WorldSnapshotStore(this.#repository);
    return store.requireCurrentSnapshot();
  }

  private async withCurrentWorld<Result>(
    query: (snapshot: RepositorySnapshot) => Promise<Result>,
  ): Promise<Result> {
    const snapshot = this.currentSnapshot();
    const result = await query(snapshot);
    const verifiedSnapshot = this.currentSnapshot();
    if (verifiedSnapshot.snapshotId !== snapshot.snapshotId) {
      throw new Error(
        `World snapshot changed from ${snapshot.snapshotId} to ${verifiedSnapshot.snapshotId} during the query`,
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

  private async adjacent(
    reference: GraphNodeReference,
    snapshot: RepositorySnapshot,
    direction: NonNullable<WorldGraphTraversalOptions["direction"]>,
  ): Promise<WorldGraphTraversalResult> {
    const [business, structural] = await Promise.all([
      this.businessAdjacency(reference, snapshot, direction),
      reference.domain === "structural"
        ? this.structuralAdjacency(reference.id, snapshot, direction)
        : Promise.resolve({ neighbors: [], unknowns: [] }),
    ]);
    return {
      neighbors: [...business, ...structural.neighbors],
      unknowns: structural.unknowns,
    };
  }

  private async businessAdjacency(
    reference: GraphNodeReference,
    snapshot: RepositorySnapshot,
    direction: NonNullable<WorldGraphTraversalOptions["direction"]>,
  ): Promise<GraphNeighbor[]> {
    const result: GraphNeighbor[] = [];
    for (const relation of this.#graph.listBusinessRelations(snapshot.snapshotId)) {
      const relationDirection = directionForRelation(reference, relation);
      if (relationDirection === undefined || (direction !== "both" && direction !== relationDirection)) {
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

  private async structuralAdjacency(
    reference: string,
    snapshot: RepositorySnapshot,
    direction: NonNullable<WorldGraphTraversalOptions["direction"]>,
  ): Promise<WorldGraphTraversalResult> {
    const traversal = await this.#structural.traverse({
      reference: { id: reference },
      maxDepth: 1,
      direction,
    });
    const nodes = new Map(traversal.nodes.map((node) => [node.reference.id, node]));
    const neighbors = await Promise.all(traversal.relations.flatMap((relation) => {
      const relationDirection = structuralRelationDirection(reference, relation);
      if (relationDirection === undefined) {
        return [];
      }
      const target = relationDirection === "outgoing" ? relation.to.id : relation.from.id;
      const node = nodes.get(target);
      if (node === undefined) {
        return [];
      }
      return [this.structuralNeighbor(relation, relationDirection, node, snapshot)];
    }));
    return {
      neighbors,
      unknowns: await Promise.all(traversal.boundaries.map((boundary) => (
        this.unknownBoundary(boundary, traversal, snapshot)
      ))),
    };
  }

  private async structuralNeighbor(
    relation: StructuralRelation,
    direction: "incoming" | "outgoing",
    node: StructuralNode,
    snapshot: RepositorySnapshot,
  ): Promise<GraphNeighbor> {
    return {
      depth: 1,
      direction,
      relation: {
        domain: "structural",
        from: { domain: "structural", id: relation.from.id },
        type: relation.type,
        to: { domain: "structural", id: relation.to.id },
        snapshotId: snapshot.snapshotId,
        certainty: null,
        validity: "valid",
        evidence: [],
        support: relation.support,
      },
      node: await this.structuralNode(node, snapshot),
    };
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

  private async unknownBoundary(
    boundary: StructuralUnknownBoundary,
    traversal: StructuralTraversalResult,
    snapshot: RepositorySnapshot,
  ): Promise<UnknownBoundary> {
    const owner = traversal.nodes.find((node) => node.reference.id === boundary.owner.id)
      ?? await this.#structural.getNode(boundary.owner);
    const path = boundary.path ?? owner?.path;
    const position = boundary.position ?? owner?.range.start;
    if (path === undefined || position === undefined) {
      throw new Error(`Unknown boundary ${boundary.reference.id} has no source owner`);
    }
    return {
      domain: "structural",
      id: boundary.reference.id,
      kind: "UnknownBoundary",
      label: `${boundary.operation} unresolved`,
      snapshotId: snapshot.snapshotId,
      validity: "unknown",
      owner: { domain: "structural", id: boundary.owner.id },
      operation: boundary.operation,
      reason: boundary.reason,
      location: {
        file: path,
        range: { start: position, end: position },
        contentHash: contentHashFor(path, snapshot),
      },
      candidates: boundary.candidates,
      support: boundary.support,
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

function structuralRelationDirection(
  reference: string,
  relation: StructuralRelation,
): "incoming" | "outgoing" | undefined {
  if (relation.from.id === reference) {
    return "outgoing";
  }
  return relation.to.id === reference ? "incoming" : undefined;
}

function sameReference(left: GraphNodeReference, right: GraphNodeReference): boolean {
  return referenceIdentity(left) === referenceIdentity(right);
}

function referenceForNode(node: GraphNode): GraphNodeReference {
  return node.domain === "business"
    ? { domain: "business", key: node.key }
    : { domain: "structural", id: node.id };
}

function referenceIdentity(reference: GraphNodeReference): string {
  return reference.domain === "business"
    ? `business:${reference.key}`
    : `structural:${reference.id}`;
}

function nodeIdentity(node: GraphNode): string {
  return referenceIdentity(referenceForNode(node));
}

function relationIdentity(relation: BusinessGraphRelation | StructuralGraphRelation): string {
  return [
    relation.domain,
    referenceIdentity(relation.from),
    relation.type,
    referenceIdentity(relation.to),
  ].join("\0");
}

function compareNeighbors(left: GraphNeighbor, right: GraphNeighbor): number {
  return left.depth - right.depth
    || left.relation.type.localeCompare(right.relation.type)
    || nodeIdentity(left.node).localeCompare(nodeIdentity(right.node));
}

function uniqueSearchResults(results: readonly GraphSearchResult[]): GraphSearchResult[] {
  const byNode = new Map<string, GraphSearchResult>();
  for (const result of results) {
    const identity = nodeIdentity(result.node);
    const existing = byNode.get(identity);
    if (existing === undefined || result.score > existing.score) {
      byNode.set(identity, result);
    }
  }
  return [...byNode.values()];
}

function uniqueNodes<Node extends GraphNode>(nodes: readonly Node[]): Node[] {
  return [...new Map(nodes.map((node) => [nodeIdentity(node), node])).values()]
    .sort((left, right) => nodeIdentity(left).localeCompare(nodeIdentity(right)));
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

function requireTraversalDepth(depth: number | undefined): number {
  const resolved = depth ?? 1;
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > 3) {
    throw new Error("World graph traversal depth must be an integer from 1 through 3");
  }
  return resolved;
}
