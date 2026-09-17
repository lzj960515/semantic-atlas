import type dagre from "@dagrejs/dagre";

export interface DiagramSize {
  readonly width: number;
  readonly height: number;
}

export interface DiagramLayoutNodeSpec extends DiagramSize {
  readonly id: string;
  readonly kind: "card" | "decision" | "outcome";
}

export interface DiagramLayoutEdgeSpec extends DiagramSize {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly minlen: number;
  readonly weight: number;
}

export interface DiagramLayoutSpec {
  readonly direction: "LR" | "TB";
  readonly nodes: readonly DiagramLayoutNodeSpec[];
  readonly edges: readonly DiagramLayoutEdgeSpec[];
}

export interface DiagramPoint {
  readonly x: number;
  readonly y: number;
}

export interface DiagramLayoutNode extends DiagramSize, DiagramPoint {
  readonly id: string;
}

export interface DiagramLayoutEdge extends DiagramPoint {
  readonly id: string;
  readonly points: readonly DiagramPoint[];
}

export interface DiagramLayout extends DiagramSize {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly nodes: readonly DiagramLayoutNode[];
  readonly edges: readonly DiagramLayoutEdge[];
}

// 服务端预估与浏览器实测共用此函数；函数整体序列化后仍只依赖显式参数。
export function layoutDiagram(
  dagreApi: Pick<typeof dagre, "graphlib" | "layout">,
  spec: DiagramLayoutSpec,
  measuredSizes: Readonly<Record<string, DiagramSize>> = {},
): DiagramLayout {
  const vertical = spec.direction === "TB";
  const padding = vertical ? 42 : 28;
  const layoutGraph = new dagreApi.graphlib.Graph({ multigraph: true })
    .setGraph({
      rankdir: spec.direction,
      ranker: "network-simplex",
      acyclicer: "greedy",
      nodesep: vertical ? 92 : 50,
      edgesep: vertical ? 34 : 30,
      ranksep: vertical ? 112 : 118,
      marginx: vertical ? 28 : 24,
      marginy: vertical ? 28 : 24,
    })
    .setDefaultEdgeLabel(() => ({}));

  for (const node of spec.nodes) {
    const measured = measuredSizes[node.id];
    // 菱形中央半宽、半高矩形是正文的内接区域。
    const textRatio = node.kind === "decision" ? 2 : 1;
    layoutGraph.setNode(node.id, {
      width: Math.max(node.width, (measured?.width ?? 0) * textRatio),
      height: Math.max(node.height, (measured?.height ?? 0) * textRatio),
    });
  }
  for (const edge of spec.edges) {
    layoutGraph.setEdge(
      edge.from,
      edge.to,
      {
        width: edge.width,
        height: edge.height,
        minlen: edge.minlen,
        weight: edge.weight,
        labelpos: "c",
      },
      edge.id,
    );
  }

  dagreApi.layout(layoutGraph);
  const graph = layoutGraph.graph();
  const contentWidth = graph.width ?? 0;
  const width = Math.max(960, contentWidth + padding * 2);
  const nodes = spec.nodes.map(({ id }) => {
    const node = layoutGraph.node(id);
    return { id, x: node.x, y: node.y, width: node.width, height: node.height };
  });
  const decisionNodes = new Map(
    spec.nodes
      .filter(({ kind }) => kind === "decision")
      .map(({ id }) => [id, layoutGraph.node(id)]),
  );

  function connectDecisionBoundary(points: DiagramPoint[], nodeId: string, atStart: boolean): void {
    const node = decisionNodes.get(nodeId);
    if (!node || points.length < 2) return;
    const adjacent = points[atStart ? 1 : points.length - 2]!;
    const dx = adjacent.x - node.x;
    const dy = adjacent.y - node.y;
    const distance = Math.abs(dx) / (node.width / 2) + Math.abs(dy) / (node.height / 2);
    if (distance === 0) return;
    // Dagre 路由命中包围矩形；沿末段方向延伸至实际菱形边缘。
    points[atStart ? 0 : points.length - 1] = {
      x: node.x + dx / distance,
      y: node.y + dy / distance,
    };
  }

  const edges = spec.edges.map((edge) => {
    const routed = layoutGraph.edge(edge.from, edge.to, edge.id) as dagre.GraphEdge & {
      readonly x?: number;
      readonly y?: number;
    };
    const points = routed.points.map(({ x, y }) => ({ x, y }));
    connectDecisionBoundary(points, edge.from, true);
    connectDecisionBoundary(points, edge.to, false);
    const middle = points[Math.floor(points.length / 2)] ?? { x: 0, y: 0 };
    return { id: edge.id, points, x: routed.x ?? middle.x, y: routed.y ?? middle.y };
  });

  return {
    width,
    height: (graph.height ?? 0) + padding * 2,
    offsetX: (width - contentWidth) / 2,
    offsetY: padding,
    nodes,
    edges,
  };
}
