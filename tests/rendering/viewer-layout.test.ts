import dagre from "@dagrejs/dagre";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import {
  layoutDiagram,
  diagramEdgePath,
  type DiagramLayout,
  type DiagramLayoutSpec,
  type DiagramPoint,
} from "../../src/rendering/viewer-layout.js";

describe("业务流程布局", () => {
  it.each(["LR", "TB"] as const)("%s布局让分支卡片分开，连线只走水平和垂直方向", (direction) => {
    const spec = branchingDiagram(direction);
    const layout = layoutDiagram(dagre, spec);
    for (const [index, node] of layout.nodes.entries()) {
      for (const other of layout.nodes.slice(index + 1)) {
        expect(
          Math.abs(node.x - other.x) >= (node.width + other.width) / 2 ||
            Math.abs(node.y - other.y) >= (node.height + other.height) / 2,
        ).toBe(true);
      }
    }
    for (const edge of layout.edges) {
      for (let index = 1; index < edge.points.length; index += 1) {
        const previous = edge.points[index - 1]!;
        const point = edge.points[index]!;
        expect(previous.x === point.x || previous.y === point.y).toBe(true);
      }
      const definition = spec.edges.find((item) => item.id === edge.id)!;
      for (const [id, point] of [
        [definition.from, edge.points[0]!],
        [definition.to, edge.points.at(-1)!],
      ] as const) {
        const node = layout.nodes.find((item) => item.id === id)!;
        expect(
          Math.max(
            Math.abs(point.x - node.x) / (node.width / 2),
            Math.abs(point.y - node.y) / (node.height / 2),
          ),
        ).toBeCloseTo(1);
      }
    }
  });

  it.each(["LR", "TB"] as const)(
    "%s布局能直连时不绕行，侧向分支只保留必要的一次转弯",
    (direction) => {
      const base = branchingDiagram(direction);
      const spec = {
        ...base,
        nodes: base.nodes.map((node) => ({
          ...node,
          width: direction === "LR" ? 208 : 104,
          height: direction === "LR" ? 104 : 208,
        })),
      };
      const layout = layoutDiagram(dagre, spec);
      expect(layout.edges.find((edge) => edge.id === "start")!.points).toHaveLength(2);
      for (const id of ["yes", "no"]) {
        const branch = layout.edges.find((edge) => edge.id === id)!;
        expect(branch.points).toHaveLength(3);
        // 分支条件仍贴近最终路线，不能留在已经删除的阶梯旁。
        const distances = branch.points.slice(1).map((to, index) => {
          const from = branch.points[index]!;
          const x = Math.max(Math.min(from.x, to.x), Math.min(Math.max(from.x, to.x), branch.x));
          const y = Math.max(Math.min(from.y, to.y), Math.min(Math.max(from.y, to.y), branch.y));
          return Math.hypot(branch.x - x, branch.y - y);
        });
        expect(Math.min(...distances)).toBeLessThanOrEqual(25);
      }
      expectRoutesOutsideCards(layout);
      expect(opposingSegments(layout)).toEqual([]);
    },
  );

  it("判断与普通节点一样使用卡片，长文本按实测高度重排", () => {
    const spec = branchingDiagram("LR");
    const initial = layoutDiagram(dagre, spec);
    const expanded = layoutDiagram(dagre, spec, { choice: { width: 208, height: 420 } });
    expect(expanded.nodes.find((node) => node.id === "choice")).toMatchObject({
      width: 208,
      height: 420,
    });
    expect(expanded.height).toBeGreaterThan(initial.height);
    expect(layoutDiagram(dagre, spec)).toEqual(initial);
  });

  it("分支文字预留空间，圆角连线保持原有起止点", () => {
    const layout = layoutDiagram(dagre, branchingDiagram("LR"));
    const branch = layout.edges.find((edge) => edge.id === "no")!;
    const path = diagramEdgePath(branch.points);
    expect(path).toContain(" Q ");
    expect(path.startsWith(`M ${branch.points[0]!.x} ${branch.points[0]!.y}`)).toBe(true);
    expect(path.endsWith(`L ${branch.points.at(-1)!.x} ${branch.points.at(-1)!.y}`)).toBe(true);
    const expanded = layoutDiagram(dagre, {
      ...branchingDiagram("LR"),
      edges: branchingDiagram("LR").edges.map((edge) => ({ ...edge, width: 260, height: 36 })),
    });
    expect(expanded.width).toBeGreaterThan(layout.width);
  });

  it("单文件HTML使用相同的布局结果", () => {
    const spec = branchingDiagram("LR");
    const result = runInNewContext(`(${layoutDiagram.toString()})(dagreApi, spec)`, {
      dagreApi: dagre,
      spec,
    }) as DiagramLayout;
    expect(JSON.parse(JSON.stringify(result))).toEqual(layoutDiagram(dagre, spec));
  });

  it("按可读比例选择横排或竖排，同等时优先横排", () => {
    const spec = branchingDiagram("LR");
    const portrait = layoutDiagram(dagre, spec, {}, { width: 620, height: 1050 });
    const landscape = layoutDiagram(dagre, spec, {}, { width: 1400, height: 500 });
    const spacious = layoutDiagram(dagre, spec, {}, { width: 2000, height: 2000 });
    expect(portrait.direction).toBe("TB");
    expect(landscape.direction).toBe("LR");
    expect(spacious.direction).toBe("LR");
  });

  it("返回重试的连线保留自己的路线，不与顺向路线重叠", () => {
    const base = branchingDiagram("LR");
    const spec: DiagramLayoutSpec = {
      ...base,
      nodes: base.nodes.slice(0, 2),
      edges: [
        base.edges[0]!,
        { ...base.edges[0]!, id: "retry", from: "choice", to: "entry", width: 36, height: 19 },
      ],
    };
    const result = layoutDiagram(dagre, spec);
    const retry = result.edges.find((edge) => edge.id === "retry")!;
    const forward = result.edges.find((edge) => edge.id === "start")!;
    expect(retry.points).not.toEqual([...forward.points].reverse());
    expect(retry.points[0]).not.toEqual(forward.points.at(-1));
    expect(retry.points.at(-1)).not.toEqual(forward.points[0]);
    expect(opposingSegments(result)).toEqual([]);
    expectRoutesOutsideCards(result);
  });

  it.each(["LR", "TB"] as const)("%s布局的分支、合流、回边与自环使用独立接点", (direction) => {
    const base = branchingDiagram(direction);
    const spec: DiagramLayoutSpec = {
      ...base,
      edges: [
        ...base.edges,
        { ...base.edges[0]!, id: "accepted-retry", from: "accepted", to: "entry" },
        { ...base.edges[0]!, id: "declined-retry", from: "declined", to: "choice" },
        { ...base.edges[0]!, id: "self", from: "choice", to: "choice" },
        { ...base.edges[0]!, id: "parallel", from: "choice", to: "accepted" },
      ],
    };
    const layout = layoutDiagram(dagre, spec);
    for (const node of spec.nodes) {
      const ports = spec.edges.flatMap((edge, index) => {
        const points = layout.edges[index]!.points;
        return [
          ...(edge.from === node.id ? [points[0]!] : []),
          ...(edge.to === node.id ? [points.at(-1)!] : []),
        ];
      });
      expect(new Set(ports.map((point) => `${point.x},${point.y}`)).size).toBe(ports.length);
    }
    for (const edge of layout.edges) {
      for (let index = 1; index < edge.points.length - 1; index += 1) {
        const before = edge.points[index - 1]!;
        const point = edge.points[index]!;
        const after = edge.points[index + 1]!;
        expect(
          (point.x - before.x) * (after.x - point.x) + (point.y - before.y) * (after.y - point.y),
        ).toBeGreaterThanOrEqual(0);
      }
    }
    expect(opposingSegments(layout)).toEqual([]);
    expectRoutesOutsideCards(layout);
  });

  it.each(["LR", "TB"] as const)(
    "%s布局从卡片侧面进入合流时，不穿卡片或反向共用通道",
    (direction) => {
      const spec: DiagramLayoutSpec = {
        direction,
        nodes: ["first", "second", "third", "done", "cancelled"].map((id) => ({
          id,
          kind: "card",
          width: 208,
          height: 114,
        })),
        edges: [
          ["first", "cancelled"],
          ["second", "done"],
          ["third", "done"],
          ["third", "cancelled"],
        ].map(([from, to], index) => ({
          id: String(index),
          from: from!,
          to: to!,
          width: 100,
          height: 19,
          minlen: 1,
          weight: 3,
        })),
      };
      const layout = layoutDiagram(dagre, spec);
      expect(opposingSegments(layout)).toEqual([]);
      expectRoutesOutsideCards(layout);
    },
  );
});

function expectRoutesOutsideCards(layout: DiagramLayout): void {
  for (const edge of layout.edges) {
    for (let index = 1; index < edge.points.length; index += 1) {
      const before = edge.points[index - 1]!;
      const point = edge.points[index]!;
      for (const node of layout.nodes) {
        const horizontal = before.y === point.y;
        const [axis, cross, size, crossSize] = horizontal
          ? (["x", "y", "width", "height"] as const)
          : (["y", "x", "height", "width"] as const);
        const inside =
          before[cross] > node[cross] - node[crossSize] / 2 &&
          before[cross] < node[cross] + node[crossSize] / 2 &&
          Math.min(Math.max(before[axis], point[axis]), node[axis] + node[size] / 2) >
            Math.max(Math.min(before[axis], point[axis]), node[axis] - node[size] / 2);
        expect(inside, `${edge.id} 穿过 ${node.id}`).toBe(false);
      }
    }
  }
}

function opposingSegments(layout: DiagramLayout): readonly string[] {
  const segments = layout.edges.flatMap((edge) =>
    edge.points
      .slice(1)
      .map((point, index) => ({ edge: edge.id, from: edge.points[index]!, to: point })),
  );
  const overlaps = (a: number, b: number, c: number, d: number) =>
    Math.min(Math.max(a, b), Math.max(c, d)) > Math.max(Math.min(a, b), Math.min(c, d));
  const horizontal = (from: DiagramPoint, to: DiagramPoint) => from.y === to.y;
  return segments.flatMap((segment, index) =>
    segments.slice(index + 1).flatMap((other) => {
      if (segment.edge === other.edge) return [];
      const isHorizontal = horizontal(segment.from, segment.to);
      if (isHorizontal !== horizontal(other.from, other.to)) return [];
      const [axis, constant] = isHorizontal ? (["x", "y"] as const) : (["y", "x"] as const);
      return segment.from[constant] === other.from[constant] &&
        (segment.to[axis] - segment.from[axis]) * (other.to[axis] - other.from[axis]) < 0 &&
        overlaps(segment.from[axis], segment.to[axis], other.from[axis], other.to[axis])
        ? [`${segment.edge}/${other.edge}`]
        : [];
    }),
  );
}

function branchingDiagram(direction: "LR" | "TB"): DiagramLayoutSpec {
  return {
    direction,
    nodes: [
      { id: "entry", kind: "card", width: 208, height: 104 },
      { id: "choice", kind: "decision", width: 208, height: 104 },
      { id: "accepted", kind: "outcome", width: 208, height: 104 },
      { id: "declined", kind: "outcome", width: 208, height: 104 },
    ],
    edges: [
      { id: "start", from: "entry", to: "choice", width: 0, height: 0, minlen: 1, weight: 3 },
      { id: "yes", from: "choice", to: "accepted", width: 36, height: 19, minlen: 1, weight: 3 },
      { id: "no", from: "choice", to: "declined", width: 36, height: 19, minlen: 1, weight: 3 },
    ],
  };
}
