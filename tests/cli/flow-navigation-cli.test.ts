import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../../src/cli/run-cli.js";
import {
  createMapRepository,
  flow,
  flowStep,
  node,
  removeRepository,
  transition,
} from "../support/map-repository.js";
import { MapApplication } from "../../src/application/map-application.js";

const repositories: string[] = [];
afterEach(async () => {
  await Promise.all(repositories.splice(0).map(removeRepository));
});

describe("按业务直接定位流程与代码", () => {
  it("搜索子业务后直接读取当前流程和方法锚点，无需先读总览", async () => {
    const repo = await repository();
    const searched = await runCli(["search", "支付订单", "--flows", "--repo", repo]);
    expect(searched.exitCode, searched.stdout).toBe(0);
    const match = JSON.parse(searched.stdout).data.results[0];
    expect(match).toMatchObject({ id: "payment.flow", name: "支付订单", scenarioId: "payment" });

    const direct = await runCli(["flows", match.id, "--repo", repo]);
    expect(direct.exitCode, direct.stdout).toBe(0);
    const selected = JSON.parse(direct.stdout).data.selected;
    expect(selected).toMatchObject({
      id: "payment.flow",
      startsAt: ["charge"],
      parents: [{ id: "journey.flow" }],
    });
    expect(
      selected.steps.find((step: { id: string }) => step.id === "charge").concept.anchors,
    ).toEqual([
      {
        kind: "symbol",
        file: "src/payments.ts",
        value: "Payments.charge",
        description: "向渠道发起付款。",
      },
    ]);
    expect(selected.transitions).toEqual([{ from: "charge", to: "done" }]);
  });

  it("业务步骤不单独成图时，也能直接找到包含它的流程", async () => {
    const repo = await repository();
    const result = await runCli(["search", "发起付款", "--flows", "--repo", repo]);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).data.results[0]).toMatchObject({
      id: "payment.flow",
      matchedFields: ["step"],
      matchedSteps: [{ id: "charge", name: "发起付款" }],
    });
  });

  it("人和AI使用相同的流程目录，只有实际引用才形成子流程", async () => {
    const repo = await repository();
    const list = JSON.parse((await runCli(["flows", "--repo", repo])).stdout).data.navigation;
    const viewed = await new MapApplication().viewerProject(repo);
    expect(viewed.ok).toBe(true);
    if (!viewed.ok) throw new Error("Viewer projection failed");
    expect(viewed.viewerProject.navigation).toEqual(list);
    expect(list.roots).toEqual(["journey.flow"]);
    expect(
      list.flows.find((flow: { id: string }) => flow.id === "journey.flow").childFlows,
    ).toEqual(["payment.flow"]);
  });

  it("未知流程返回明确错误，不猜测相似流程；搜索无匹配时返回空结果", async () => {
    const repo = await repository();
    const missing = await runCli(["flows", "unknown.flow", "--repo", repo]);
    expect(missing.exitCode).toBe(1);
    expect(JSON.parse(missing.stdout)).toMatchObject({
      command: "flows",
      error: { code: "FLOW_NOT_FOUND", flowId: "unknown.flow" },
    });
    const empty = await runCli(["search", "zzzzzzzzzz", "--flows", "--repo", repo]);
    expect(JSON.parse(empty.stdout).data.results).toEqual([]);
  });
});

async function repository(): Promise<string> {
  const root = await createMapRepository({
    "payments.yaml": {
      schemaVersion: 1,
      map: { id: "payments", title: "订单", summary: "订单旅程与付款。" },
      nodes: [
        node("journey", "scenario", "订单旅程"),
        node("payment", "scenario", "支付订单"),
        node("charge", "operation", "发起付款", {
          anchors: [
            {
              kind: "symbol",
              file: "src/payments.ts",
              value: "Payments.charge",
              description: "向渠道发起付款。",
            },
          ],
        }),
      ],
      relations: [],
      flows: [
        {
          ...flow(
            "journey.flow",
            "journey",
            "payment",
            [
              flowStep("payment", "action", "支付订单", "payment"),
              flowStep("done", "outcome", "订单完成"),
            ],
            [transition("payment", "done")],
          ),
          name: "订单旅程",
        },
        {
          ...flow(
            "payment.flow",
            "payment",
            "charge",
            [
              flowStep("charge", "action", "发起付款", "charge"),
              flowStep("done", "outcome", "付款完成"),
            ],
            [transition("charge", "done")],
          ),
          name: "支付订单",
        },
      ],
    },
  });
  repositories.push(root);
  return root;
}
