import { afterEach, describe, expect, it } from "vitest";
import ELK from "elkjs/lib/elk.bundled.js";
import { layoutDiagram } from "../../src/rendering/viewer-layout.js";
import { runCli } from "../../src/cli/run-cli.js";
import { MapApplication } from "../../src/application/map-application.js";
import {
  createMapRepository,
  flowStep,
  node,
  removeRepository,
  transition,
  type TestMapDocument,
} from "../support/map-repository.js";

const repositories: string[] = [];
afterEach(async () => {
  await Promise.all(repositories.splice(0).map(removeRepository));
});

describe("多个业务入口与独立并行后续", () => {
  it("保存目标和定时触发可汇入采集，收录与通知并行，暂停保留独立入口", async () => {
    const repository = await createRepository(monitoring());
    const checked = await runCli(["validate", "--repo", repository]);
    expect(checked.exitCode, checked.stdout).toBe(0);

    const selected = JSON.parse(
      (await runCli(["flows", "monitoring.flow", "--repo", repository])).stdout,
    ).data.selected;
    expect(selected.startsAt).toEqual(["configure", "scheduled", "pause"]);
    expect(selected.steps.map(({ id }: { id: string }) => id)).toHaveLength(8);
    expect(selected.transitions).toEqual(
      expect.arrayContaining([
        { from: "collected", to: "save" },
        { from: "collected", to: "notify" },
      ]),
    );
    const context = JSON.parse(
      (await runCli(["context", "monitoring", "--repo", repository])).stdout,
    );
    expect(context.data.flows[0]).toMatchObject({ id: "monitoring.flow", scenario: "monitoring" });
    expect(context.data.flows[0]).not.toHaveProperty("steps");

    const result = await new MapApplication().viewerProject(repository);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("业务图投影失败");
    const diagram = result.viewerProject.flows[0]!;
    expect(diagram.nodes.filter(({ start }) => start).map(({ id }) => id)).toEqual([
      "configure",
      "pause",
      "scheduled",
    ]);
    expect(diagram.nodes).toHaveLength(8);
    expect(diagram.layout.edges).toHaveLength(6);
    expect(diagram.svg).toContain('data-flow-transition="collected--save"');
    expect(diagram.svg).toContain('data-flow-transition="collected--notify"');
    expect(diagram.textLayer.match(/flow-card--start/gu)).toHaveLength(3);
    const layout = await layoutDiagram(
      new ELK.default({ algorithms: ["layered"] }),
      diagram.layout,
    );
    for (const position of layout.nodes) {
      expect([position.x, position.y, position.width, position.height].every(Number.isFinite)).toBe(
        true,
      );
    }
    const rendered = await new MapApplication().project(repository);
    expect(rendered.ok).toBe(true);
    if (!rendered.ok) throw new Error("业务图导出失败");
    expect(rendered.projection.content).toContain('data-flow-transition="collected--notify"');
    expect(rendered.projection.content).toContain('data-flow-step-id="pause"');
  });

  it("报告重复与不存在的起点、不受入口覆盖的步骤，以及误写在动作上的条件", async () => {
    const base = monitoring();
    const original = base.flows![0]!;
    const repository = await createRepository({
      ...base,
      flows: [
        {
          ...original,
          startsAt: ["configure", "configure", "missing"],
          transitions: [
            ...(original.transitions as Record<string, unknown>[]),
            transition("save", "saved", "应使用判断节点"),
          ],
        },
      ],
    });
    const result = await runCli(["validate", "--repo", repository]);
    expect(result.exitCode).toBe(1);
    expect(
      JSON.parse(result.stdout).error.issues.map(({ code }: { code: string }) => code),
    ).toEqual(
      expect.arrayContaining([
        "DUPLICATE_FLOW_START_STEP_ID",
        "FLOW_START_STEP_MISSING",
        "FLOW_STEP_UNREACHABLE",
        "FLOW_ACTION_BRANCH_INVALID",
      ]),
    );
  });
});

async function createRepository(document: TestMapDocument): Promise<string> {
  const repository = await createMapRepository({ "monitoring.yaml": document });
  repositories.push(repository);
  return repository;
}

function monitoring(): TestMapDocument {
  return {
    schemaVersion: 1,
    map: { id: "monitoring", title: "店铺监控", summary: "配置、周期运行与暂停。" },
    nodes: [node("monitoring", "scenario", "店铺监控")],
    relations: [],
    flows: [
      {
        id: "monitoring.flow",
        scenario: "monitoring",
        name: "店铺监控",
        summary: "不同入口启动采集，收录与通知独立处理，暂停不会伪装成采集分支。",
        startsAt: ["configure", "scheduled", "pause"],
        steps: [
          flowStep("configure", "action", "店铺保存监控目标"),
          flowStep("scheduled", "action", "周期监控到期"),
          flowStep("collected", "action", "取得本轮帖子"),
          flowStep("save", "action", "建立本店帖子关系"),
          flowStep("notify", "outcome", "后台处理新帖提醒"),
          flowStep("pause", "action", "店铺暂停监控"),
          flowStep("paused", "outcome", "后续调度跳过本店"),
          flowStep("saved", "outcome", "帖子在本店可读"),
        ],
        transitions: [
          transition("configure", "collected"),
          transition("scheduled", "collected"),
          transition("collected", "save"),
          transition("collected", "notify"),
          transition("save", "saved"),
          transition("pause", "paused"),
        ],
      },
    ],
  };
}
