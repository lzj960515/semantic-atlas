import type {
  BusinessGraphNode,
  BusinessGraphRelation,
  BusinessMapConnection,
  BusinessMapRegion,
  BusinessMapRelationSummary,
  BusinessMapRelationType,
  BusinessMapView,
} from "../graph/types.js";

interface MutableRelationSummary {
  readonly type: BusinessMapRelationType;
  directCount: number;
  aggregatedCount: number;
  readonly certainty: {
    exact: number;
    inferred: number;
    hypothesis: number;
  };
  readonly validity: {
    valid: number;
    stale: number;
  };
}

interface MutableConnection {
  readonly fromKey: string;
  readonly toKey: string;
  readonly relations: Map<BusinessMapRelationType, MutableRelationSummary>;
}

export class BusinessMapProjector {
  readonly #nodes: ReadonlyMap<string, BusinessGraphNode>;
  readonly #parentByChild: ReadonlyMap<string, string>;
  readonly #childrenByParent: ReadonlyMap<string, readonly string[]>;
  readonly #relations: readonly BusinessGraphRelation[];

  constructor(
    nodes: readonly BusinessGraphNode[],
    relations: readonly BusinessGraphRelation[],
  ) {
    this.#nodes = new Map(nodes.map((node) => [node.key, node]));
    this.#parentByChild = new Map(relations.flatMap((relation) => (
      relation.type === "part_of" && relation.to.domain === "business"
        ? [[relation.from.key, relation.to.key] as const]
        : []
    )));
    this.#childrenByParent = childrenByParent(this.#parentByChild);
    this.#relations = relations;
  }

  project(focusKey?: string): BusinessMapView | undefined {
    const focus = focusKey === undefined ? null : this.#nodes.get(focusKey);
    if (focus === undefined) {
      return undefined;
    }

    const breadcrumbs = focus === null ? [] : this.pathFromRoot(focus.key);
    const regions = new Map<string, BusinessMapRegion>();
    const visibleKeys = focus === null
      ? this.rootKeys()
      : this.#childrenByParent.get(focus.key) ?? [];
    const role = focus === null ? "root" as const : "child" as const;
    visibleKeys.forEach((key) => this.addRegion(regions, key, role));

    const connections = new Map<string, MutableConnection>();
    for (const relation of this.#relations) {
      if (!isMapRelation(relation)) {
        continue;
      }
      if (focus !== null && !this.touchesSubtree(relation, focus.key)) {
        continue;
      }

      const projectedFrom = this.projectEndpoint(relation.from.key, focus, breadcrumbs);
      const projectedTo = this.projectEndpoint(relation.to.key, focus, breadcrumbs);
      if (projectedFrom === projectedTo) {
        continue;
      }

      this.addContextRegion(regions, projectedFrom, focus);
      this.addContextRegion(regions, projectedTo, focus);
      const direct = projectedFrom === relation.from.key && projectedTo === relation.to.key;
      addConnectionContribution(connections, projectedFrom, projectedTo, relation, direct);
    }

    return {
      focus,
      breadcrumbs,
      regions: [...regions.values()].sort(compareRegions),
      connections: presentConnections(connections),
    };
  }

  private rootKeys(): readonly string[] {
    return [...this.#nodes.keys()]
      .filter((key) => !this.#parentByChild.has(key))
      .sort((left, right) => left.localeCompare(right));
  }

  private pathFromRoot(key: string): BusinessGraphNode[] {
    const path: BusinessGraphNode[] = [];
    let current: string | undefined = key;
    while (current !== undefined) {
      const node = this.#nodes.get(current);
      if (node === undefined) {
        break;
      }
      path.push(node);
      current = this.#parentByChild.get(current);
    }
    return path.reverse();
  }

  private touchesSubtree(relation: BusinessGraphRelation, focusKey: string): boolean {
    return this.isDescendantOrSelf(relation.from.key, focusKey)
      || (relation.to.domain === "business" && this.isDescendantOrSelf(relation.to.key, focusKey));
  }

  private isDescendantOrSelf(key: string, ancestorKey: string): boolean {
    let current: string | undefined = key;
    while (current !== undefined) {
      if (current === ancestorKey) {
        return true;
      }
      current = this.#parentByChild.get(current);
    }
    return false;
  }

  private projectEndpoint(
    key: string,
    focus: BusinessGraphNode | null,
    focusPath: readonly BusinessGraphNode[],
  ): string {
    const endpointPath = this.pathFromRoot(key);
    if (focus === null) {
      return endpointPath[0]?.key ?? key;
    }
    if (this.isDescendantOrSelf(key, focus.key)) {
      if (key === focus.key) {
        return key;
      }
      const focusIndex = endpointPath.findIndex((node) => node.key === focus.key);
      return endpointPath[focusIndex + 1]?.key ?? key;
    }

    const commonLength = sharedPrefixLength(focusPath, endpointPath);
    return endpointPath[commonLength]?.key ?? key;
  }

  private addContextRegion(
    regions: Map<string, BusinessMapRegion>,
    key: string,
    focus: BusinessGraphNode | null,
  ): void {
    if (key !== focus?.key && !regions.has(key)) {
      this.addRegion(regions, key, "context");
    }
  }

  private addRegion(
    regions: Map<string, BusinessMapRegion>,
    key: string,
    role: BusinessMapRegion["role"],
  ): void {
    const node = this.#nodes.get(key);
    if (node === undefined) {
      return;
    }
    const childCount = this.#childrenByParent.get(key)?.length ?? 0;
    regions.set(key, { node, role, childCount, expandable: childCount > 0 });
  }
}

function childrenByParent(
  parentByChild: ReadonlyMap<string, string>,
): ReadonlyMap<string, readonly string[]> {
  const result = new Map<string, string[]>();
  for (const [child, parent] of parentByChild) {
    const children = result.get(parent) ?? [];
    children.push(child);
    result.set(parent, children);
  }
  result.forEach((children) => children.sort((left, right) => left.localeCompare(right)));
  return result;
}

function isMapRelation(
  relation: BusinessGraphRelation,
): relation is BusinessGraphRelation & {
  readonly type: BusinessMapRelationType;
  readonly to: { readonly domain: "business"; readonly key: string };
} {
  return relation.to.domain === "business"
    && relation.type !== "part_of"
    && relation.type !== "realized_by"
    && relation.type !== "verified_by";
}

function sharedPrefixLength(
  left: readonly BusinessGraphNode[],
  right: readonly BusinessGraphNode[],
): number {
  let length = 0;
  while (length < left.length && length < right.length && left[length]!.key === right[length]!.key) {
    length += 1;
  }
  return length;
}

function addConnectionContribution(
  connections: Map<string, MutableConnection>,
  fromKey: string,
  toKey: string,
  relation: BusinessGraphRelation & { readonly type: BusinessMapRelationType },
  direct: boolean,
): void {
  const connectionKey = `${fromKey}\0${toKey}`;
  const connection = connections.get(connectionKey) ?? {
    fromKey,
    toKey,
    relations: new Map<BusinessMapRelationType, MutableRelationSummary>(),
  };
  connections.set(connectionKey, connection);

  const summary = connection.relations.get(relation.type) ?? emptySummary(relation.type);
  connection.relations.set(relation.type, summary);
  if (direct) {
    summary.directCount += 1;
  } else {
    summary.aggregatedCount += 1;
  }
  summary.certainty[relation.certainty] += 1;
  summary.validity[relation.validity] += 1;
}

function emptySummary(type: BusinessMapRelationType): MutableRelationSummary {
  return {
    type,
    directCount: 0,
    aggregatedCount: 0,
    certainty: { exact: 0, inferred: 0, hypothesis: 0 },
    validity: { valid: 0, stale: 0 },
  };
}

function compareRegions(left: BusinessMapRegion, right: BusinessMapRegion): number {
  const leftRank = left.role === "context" ? 1 : 0;
  const rightRank = right.role === "context" ? 1 : 0;
  return leftRank - rightRank || left.node.key.localeCompare(right.node.key);
}

function presentConnections(
  connections: ReadonlyMap<string, MutableConnection>,
): BusinessMapConnection[] {
  return [...connections.values()]
    .sort((left, right) => (
      left.fromKey.localeCompare(right.fromKey) || left.toKey.localeCompare(right.toKey)
    ))
    .map((connection) => ({
      from: { domain: "business", key: connection.fromKey },
      to: { domain: "business", key: connection.toKey },
      relations: [...connection.relations.values()]
        .sort((left, right) => left.type.localeCompare(right.type))
        .map((relation): BusinessMapRelationSummary => relation),
    }));
}
