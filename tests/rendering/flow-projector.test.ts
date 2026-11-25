import { describe, expect, it } from "vitest";
import type { BusinessFlow, BusinessNode, ValidatedBusinessMap } from "../../src/contracts/map.js";
import { BusinessGraph } from "../../src/map/business-graph.js";
import { FlowProjector } from "../../src/rendering/flow-projector.js";

describe("节点阅读与子流程入口", () => {
  it("多个入口只用起点样式识别，不增加标签或预排高度", () => {
    const source = map();
    const overview = source.flows.find((flow) => flow.id === "overview")!;
    const rendered = new FlowProjector(
      new BusinessGraph({
        ...source,
        flows: [
          { ...overview, startsAt: ["child", "notes"] },
          ...source.flows.filter((flow) => flow.id !== overview.id),
        ],
      }),
    ).project("orders");
    const main = rendered.find((flow) => flow.id === "overview")!;
    expect(main.nodes.filter((node) => node.start).map((node) => node.id)).toEqual([
      "child",
      "notes",
    ]);
    expect(main.textLayer.match(/flow-card--start/gu)).toHaveLength(2);
    expect(main.textLayer).not.toContain('class="flow-card__start"');
    const original = new FlowProjector(new BusinessGraph(source)).project("orders");
    expect(main.layout.nodes).toEqual(
      original.find((flow) => flow.id === "overview")!.layout.nodes,
    );
    const singleResult = rendered.find((flow) => flow.id === "first")!;
    expect(singleResult.nodes[0]).toMatchObject({ start: true, kind: "outcome" });
    expect(singleResult.textLayer).toContain("flow-card--start");
    expect(singleResult.textLayer).not.toContain('data-i18n="viewer.start"');
    expect(singleResult.textLayer).toContain("flow-card--outcome");
  });

  it("卡片正文只为备注提供交互，子流程使用独立角标，多个目标留给用户选择", () => {
    const rendered = new FlowProjector(new BusinessGraph(map()))
      .project("orders")
      .find((flow) => flow.id === "overview")!;
    const card = (id: string) =>
      rendered.textLayer.match(
        new RegExp(`<article[^>]*data-node-id="${id}"[\\s\\S]*?<\\/article>`, "u"),
      )![0];
    const childOnly = card("child");
    expect(childOnly).toContain('data-action="open-child-flow"');
    expect(childOnly).toContain('aria-haspopup="menu"');
    expect(childOnly).toContain('class="flow-card__body"');
    expect(childOnly).not.toContain('class="flow-card__body" role="button"');
    expect(childOnly).not.toContain('aria-controls="node-details"');
    expect(
      rendered.nodes.find((node) => node.id === "child")?.childFlows.map((flow) => flow.id),
    ).toEqual(["first", "second"]);
    const notes = card("notes");
    expect(notes).toContain('class="flow-card__body" role="button"');
    expect(notes).not.toContain('data-action="open-child-flow"');
    const plain = card("done");
    expect(plain).not.toContain('role="button"');
    expect(plain).not.toContain('data-action="open-child-flow"');
  });
});

function map(): ValidatedBusinessMap {
  const node = (id: string): BusinessNode => ({
    id,
    kind: "scenario",
    name: id,
    summary: id,
    aliases: [],
    anchors: [],
    documentId: "orders",
    documentPath: "docs/business-map/orders.yaml",
  });
  const detail = (id: string): BusinessFlow => ({
    id,
    scenario: "child",
    name: id,
    summary: id,
    startsAt: ["done"],
    steps: [{ id: "done", kind: "outcome", name: "完成", summary: "处理结束" }],
    transitions: [],
    documentId: "orders",
    documentPath: "docs/business-map/orders.yaml",
  });
  return {
    source: { root: "/example", mapDirectory: "docs/business-map", documents: ["orders.yaml"] },
    documents: [],
    nodes: [node("overview"), node("child")],
    relations: [],
    flows: [
      {
        ...detail("overview"),
        scenario: "overview",
        startsAt: ["child"],
        steps: [
          {
            id: "child",
            kind: "action",
            name: "处理请求",
            summary: "选择对应路径",
            concept: "child",
          },
          {
            id: "notes",
            kind: "action",
            name: "核对结果",
            summary: "读取处理结果",
            notes: "只核对当前请求的结果。",
          },
          { id: "done", kind: "outcome", name: "完成", summary: "处理结束" },
        ],
        transitions: [
          { from: "child", to: "notes" },
          { from: "notes", to: "done" },
        ],
      },
      detail("first"),
      detail("second"),
    ],
  };
}
