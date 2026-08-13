import type {
  StructuralIndexBackend,
  StructuralNode,
  StructuralReference,
  StructuralRelation,
} from "../structural-backend/types.js";

export class StructuralFlowCatalog {
  readonly nodes: readonly StructuralNode[];
  readonly relations: readonly StructuralRelation[];
  readonly #nodesByReference: ReadonlyMap<string, StructuralNode>;

  private constructor(
    nodes: readonly StructuralNode[],
    relations: readonly StructuralRelation[],
  ) {
    this.nodes = nodes;
    this.relations = relations;
    this.#nodesByReference = new Map(nodes.map((node) => [node.reference.id, node]));
  }

  static async load(
    structural: StructuralIndexBackend,
    verifiedReferences: readonly StructuralReference[] = [],
  ): Promise<StructuralFlowCatalog> {
    const graph = await structural.readProjectGraph({
      declarationKinds: ["file", "import", "route", "class", "method", "function", "test"],
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
    return relation.support.status === "exact" ? this.node(relation.to.id) : undefined;
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

function compareNodes(left: StructuralNode, right: StructuralNode): number {
  return left.path.localeCompare(right.path)
    || left.range.start.line - right.range.start.line
    || left.range.start.column - right.range.start.column
    || left.reference.id.localeCompare(right.reference.id);
}
