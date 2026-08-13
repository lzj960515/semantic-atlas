import type {
  BackendStructuralRelationType,
  StructuralIndexBackend,
  StructuralNode,
  StructuralReference,
  StructuralRelation,
  StructuralUnknownBoundary,
} from "../structural-backend/types.js";

const CAPABILITY_REACHABILITY = new Set<BackendStructuralRelationType>([
  "contains",
  "declares",
  "references",
  "calls",
]);

export class StructuralFlowCatalog {
  readonly nodes: readonly StructuralNode[];
  readonly relations: readonly StructuralRelation[];
  readonly boundaries: readonly StructuralUnknownBoundary[];
  readonly #nodesByReference: ReadonlyMap<string, StructuralNode>;
  readonly #contextNodesByReference: ReadonlyMap<string, StructuralNode>;
  readonly #contextNodes: readonly StructuralNode[];
  readonly #contextRelations: readonly StructuralRelation[];
  readonly #contextBoundaries: readonly StructuralUnknownBoundary[];
  readonly #rootReferences: ReadonlySet<string>;

  private constructor(
    nodes: readonly StructuralNode[],
    relations: readonly StructuralRelation[],
    boundaries: readonly StructuralUnknownBoundary[],
    context: {
      readonly nodes: readonly StructuralNode[];
      readonly relations: readonly StructuralRelation[];
      readonly boundaries: readonly StructuralUnknownBoundary[];
    } = { nodes, relations, boundaries },
    rootReferences: ReadonlySet<string> = new Set(),
  ) {
    this.nodes = nodes;
    this.relations = relations;
    this.boundaries = boundaries;
    this.#contextNodes = context.nodes;
    this.#contextRelations = context.relations;
    this.#contextBoundaries = context.boundaries;
    this.#rootReferences = rootReferences;
    this.#nodesByReference = new Map(nodes.map((node) => [node.reference.id, node]));
    this.#contextNodesByReference = new Map(context.nodes.map((node) => [node.reference.id, node]));
  }

  static async load(
    structural: StructuralIndexBackend,
    verifiedReferences: readonly StructuralReference[] = [],
  ): Promise<StructuralFlowCatalog> {
    const graph = await structural.readProjectGraph({
      declarationKinds: ["file", "import", "route", "class", "method", "function"],
    });
    const graphNodeIds = new Set(graph.nodes.map((node) => node.reference.id));
    const verifiedNodes = await Promise.all(
      uniqueReferences(verifiedReferences)
        .filter((reference) => !graphNodeIds.has(reference.id))
        .map((reference) => structural.getNode(reference)),
    );
    return new StructuralFlowCatalog(
      [...graph.nodes, ...verifiedNodes.filter((node) => node !== undefined)]
        .sort(compareNodes),
      uniqueRelations(graph.relations),
      uniqueBoundaries(graph.boundaries),
    );
  }

  scopeTo(roots: readonly StructuralReference[]): StructuralFlowCatalog {
    if (roots.length === 0) {
      throw new Error("Business flow derivation requires at least one capability root");
    }
    const owned = this.outgoingClosure(roots);
    const missing = roots.filter((root) => !owned.has(root.id));
    if (missing.length > 0) {
      throw new Error(`Business flow roots reference missing evidence: ${missing.map((root) => root.id).join(", ")}`);
    }
    return new StructuralFlowCatalog(
      this.#contextNodes.filter((node) => owned.has(node.reference.id)),
      this.#contextRelations.filter((relation) => (
        owned.has(relation.from.id) && owned.has(relation.to.id)
      )),
      this.#contextBoundaries.filter((boundary) => owned.has(boundary.owner.id)),
      {
        nodes: this.#contextNodes,
        relations: this.#contextRelations,
        boundaries: this.#contextBoundaries,
      },
      new Set(roots.map((root) => root.id)),
    );
  }

  node(reference: string): StructuralNode | undefined {
    return this.#nodesByReference.get(reference);
  }

  outgoing(reference: string, type?: StructuralRelation["type"]): readonly StructuralRelation[] {
    return this.relations.filter((relation) => (
      relation.from.id === reference && (type === undefined || relation.type === type)
    ));
  }

  incoming(reference: string, type?: StructuralRelation["type"]): readonly StructuralRelation[] {
    return this.relations.filter((relation) => (
      relation.to.id === reference && (type === undefined || relation.type === type)
    ));
  }

  exactTarget(relation: StructuralRelation): StructuralNode | undefined {
    return relation.support.status === "exact"
      && this.nodes.some((node) => node.reference.id === relation.to.id)
      ? this.node(relation.to.id)
      : undefined;
  }

  contextNodes(path: string): readonly StructuralNode[] {
    return this.#contextNodes.filter((node) => node.path === path);
  }

  contextIncoming(reference: string, type?: StructuralRelation["type"]): readonly StructuralRelation[] {
    return this.#contextRelations.filter((relation) => (
      relation.to.id === reference && (type === undefined || relation.type === type)
    ));
  }

  contextOutgoing(reference: string, type?: StructuralRelation["type"]): readonly StructuralRelation[] {
    return this.#contextRelations.filter((relation) => (
      relation.from.id === reference && (type === undefined || relation.type === type)
    ));
  }

  contextNode(reference: string): StructuralNode | undefined {
    return this.#contextNodesByReference.get(reference);
  }

  contextBoundaries(path: string): readonly StructuralUnknownBoundary[] {
    return this.#contextBoundaries.filter((boundary) => boundary.path === path);
  }

  isRoot(reference: string): boolean {
    return this.#rootReferences.has(reference);
  }

  private outgoingClosure(roots: readonly StructuralReference[]): ReadonlySet<string> {
    const knownNodes = new Set(this.#contextNodes.map((node) => node.reference.id));
    const owned = new Set<string>();
    const queue = roots.map((root) => root.id);
    for (let index = 0; index < queue.length; index += 1) {
      const reference = queue[index]!;
      if (!knownNodes.has(reference) || owned.has(reference)) {
        continue;
      }
      owned.add(reference);
      for (const relation of this.#contextRelations) {
        if (
          relation.from.id === reference
          && relation.support.status === "exact"
          && CAPABILITY_REACHABILITY.has(relation.type)
        ) {
          queue.push(relation.to.id);
        }
      }
    }
    return owned;
  }
}

function uniqueReferences(references: readonly StructuralReference[]): StructuralReference[] {
  return [...new Map(references.map((reference) => [reference.id, reference])).values()];
}

function uniqueRelations(relations: readonly StructuralRelation[]): StructuralRelation[] {
  return [...new Map(relations.map((relation) => [
    [relation.from.id, relation.type, relation.to.id].join("\0"),
    relation,
  ])).values()].sort((left, right) => (
    left.from.id.localeCompare(right.from.id)
    || left.type.localeCompare(right.type)
    || left.to.id.localeCompare(right.to.id)
  ));
}

function uniqueBoundaries(boundaries: readonly StructuralUnknownBoundary[]): StructuralUnknownBoundary[] {
  return [...new Map(boundaries.map((boundary) => [boundary.reference.id, boundary])).values()]
    .sort((left, right) => left.reference.id.localeCompare(right.reference.id));
}

function compareNodes(left: StructuralNode, right: StructuralNode): number {
  return left.path.localeCompare(right.path)
    || left.range.start.line - right.range.start.line
    || left.range.start.column - right.range.start.column
    || left.reference.id.localeCompare(right.reference.id);
}
