import { describe, expect, it } from "vitest";
import type { BusinessFlow, BusinessNode, ValidatedBusinessMap } from "../../src/contracts/map.js";
import { BusinessGraph } from "../../src/map/business-graph.js";
import { MapProjector } from "../../src/rendering/map-projector.js";
import { conceptDetailLinks } from "../../src/rendering/viewer-navigation.js";

const metadata = { id: "orders", name: "订单示例" };

describe("业务流程投影", () => {
  it("从完整旅程开始，再按节点引用排列子流程", () => {
    const project = new MapProjector(new BusinessGraph(exampleMap())).viewerProject(metadata);

    expect(project.flows.map(({ id }) => id)).toEqual([
      "journey.flow",
      "checkout.flow",
      "shipping.flow",
    ]);
    expect(project.flows[0]?.nodes.map(({ name }) => name)).toEqual([
      "顾客下单",
      "仓库发货",
      "订单完成",
    ]);
    expect(project).not.toHaveProperty("views");
  });

  it("只把业务自己拥有的流程作为细图，不把归属或相关流程冒充执行顺序", () => {
    const graph = new BusinessGraph(exampleMap());

    expect(conceptDetailLinks(graph, "checkout", "journey.flow")).toEqual([
      { id: "checkout.flow", name: "顾客下单", summary: "顾客下单" },
    ]);
    expect(conceptDetailLinks(graph, "checkout", "checkout.flow")).toEqual([]);
    expect(conceptDetailLinks(graph, "domain", "journey.flow")).toEqual([]);
  });

  it("同一概念在不同步骤出现时使用本步骤备注，未写备注时沿用业务备注", () => {
    const map = exampleMap();
    const flow = map.flows.find(({ id }) => id === "journey.flow")!;
    const project = new MapProjector(
      new BusinessGraph({
        ...map,
        flows: map.flows.map((candidate) =>
          candidate.id === flow.id
            ? {
                ...flow,
                steps: flow.steps.map((step) =>
                  step.id === "checkout"
                    ? {
                        ...step,
                        notes: "从购物车确认商品与地址。",
                      }
                    : step,
                ),
              }
            : candidate,
        ),
      }),
    ).viewerProject(metadata);

    expect(project.flows[0]?.nodes.find(({ id }) => id === "checkout")).toMatchObject({
      notes: "从购物车确认商品与地址。",
      childFlows: [{ id: "checkout.flow", name: "顾客下单", summary: "顾客下单" }],
      start: true,
    });
    expect(project.flows[0]?.nodes.find(({ id }) => id === "shipping")?.notes).toBe(
      "付款成功后才能发货。",
    );
  });

  it("没有编写流程时不生成没有连线的分类图，也不推断业务先后", () => {
    const map = exampleMap();
    const projector = new MapProjector(new BusinessGraph({ ...map, flows: [] }));

    expect(projector.viewerProject(metadata).flows).toEqual([]);
    expect(projector.project(metadata).content).not.toContain("data-map-view=");
  });

  it("投影统计仍包含完整业务资料，渲染文字经过HTML转义", () => {
    const map = exampleMap();
    const projector = new MapProjector(
      new BusinessGraph({
        ...map,
        flows: map.flows.map((flow) => ({ ...flow, name: '<script>alert("x")</script>' })),
      }),
    );
    const projection = projector.project(metadata);

    expect(projection).toMatchObject({ nodeCount: 4, relationCount: 1, flowCount: 3 });
    expect(projection.content).not.toContain('<script>alert("x")</script>');
    expect(projection.content).toContain("\\u003cscript>");
    expect(projection.content).toBe(projector.project(metadata).content);
  });
});

function exampleMap(): ValidatedBusinessMap {
  return {
    source: { root: "/example", mapDirectory: "docs/business-map", documents: ["orders.yaml"] },
    documents: [],
    nodes: [
      node("domain", "domain", "订单业务"),
      node("journey", "scenario", "订单全流程"),
      node("checkout", "scenario", "顾客下单"),
      { ...node("shipping", "scenario", "仓库发货"), notes: "付款成功后才能发货。" },
    ],
    relations: [
      {
        from: "checkout",
        to: "domain",
        type: "part_of",
        summary: "下单归属购物业务。",
        documentId: "orders",
        documentPath: "docs/business-map/orders.yaml",
      },
    ],
    flows: [
      flow("checkout.flow", "checkout", "顾客下单"),
      flow("shipping.flow", "shipping", "仓库发货"),
      {
        ...flow("journey.flow", "journey", "订单全流程"),
        startsAt: ["checkout"],
        steps: [
          {
            id: "checkout",
            kind: "action",
            name: "顾客下单",
            summary: "确认商品并付款。",
            concept: "checkout",
          },
          {
            id: "shipping",
            kind: "action",
            name: "仓库发货",
            summary: "商品交给承运商。",
            concept: "shipping",
          },
          { id: "done", kind: "outcome", name: "订单完成", summary: "顾客收到商品。" },
        ],
        transitions: [
          { from: "checkout", to: "shipping" },
          { from: "shipping", to: "done" },
        ],
      },
    ],
  };
}

function node(id: string, kind: BusinessNode["kind"], name: string): BusinessNode {
  return {
    id,
    kind,
    name,
    summary: name,
    aliases: [],
    anchors: [],
    documentId: "orders",
    documentPath: "docs/business-map/orders.yaml",
  };
}

function flow(id: string, scenario: string, name: string): BusinessFlow {
  return {
    id,
    scenario,
    name,
    summary: name,
    startsAt: ["start"],
    steps: [
      { id: "start", kind: "action", name, summary: name, concept: scenario },
      { id: "done", kind: "outcome", name: "完成", summary: "本环节结束。" },
    ],
    transitions: [{ from: "start", to: "done" }],
    documentId: "orders",
    documentPath: "docs/business-map/orders.yaml",
  };
}
