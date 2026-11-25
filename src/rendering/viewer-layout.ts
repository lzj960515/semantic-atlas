import type { ELK, ElkNode } from "elkjs/lib/elk-api.js";

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

/** 节点、独立接点与正交路线由同一布局引擎计算，预排和文字实测共用。 */
export async function layoutDiagram(
  elkApi: Pick<ELK, "layout">,
  spec: DiagramLayoutSpec,
  measuredSizes: Readonly<Record<string, DiagramSize>> = {},
  viewport?: DiagramSize,
): Promise<DiagramLayout> {
  const arrange = async (direction: DiagramLayoutSpec["direction"]): Promise<DiagramLayout> => {
    const graph: ElkNode = {
      id: "diagram",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": direction === "LR" ? "RIGHT" : "DOWN",
        "elk.edgeRouting": "ORTHOGONAL",
        "elk.layered.mergeEdges": "false",
        "elk.spacing.nodeNode": "54",
        "elk.spacing.edgeNode": "16",
        "elk.spacing.edgeEdge": "24",
        "elk.layered.spacing.nodeNodeBetweenLayers": "64",
        "elk.padding": "[top=44,left=44,bottom=44,right=44]",
      },
      children: spec.nodes.map((node) => ({
        id: node.id,
        width: measuredSizes[node.id]?.width ?? node.width,
        height: measuredSizes[node.id]?.height ?? node.height,
      })),
      edges: spec.edges.map((edge) => ({
        id: edge.id,
        sources: [edge.from],
        targets: [edge.to],
        ...(edge.width && edge.height
          ? {
              labels: [
                {
                  id: `${edge.id}-label`,
                  // ELK 仅为非空文字安排标签；可见内容仍由原有 HTML 文字层绘制。
                  text: edge.id,
                  width: edge.width,
                  height: edge.height,
                  layoutOptions: { "elk.edgeLabels.placement": "TAIL" },
                },
              ],
            }
          : {}),
      })),
    };
    const layout = await elkApi.layout(graph);
    // 消除布局浮点误差，不把理论上的直线绘成亚像素斜线。
    const coordinate = (value: number): number => Math.round(value * 1000) / 1000;
    const point = (value: DiagramPoint): DiagramPoint => ({
      x: coordinate(value.x),
      y: coordinate(value.y),
    });
    const byId = new Map(layout.edges!.map((edge) => [edge.id, edge]));
    return {
      direction,
      width: coordinate(layout.width!),
      height: coordinate(layout.height!),
      offsetX: 0,
      offsetY: 0,
      nodes: layout.children!.map((node) => ({
        id: node.id,
        width: node.width!,
        height: node.height!,
        x: coordinate(node.x! + node.width! / 2),
        y: coordinate(node.y! + node.height! / 2),
      })),
      edges: spec.edges.map(({ id }) => {
        const edge = byId.get(id)!;
        const section = edge.sections![0]!;
        const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map(
          point,
        );
        const label = edge.labels?.[0];
        return {
          id,
          points,
          x: coordinate(label ? label.x! + label.width! / 2 : section.startPoint.x),
          y: coordinate(label ? label.y! + label.height! / 2 : section.startPoint.y),
        };
      }),
    };
  };
  if (!viewport) return arrange(spec.direction);
  const [horizontal, vertical] = await Promise.all([arrange("LR"), arrange("TB")]);
  const scale = (layout: DiagramLayout): number =>
    Math.min(1, (viewport.width - 48) / layout.width, (viewport.height - 56) / layout.height);
  return scale(vertical) > scale(horizontal) ? vertical : horizontal;
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
