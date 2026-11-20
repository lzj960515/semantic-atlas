import dagre from "@dagrejs/dagre";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import {
  layoutDiagram,
  diagramEdgePath,
  type DiagramLayout,
  type DiagramLayoutSpec,
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
    expect(new Set(retry.points.map((point) => point.y)).size).toBeGreaterThan(1);
  });
});

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
