export const BUSINESS_MAP_WORLD = {
  width: 3_000,
  height: 2_200,
} as const;

export interface BusinessMapLayoutInput {
  readonly key: string;
  readonly role: "root" | "child" | "context";
  readonly parentKey?: string | undefined;
}

export interface BusinessMapLayoutNode {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly ring: number;
  readonly depth: number;
  readonly role: BusinessMapLayoutInput["role"];
  readonly parentKey: string | undefined;
}

export interface BusinessMapLayout {
  readonly center: { readonly x: number; readonly y: number };
  readonly nodes: readonly BusinessMapLayoutNode[];
}

export function layoutBusinessMap(
  regions: readonly BusinessMapLayoutInput[],
  existingNodes: readonly BusinessMapLayoutNode[] = [],
): BusinessMapLayout {
  const center = {
    x: BUSINESS_MAP_WORLD.width / 2,
    y: BUSINESS_MAP_WORLD.height / 2,
  };
  const positions = new Map(existingNodes.map((node) => [node.key, node]));
  const pending = regions.filter(({ key }) => !positions.has(key));

  while (pending.length > 0) {
    const ready = pending.filter(({ parentKey }) => parentKey === undefined || positions.has(parentKey));
    const next = ready.length > 0 ? ready : pending;
    for (const [parentKey, siblings] of groupByParent(next)) {
      placeSiblings(siblings, parentKey, positions, center);
    }
    for (const { key } of next) removeRegion(pending, key);
  }

  return {
    center,
    nodes: regions.map(({ key }) => positions.get(key)!),
  };
}

function placeSiblings(
  siblings: readonly BusinessMapLayoutInput[],
  parentKey: string | undefined,
  positions: Map<string, BusinessMapLayoutNode>,
  center: BusinessMapLayout["center"],
): void {
  const parent = parentKey === undefined ? undefined : positions.get(parentKey);
  const existingSiblings = [...positions.values()]
    .filter((node) => node.parentKey === parentKey)
    .sort(compareNodes);
  const allSiblings = [...existingSiblings, ...siblings]
    .sort((left, right) => left.key.localeCompare(right.key));
  const root = parent === undefined;
  const parentPosition = parent ?? { x: center.x, y: center.y, depth: 0 };
  const outwardAngle = root
    ? -Math.PI / 2
    : Math.atan2(parentPosition.y - center.y, parentPosition.x - center.x);

  for (const region of siblings) {
    const index = allSiblings.findIndex(({ key }) => key === region.key);
    const angle = siblingAngle(outwardAngle, index, allSiblings.length, root);
    const depth = parentPosition.depth + 1;
    const radius = siblingRadius(depth, region.role, root);
    positions.set(region.key, {
      key: region.key,
      x: Math.round(parentPosition.x + Math.cos(angle) * radius.x),
      y: Math.round(parentPosition.y + Math.sin(angle) * radius.y),
      ring: depth + (region.role === "context" ? 1 : 0),
      depth,
      role: region.role,
      parentKey,
    });
  }
}

function siblingAngle(
  outwardAngle: number,
  index: number,
  count: number,
  root: boolean,
): number {
  if (count <= 1) return outwardAngle;
  if (root) return outwardAngle + (Math.PI * 2 * index) / count;
  const span = Math.min(1.7, Math.max(0.85, (count - 1) * 0.46));
  return outwardAngle - span / 2 + (span * index) / (count - 1);
}

function siblingRadius(
  depth: number,
  role: BusinessMapLayoutInput["role"],
  root: boolean,
): { readonly x: number; readonly y: number } {
  const base = root ? 430 : 320 + Math.min(depth, 4) * 28;
  const contextOffset = role === "context" ? 155 : 0;
  return {
    x: base + contextOffset,
    y: Math.round((base + contextOffset) * 0.72),
  };
}

function groupByParent(
  nodes: readonly BusinessMapLayoutInput[],
): ReadonlyMap<string | undefined, readonly BusinessMapLayoutInput[]> {
  const groups = new Map<string | undefined, BusinessMapLayoutInput[]>();
  for (const node of nodes) {
    const group = groups.get(node.parentKey) ?? [];
    group.push(node);
    groups.set(node.parentKey, group);
  }
  return groups;
}

function removeRegion(regions: BusinessMapLayoutInput[], key: string): void {
  const index = regions.findIndex((region) => region.key === key);
  if (index >= 0) regions.splice(index, 1);
}

function compareNodes(left: BusinessMapLayoutNode, right: BusinessMapLayoutNode): number {
  return left.key.localeCompare(right.key);
}
