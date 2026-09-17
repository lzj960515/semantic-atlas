import dagre from "@dagrejs/dagre";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { layoutDiagram, type DiagramLayoutSpec } from "../../src/rendering/viewer-layout.js";
import { repositionDiagram } from "../../src/rendering/manual-layout.js";

const spec: DiagramLayoutSpec = {
  direction: "LR",
  nodes: [
    { id: "source", kind: "card", width: 300, height: 120 },
    { id: "target", kind: "decision", width: 400, height: 240 },
  ],
  edges: [
    { id: "one", from: "source", to: "target", width: 100, height: 24, minlen: 1, weight: 3 },
    { id: "two", from: "source", to: "target", width: 100, height: 24, minlen: 1, weight: 3 },
  ],
};

describe("manual diagram layout", () => {
  it("moves one card and all connected routes while leaving other cards in place", () => {
    const base = layoutDiagram(dagre, spec);
    const moved = repositionDiagram(base, spec, { source: { x: 180, y: 90 } });
    expect(moved.nodes[0]!.x).toBe(base.nodes[0]!.x + 180);
    expect(moved.nodes[0]!.y).toBe(base.nodes[0]!.y + 90);
    expect(moved.nodes[1]).toEqual(base.nodes[1]);
    for (const [index, edge] of moved.edges.entries()) {
      expect(edge.points).not.toEqual(base.edges[index]!.points);
      const source = moved.nodes[0]!;
      const start = edge.points[0]!;
      expect(Math.max(Math.abs(start.x - source.x) / (source.width / 2),
        Math.abs(start.y - source.y) / (source.height / 2))).toBeCloseTo(1);
      const target = moved.nodes[1]!;
      const end = edge.points.at(-1)!;
      expect(Math.abs(end.x - target.x) / (target.width / 2)
        + Math.abs(end.y - target.y) / (target.height / 2)).toBeCloseTo(1);
    }
    expect(moved.edges[0]!.points).not.toEqual(moved.edges[1]!.points);
    expect(base.nodes[0]!.x).not.toBe(moved.nodes[0]!.x);
  });

  it("includes nodes dragged beyond every canvas boundary in fit and image bounds", () => {
    const base = layoutDiagram(dagre, spec);
    const moved = repositionDiagram(base, spec, { source: { x: -2000, y: -1000 }, target: { x: 3000, y: 2000 } });
    for (const node of moved.nodes) {
      expect(node.x - node.width / 2 + moved.offsetX).toBeGreaterThanOrEqual(0);
      expect(node.y - node.height / 2 + moved.offsetY).toBeGreaterThanOrEqual(0);
      expect(node.x + node.width / 2 + moved.offsetX).toBeLessThanOrEqual(moved.width);
      expect(node.y + node.height / 2 + moved.offsetY).toBeLessThanOrEqual(moved.height);
    }
  });

  it("keeps self-loop routes attached when their node moves", () => {
    const loopSpec: DiagramLayoutSpec = {
      direction: "LR", nodes: [spec.nodes[0]!],
      edges: [{ ...spec.edges[0]!, to: "source" }],
    };
    const base = layoutDiagram(dagre, loopSpec);
    const moved = repositionDiagram(base, loopSpec, { source: { x: 90, y: 60 } });
    expect(moved.edges[0]!.points.length).toBe(base.edges[0]!.points.length);
    for (const [index, point] of moved.edges[0]!.points.entries()) {
      expect(point.x).toBeCloseTo(base.edges[0]!.points[index]!.x + 90);
      expect(point.y).toBeCloseTo(base.edges[0]!.points[index]!.y + 60);
    }
  });

  it("runs in the offline browser without module closures", () => {
    const base = layoutDiagram(dagre, spec);
    const offsets = { source: { x: 50, y: -70 } };
    const result = runInNewContext(`(${repositionDiagram.toString()})(base, spec, offsets)`, { base, spec, offsets });
    expect(JSON.parse(JSON.stringify(result))).toEqual(repositionDiagram(base, spec, offsets));
  });

  it("restores the automatic layout exactly when offsets are cleared", () => {
    const base = layoutDiagram(dagre, spec);
    expect(repositionDiagram(base, spec, {})).toEqual(base);
  });
});
