import dagre from "@dagrejs/dagre";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import {
  layoutDiagram,
  type DiagramLayout,
  type DiagramLayoutSpec,
} from "../../src/rendering/viewer-layout.js";

describe("diagram layout", () => {
  it.each(["LR", "TB"] as const)(
    "keeps %s cards separate and every branch connected",
    (direction) => {
      const spec = branchingDiagram(direction);
      const layout = layoutDiagram(dagre, spec);

      expect(layout.nodes.map(({ id }) => id)).toEqual(spec.nodes.map(({ id }) => id));
      expect(layout.edges.map(({ id }) => id)).toEqual(spec.edges.map(({ id }) => id));
      expect(layout.width).toBeGreaterThanOrEqual(960);
      for (const [index, node] of layout.nodes.entries()) {
        for (const other of layout.nodes.slice(index + 1)) {
          const separateX = Math.abs(node.x - other.x) >= (node.width + other.width) / 2;
          const separateY = Math.abs(node.y - other.y) >= (node.height + other.height) / 2;
          expect(separateX || separateY).toBe(true);
        }
        expect(node.x - node.width / 2 + layout.offsetX).toBeGreaterThanOrEqual(0);
        expect(node.y + node.height / 2 + layout.offsetY).toBeLessThanOrEqual(layout.height);
      }
      for (const edge of layout.edges) {
        expect(edge.points.length).toBeGreaterThanOrEqual(2);
        expect(
          [edge.x, edge.y, ...edge.points.flatMap(({ x, y }) => [x, y])].every(Number.isFinite),
        ).toBe(true);
      }
    },
  );

  it("reflows translated content and returns to its original size when content shrinks", () => {
    const spec: DiagramLayoutSpec = {
      direction: "TB",
      nodes: [{ id: "card", kind: "card", width: 320, height: 128 }],
      edges: [],
    };
    const initial = layoutDiagram(dagre, spec);
    const translated = layoutDiagram(dagre, spec, { card: { width: 980, height: 510 } });
    const restored = layoutDiagram(dagre, spec, { card: { width: 320, height: 128 } });

    expect(translated.nodes[0]).toMatchObject({ width: 980, height: 510 });
    expect(translated.width).toBeGreaterThan(initial.width);
    expect(translated.height).toBeGreaterThan(initial.height);
    expect(restored).toEqual(initial);
  });

  it("contains the full measured decision text in an inscribed rectangle", () => {
    const layout = layoutDiagram(dagre, branchingDiagram("TB"), {
      choice: { width: 310, height: 290 },
    });
    const decision = layout.nodes.find(({ id }) => id === "choice")!;

    expect(decision).toMatchObject({ width: 620, height: 580 });
    expect(310 / decision.width + 290 / decision.height).toBeCloseTo(1);
  });

  it.each(["LR", "TB"] as const)(
    "joins %s branch routes to the visible diamond boundary",
    (direction) => {
      const spec = branchingDiagram(direction);
      const layout = layoutDiagram(dagre, spec);
      const decision = layout.nodes.find(({ id }) => id === "choice")!;

      for (const edge of layout.edges) {
        const definition = spec.edges.find(({ id }) => id === edge.id)!;
        const endpoint = definition.from === decision.id ? edge.points[0]! : edge.points.at(-1)!;
        const boundary =
          Math.abs(endpoint.x - decision.x) / (decision.width / 2) +
          Math.abs(endpoint.y - decision.y) / (decision.height / 2);
        expect(boundary).toBeCloseTo(1);
      }
    },
  );

  it("uses measured label dimensions to reserve room between linked cards", () => {
    const spec = branchingDiagram("TB");
    const initial = layoutDiagram(dagre, spec);
    const expanded = layoutDiagram(dagre, {
      ...spec,
      edges: spec.edges.map((edge) => ({ ...edge, width: 800, height: 250 })),
    });

    expect(expanded.width).toBeGreaterThan(initial.width);
    expect(expanded.height).toBeGreaterThan(initial.height);
  });

  it("runs the same function in the browser without module closures", () => {
    const spec = branchingDiagram("LR");
    const serialized = runInNewContext(`(${layoutDiagram.toString()})(dagreApi, spec)`, {
      dagreApi: dagre,
      spec,
    }) as DiagramLayout;

    expect(JSON.parse(JSON.stringify(serialized))).toEqual(layoutDiagram(dagre, spec));
  });
});

function branchingDiagram(direction: "LR" | "TB"): DiagramLayoutSpec {
  return {
    direction,
    nodes: [
      { id: "entry", kind: "card", width: 320, height: 128 },
      { id: "choice", kind: "decision", width: 560, height: 256 },
      { id: "accepted", kind: "outcome", width: 320, height: 128 },
      { id: "declined", kind: "outcome", width: 320, height: 128 },
    ],
    edges: [
      {
        id: "entry-choice",
        from: "entry",
        to: "choice",
        width: 0,
        height: 0,
        minlen: 1,
        weight: 3,
      },
      {
        id: "choice-accepted",
        from: "choice",
        to: "accepted",
        width: 110,
        height: 24,
        minlen: 1,
        weight: 3,
      },
      {
        id: "choice-declined",
        from: "choice",
        to: "declined",
        width: 110,
        height: 24,
        minlen: 1,
        weight: 3,
      },
    ],
  };
}
