import type dagre from "@dagrejs/dagre";

export interface DiagramSize {
  readonly width: number;
  readonly height: number;
}

export interface DiagramPoint {
  readonly x: number;
  readonly y: number;
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

export interface DiagramLayoutNode extends DiagramSize, DiagramPoint {
  readonly id: string;
}

export interface DiagramLayoutEdge extends DiagramPoint {
  readonly id: string;
  readonly points: readonly DiagramPoint[];
}

export interface DiagramLayout extends DiagramSize {
  readonly direction: "LR" | "TB";
  readonly offsetX: number;
  readonly offsetY: number;
  readonly nodes: readonly DiagramLayoutNode[];
  readonly edges: readonly DiagramLayoutEdge[];
}

/** 服务端预排和浏览器按正文实测共用，节点统一为矩形业务卡片。 */
export function layoutDiagram(
  dagreApi: Pick<typeof dagre, "graphlib" | "layout">,
  spec: DiagramLayoutSpec,
  measuredSizes: Readonly<Record<string, DiagramSize>> = {},
  viewport?: DiagramSize,
): DiagramLayout {
  if (viewport) {
    const horizontal = layoutDiagram(dagreApi, { ...spec, direction: "LR" }, measuredSizes);
    const vertical = layoutDiagram(dagreApi, { ...spec, direction: "TB" }, measuredSizes);
    const scale = (layout: DiagramLayout): number =>
      Math.min(1, (viewport.width - 48) / layout.width, (viewport.height - 56) / layout.height);
    return scale(vertical) > scale(horizontal) ? vertical : horizontal;
  }
  const horizontal = spec.direction === "LR";
  const graph = new dagreApi.graphlib.Graph({ multigraph: true })
    .setGraph({
      rankdir: spec.direction,
      ranker: "network-simplex",
      acyclicer: "greedy",
      nodesep: 54,
      edgesep: 24,
      ranksep: 64,
      marginx: 0,
      marginy: 0,
    })
    .setDefaultEdgeLabel(() => ({}));
  for (const node of spec.nodes) {
    const measured = measuredSizes[node.id];
    graph.setNode(node.id, {
      width: measured?.width ?? node.width,
      height: measured?.height ?? node.height,
    });
  }
  for (const edge of spec.edges) {
    graph.setEdge(
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
  dagreApi.layout(graph);
  const nodes = spec.nodes.map(({ id }) => ({ id, ...graph.node(id) }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const edges = spec.edges.map((edge) => {
    const route = graph.edge(edge.from, edge.to, edge.id) as dagre.GraphEdge & {
      readonly x?: number;
      readonly y?: number;
    };
    const source = byId.get(edge.from)!;
    const target = byId.get(edge.to)!;
    const raw = route.points.map(({ x, y }) => ({ x, y }));
    if (edge.from !== edge.to) {
      const forward = horizontal ? target.x > source.x : target.y > source.y;
      raw[0] = horizontal
        ? { x: source.x + ((forward ? 1 : -1) * source.width) / 2, y: source.y }
        : { x: source.x, y: source.y + ((forward ? 1 : -1) * source.height) / 2 };
      raw[raw.length - 1] = horizontal
        ? { x: target.x - ((forward ? 1 : -1) * target.width) / 2, y: target.y }
        : { x: target.x, y: target.y - ((forward ? 1 : -1) * target.height) / 2 };
    }
    const points: DiagramPoint[] = [];
    const append = (point: DiagramPoint): void => {
      const previous = points.at(-1);
      if (previous?.x === point.x && previous.y === point.y) return;
      const before = points.at(-2);
      if (
        before &&
        previous &&
        ((before.x === previous.x && previous.x === point.x) ||
          (before.y === previous.y && previous.y === point.y))
      )
        points.pop();
      points.push(point);
    };
    for (const point of raw) {
      const previous = points.at(-1);
      if (previous && previous.x !== point.x && previous.y !== point.y) {
        if (horizontal) {
          const middleX = (previous.x + point.x) / 2;
          append({ x: middleX, y: previous.y });
          append({ x: middleX, y: point.y });
        } else {
          const middleY = (previous.y + point.y) / 2;
          append({ x: previous.x, y: middleY });
          append({ x: point.x, y: middleY });
        }
      }
      append(point);
    }
    const middle = points[Math.floor(points.length / 2)] ?? source;
    const labelX = route.x ?? middle.x;
    const labelY = route.y ?? middle.y;
    return {
      id: edge.id,
      points,
      x:
        labelX +
        (horizontal ? 0 : (labelX >= (source.x + target.x) / 2 ? 1 : -1) * (edge.width / 2 + 7)),
      y:
        labelY +
        (horizontal ? (labelY >= (source.y + target.y) / 2 ? 1 : -1) * (edge.height / 2 + 7) : 0),
    };
  });
  const padding = 44;
  return {
    direction: spec.direction,
    width: (graph.graph().width ?? 0) + padding * 2,
    height: (graph.graph().height ?? 0) + padding * 2,
    offsetX: padding,
    offsetY: padding,
    nodes,
    edges,
  };
}

/** 正交路径的转弯处留小圆角，避免把业务连线画成斜线。 */
export function diagramEdgePath(points: readonly DiagramPoint[]): string {
  if (points.length === 0) return "";
  let path = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]!;
    const point = points[index]!;
    const next = points[index + 1]!;
    const before = Math.hypot(point.x - previous.x, point.y - previous.y);
    const after = Math.hypot(next.x - point.x, next.y - point.y);
    const radius = Math.min(8, before / 2, after / 2);
    if (radius === 0) continue;
    const entry = {
      x: point.x + ((previous.x - point.x) * radius) / before,
      y: point.y + ((previous.y - point.y) * radius) / before,
    };
    const exit = {
      x: point.x + ((next.x - point.x) * radius) / after,
      y: point.y + ((next.y - point.y) * radius) / after,
    };
    path += ` L ${entry.x} ${entry.y} Q ${point.x} ${point.y} ${exit.x} ${exit.y}`;
  }
  const last = points.at(-1)!;
  return `${path} L ${last.x} ${last.y}`;
}
