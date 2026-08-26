import type {
  BusinessNode,
  BusinessRelation,
  ValidatedBusinessMap,
} from "../contracts/map.js";
import type {
  ConceptCandidate,
  ConceptMatchKind,
} from "../contracts/cli.js";

export type ConceptResolution =
  | {
      readonly found: true;
      readonly matchedBy: ConceptMatchKind;
      readonly node: BusinessNode;
    }
  | {
      readonly found: false;
      readonly ambiguous: false;
    }
  | {
      readonly found: false;
      readonly ambiguous: true;
      readonly candidates: readonly ConceptCandidate[];
    };

export class BusinessGraph {
  private readonly nodeById: ReadonlyMap<string, BusinessNode>;
  private readonly parentByChild: ReadonlyMap<string, string>;
  private readonly childrenByParent: ReadonlyMap<string, readonly string[]>;
  private readonly incomingByNode: ReadonlyMap<string, readonly BusinessRelation[]>;
  private readonly outgoingByNode: ReadonlyMap<string, readonly BusinessRelation[]>;

  public constructor(private readonly map: ValidatedBusinessMap) {
    this.nodeById = new Map(map.nodes.map((node) => [node.id, node]));
    this.parentByChild = buildParentIndex(map.relations);
    this.childrenByParent = buildChildrenIndex(map.relations);
    this.incomingByNode = buildRelationIndex(map.relations, "to");
    this.outgoingByNode = buildRelationIndex(map.relations, "from");
  }

  public resolve(selector: string): ConceptResolution {
    const exactId = this.nodeById.get(selector);
    if (exactId) return { found: true, matchedBy: "id", node: exactId };

    const normalizedSelector = normalizeTerm(selector);
    const exactName = this.map.nodes.filter(
      (node) => normalizeTerm(node.name) === normalizedSelector,
    );
    const nameResolution = resolveMatches(exactName, "name");
    if (nameResolution) return nameResolution;

    const exactAlias = this.map.nodes.filter((node) =>
      node.aliases.some((alias) => normalizeTerm(alias) === normalizedSelector));
    const aliasResolution = resolveMatches(exactAlias, "alias");
    if (aliasResolution) return aliasResolution;

    const partial = this.map.nodes.filter((node) =>
      normalizeTerm(node.name).includes(normalizedSelector)
      || node.aliases.some((alias) => normalizeTerm(alias).includes(normalizedSelector)));
    return resolveMatches(partial, "partial") ?? { found: false, ambiguous: false };
  }

  public ancestors(nodeId: string): readonly BusinessNode[] {
    const ancestors: BusinessNode[] = [];
    let currentId = this.parentByChild.get(nodeId);
    while (currentId) {
      const current = this.requireNode(currentId);
      ancestors.push(current);
      currentId = this.parentByChild.get(currentId);
    }
    return Object.freeze(ancestors.reverse());
  }

  public children(nodeId: string): readonly BusinessNode[] {
    return Object.freeze(
      (this.childrenByParent.get(nodeId) ?? []).map((childId) => this.requireNode(childId)),
    );
  }

  public incoming(nodeId: string): readonly BusinessRelation[] {
    return this.incomingByNode.get(nodeId) ?? [];
  }

  public outgoing(nodeId: string): readonly BusinessRelation[] {
    return this.outgoingByNode.get(nodeId) ?? [];
  }

  public requireNode(nodeId: string): BusinessNode {
    const node = this.nodeById.get(nodeId);
    if (!node) throw new Error(`Validated graph is missing node '${nodeId}'`);
    return node;
  }
}

function resolveMatches(
  matches: readonly BusinessNode[],
  matchedBy: ConceptMatchKind,
): ConceptResolution | undefined {
  if (matches.length === 0) return undefined;
  if (matches.length === 1) {
    return { found: true, matchedBy, node: matches[0]! };
  }
  return {
    found: false,
    ambiguous: true,
    candidates: Object.freeze(matches.map(toCandidate).sort(compareCandidates)),
  };
}

function toCandidate(node: BusinessNode): ConceptCandidate {
  return {
    id: node.id,
    name: node.name,
    kind: node.kind,
    documentId: node.documentId,
  };
}

function compareCandidates(left: ConceptCandidate, right: ConceptCandidate): number {
  return left.id.localeCompare(right.id);
}

function buildParentIndex(
  relations: readonly BusinessRelation[],
): ReadonlyMap<string, string> {
  return new Map(
    relations
      .filter((relation) => relation.type === "part_of")
      .map((relation) => [relation.from, relation.to]),
  );
}

function buildChildrenIndex(
  relations: readonly BusinessRelation[],
): ReadonlyMap<string, readonly string[]> {
  const index = new Map<string, string[]>();
  for (const relation of relations) {
    if (relation.type !== "part_of") continue;
    const children = index.get(relation.to) ?? [];
    children.push(relation.from);
    index.set(relation.to, children);
  }
  return new Map(
    [...index.entries()].map(([parentId, children]) => [
      parentId,
      Object.freeze(children.sort((left, right) => left.localeCompare(right))),
    ]),
  );
}

function buildRelationIndex(
  relations: readonly BusinessRelation[],
  endpoint: "from" | "to",
): ReadonlyMap<string, readonly BusinessRelation[]> {
  const index = new Map<string, BusinessRelation[]>();
  for (const relation of relations) {
    if (relation.type === "part_of") continue;
    const nodeId = relation[endpoint];
    const indexed = index.get(nodeId) ?? [];
    indexed.push(relation);
    index.set(nodeId, indexed);
  }
  return new Map(
    [...index.entries()].map(([nodeId, indexed]) => [nodeId, Object.freeze([...indexed])]),
  );
}

function normalizeTerm(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}
