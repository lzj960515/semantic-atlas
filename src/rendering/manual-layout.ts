import type { DiagramLayout, DiagramLayoutSpec, DiagramPoint } from "./viewer-layout.js";

/** 只改变浏览器布局；业务图和自动布局保留为还原依据。 */
export function repositionDiagram(
  base: DiagramLayout,
  spec: DiagramLayoutSpec,
  offsets: Readonly<Record<string, DiagramPoint>>,
): DiagramLayout {
  if (Object.keys(offsets).length === 0) return base;
  const zero = { x: 0, y: 0 };
  const nodes = base.nodes.map((node) => {
    const delta = offsets[node.id] ?? zero;
    return { ...node, x: node.x + delta.x, y: node.y + delta.y };
  });
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const definitionById = new Map(spec.nodes.map((node) => [node.id, node]));
  const edgeById = new Map(spec.edges.map((edge) => [edge.id, edge]));

  function connectBoundary(points: DiagramPoint[], id: string, start: boolean): void {
    const node = nodeById.get(id)!;
    const adjacent = points[start ? 1 : points.length - 2]!;
    const dx = adjacent.x - node.x;
    const dy = adjacent.y - node.y;
    const horizontal = Math.abs(dx) / (node.width / 2);
    const vertical = Math.abs(dy) / (node.height / 2);
    const distance =
      definitionById.get(id)!.kind === "decision"
        ? horizontal + vertical
        : Math.max(horizontal, vertical);
    points[start ? 0 : points.length - 1] =
      distance === 0
        ? { x: node.x + node.width / 2, y: node.y }
        : { x: node.x + dx / distance, y: node.y + dy / distance };
  }

  const edges = base.edges.map((edge) => {
    const definition = edgeById.get(edge.id)!;
    const from = offsets[definition.from] ?? zero;
    const to = offsets[definition.to] ?? zero;
    if (from === zero && to === zero) return edge;
    // 沿原路由逐渐分配两端位移，保留平行关系和循环的独立走线。
    const points = edge.points.map((point, index) => {
      const ratio = index / (edge.points.length - 1);
      return {
        x: point.x + from.x * (1 - ratio) + to.x * ratio,
        y: point.y + from.y * (1 - ratio) + to.y * ratio,
      };
    });
    connectBoundary(points, definition.from, true);
    connectBoundary(points, definition.to, false);
    return { ...edge, points, x: edge.x + (from.x + to.x) / 2, y: edge.y + (from.y + to.y) / 2 };
  });
  const extents = [
    ...nodes.flatMap((node) => [
      { x: node.x - node.width / 2, y: node.y - node.height / 2 },
      { x: node.x + node.width / 2, y: node.y + node.height / 2 },
    ]),
    ...edges.flatMap((edge) => {
      const label = edgeById.get(edge.id)!;
      return [
        ...edge.points,
        { x: edge.x - label.width / 2, y: edge.y - label.height / 2 },
        { x: edge.x + label.width / 2, y: edge.y + label.height / 2 },
      ];
    }),
  ];
  const margin = 28;
  const offsetX = Math.max(base.offsetX, margin - Math.min(...extents.map(({ x }) => x)));
  const offsetY = Math.max(base.offsetY, margin - Math.min(...extents.map(({ y }) => y)));
  return {
    nodes,
    edges,
    offsetX,
    offsetY,
    width: Math.max(base.width, Math.max(...extents.map(({ x }) => x)) + offsetX + margin),
    height: Math.max(base.height, Math.max(...extents.map(({ y }) => y)) + offsetY + margin),
  };
}
