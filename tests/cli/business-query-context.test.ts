import { afterEach, expect, it } from "vitest";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { runCli } from "../../src/cli/run-cli.js";
import {
  createMapRepository,
  flow,
  flowStep,
  node,
  relation,
  removeRepository,
  transition,
} from "../support/map-repository.js";

const repositories: string[] = [];
afterEach(async () => {
  await Promise.all(repositories.splice(0).map(removeRepository));
});

it("搜索业务直接给出维护位置、代码入口和有依据的协作关系，不附全库文件目录", async () => {
  const repo = await repository();
  const result = await runCli(["search", "下单", "--flows", "--repo", repo]);
  expect(result.exitCode, result.stdout).toBe(0);
  const { repository: source, data } = JSON.parse(result.stdout);
  expect(source).toEqual({ root: repo });
  const hit = data.results[0];
  expect(hit).toMatchObject({
    id: "checkout.flow",
    map: { file: "docs/business-map/orders.yaml" },
  });
  const lines = (await readFile(path.join(repo, hit.map.file), "utf8")).split("\n");
  expect(lines[hit.map.line - 1]).toContain("checkout.flow");
  expect(data.concepts.find((item: { id: string }) => item.id === "checkout")).toMatchObject({
    anchors: [{ file: "src/checkout.ts", value: "Checkout.place", resolution: "hint" }],
  });
  expect(data.relations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ from: "checkout", type: "writes", to: "order" }),
      expect.objectContaining({ from: "dispatch", type: "reads", to: "order" }),
      expect.objectContaining({ from: "checkout", type: "publishes", to: "order-created" }),
      expect.objectContaining({ from: "notify", type: "consumes", to: "order-created" }),
    ]),
  );
  expect(data.concepts.map((item: { id: string }) => item.id)).not.toContain("unrelated");
  expect(data.flows).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "dispatch.flow",
        references: [expect.objectContaining({ concept: "order", step: "read" })],
      }),
    ]),
  );
  expect(new Set(data.concepts.map((item: { id: string }) => item.id)).size).toBe(
    data.concepts.length,
  );
  expect(data.scope).toBe("recorded");
});

it("明确读取流程才展开步骤，概念与锚点只返回一次", async () => {
  const repo = await repository();
  const result = await runCli(["flows", "checkout.flow", "--repo", repo]);
  expect(result.exitCode, result.stdout).toBe(0);
  const { data } = JSON.parse(result.stdout);
  expect(data.selected.steps.find((step: { id: string }) => step.id === "place").concept).toBe(
    "checkout",
  );
  expect(data.selected.steps.find((step: { id: string }) => step.id === "again").concept).toBe(
    "checkout",
  );
  expect(data.concepts.filter((item: { id: string }) => item.id === "checkout")).toHaveLength(1);
  expect(data.selected.transitions).toContainEqual({ from: "place", to: "again" });
  expect(
    data.selected.steps.find((step: { id: string }) => step.id === "place").map.line,
  ).toBeGreaterThan(0);
});

it("已知业务可直查相关流程引用和规则的其他使用方，无需先搜关键词", async () => {
  const repo = await repository();
  const result = await runCli(["context", "checkout", "--repo", repo]);
  expect(result.exitCode, result.stdout).toBe(0);
  const { data } = JSON.parse(result.stdout);
  expect(data.selected.id).toBe("checkout");
  expect(data.relations).toContainEqual(
    expect.objectContaining({ from: "refund", type: "constrained_by", to: "approval" }),
  );
  expect(data.flows.find((item: { id: string }) => item.id === "checkout.flow")).not.toHaveProperty(
    "steps",
  );
  expect(
    data.flows.find((item: { id: string }) => item.id === "checkout.flow").references,
  ).toHaveLength(2);
  expect(data.concepts.some((item: { id: string }) => item.id === "checkout")).toBe(false);
});

async function repository(): Promise<string> {
  const root = await createMapRepository({
    "orders.yaml": {
      schemaVersion: 1,
      map: { id: "orders", title: "订单", summary: "下单与履约" },
      nodes: [
        node("checkout", "scenario", "下单", {
          anchors: [
            {
              kind: "symbol",
              file: "src/checkout.ts",
              value: "Checkout.place",
              description: "创建订单。",
            },
          ],
        }),
        node("dispatch", "scenario", "仓库发货"),
        node("notify", "scenario", "通知客户"),
        node("refund", "scenario", "退款审批"),
        node("order", "data", "订单"),
        node("order-created", "interface", "订单创建事件"),
        node("approval", "invariant", "审批规则"),
      ],
      relations: [
        relation("checkout", "writes", "order"),
        relation("dispatch", "reads", "order"),
        relation("checkout", "publishes", "order-created"),
        relation("notify", "consumes", "order-created"),
        relation("checkout", "constrained_by", "approval"),
        relation("refund", "constrained_by", "approval"),
      ],
      flows: [
        {
          ...flow(
            "checkout.flow",
            "checkout",
            "place",
            [
              flowStep("place", "action", "创建订单", "checkout"),
              flowStep("again", "action", "确认订单", "checkout"),
              flowStep("done", "outcome", "订单已保存"),
            ],
            [transition("place", "again"), transition("again", "done")],
          ),
          name: "下单",
        },
        {
          ...flow(
            "dispatch.flow",
            "dispatch",
            "read",
            [
              flowStep("read", "action", "读取待发订单", "order"),
              flowStep("done", "outcome", "已发货"),
            ],
            [transition("read", "done")],
          ),
          name: "仓库发货",
        },
      ],
    },
    "unrelated.yaml": {
      schemaVersion: 1,
      map: { id: "unrelated", title: "其他", summary: "无关业务" },
      nodes: [node("unrelated", "scenario", "维护域名")],
      relations: [],
    },
  });
  repositories.push(root);
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "src/checkout.ts"), "export class Checkout { place() {} }\n");
  return root;
}
