import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../../src/cli/run-cli.js";
import {
  createMapRepository,
  flow,
  flowStep,
  node,
  relation,
  removeRepository,
  transition,
  type TestMapDocument,
} from "../support/map-repository.js";

const repositories: string[] = [];

afterEach(async () => {
  await Promise.all(repositories.splice(0).map(removeRepository));
});

describe("semantic-atlas render", () => {
  it("writes a repeatable, accessible static projection of the validated graph", async () => {
    const repositoryRoot = await trackedRepository({
      "commerce.yaml": mapDocument(
        "commerce",
        [
          node("commerce", "domain", "Commerce"),
          node("commerce.orders", "capability", "Orders", {
            anchors: [
              {
                kind: "directory",
                value: "src/orders",
                description: "Likely source area for order behavior.",
              },
            ],
          }),
          node("commerce.orders.place-order", "scenario", "Place order"),
          node("commerce.orders.create-order", "operation", "Create order"),
          node("commerce.orders.order", "data", "Order"),
        ],
        [
          relation("commerce.orders", "part_of", "commerce"),
          relation("commerce.orders.place-order", "part_of", "commerce.orders"),
          relation("commerce.orders.create-order", "part_of", "commerce.orders.place-order"),
          relation("commerce.orders.order", "part_of", "commerce.orders"),
          relation("commerce.orders.place-order", "invokes", "commerce.orders.create-order"),
          relation("commerce.orders.create-order", "writes", "commerce.orders.order"),
        ],
        [
          flow(
            "commerce.orders.place-order-flow",
            "commerce.orders.place-order",
            "check-inventory",
            [
              flowStep("check-inventory", "decision", "Is inventory available?"),
              flowStep("create-order", "action", "Create order", "commerce.orders.create-order"),
              flowStep("order-created", "outcome", "Order created", "commerce.orders.order"),
              flowStep("order-not-created", "outcome", "Order not created"),
            ],
            [
              transition("check-inventory", "create-order", "available"),
              transition("check-inventory", "order-not-created", "unavailable"),
              transition("create-order", "order-created"),
            ],
          ),
        ],
      ),
    });
    const firstOutput = path.join(repositoryRoot, "artifacts", "first.html");
    const secondOutput = path.join(repositoryRoot, "artifacts", "second.html");

    const first = await runCli(["render", "--repo", repositoryRoot, "--output", firstOutput]);
    const second = await runCli(["render", "--repo", repositoryRoot, "--output", secondOutput]);

    expect(first.exitCode).toBe(0);
    expect(second.exitCode).toBe(0);
    expect(first.stderr).toBe("");
    expect(JSON.parse(first.stdout)).toMatchObject({
      schemaVersion: 1,
      ok: true,
      command: "render",
      repository: { root: repositoryRoot },
      data: {
        format: "html",
        outputPath: firstOutput,
        nodeCount: 5,
        relationCount: 6,
        flowCount: 1,
      },
    });

    const firstProjection = await readFile(firstOutput, "utf8");
    const secondProjection = await readFile(secondOutput, "utf8");
    expect(firstProjection).toBe(secondProjection);
    expect(firstProjection).toContain("<svg");
    expect(firstProjection).toContain('data-viewer-mode="export"');
    expect(firstProjection).toContain('id="project-select"');
    expect(firstProjection).toContain('id="diagram-select"');
    expect(firstProjection).toContain('id="back-button"');
    expect(firstProjection).toContain('data-flow-id="commerce.orders.place-order-flow"');
    expect(firstProjection).toContain('data-flow-step-id="check-inventory"');
    expect(firstProjection).toContain('data-action="zoom-in"');
    expect(firstProjection).toContain('data-action="fit"');
    expect(firstProjection).not.toContain("data-map-view=");
    expect(firstProjection).not.toContain("src/orders");
    expect(firstProjection).toContain("<script");
    expect(firstProjection).not.toContain("__vite_ssr_import");
    expect(firstProjection).not.toContain("Business relationships, made visible.");
  });

  it("preserves complete Chinese text for browser wrapping and translation", async () => {
    const nodeId = "commerce.cross-border-fulfillment";
    const repositoryRoot = await trackedRepository({
      "commerce.yaml": mapDocument(
        "commerce",
        [
          node(nodeId, "scenario", "跨境订单履约协作与售后退款处理业务能力中心平台服务", {
            summary: "协调跨境订单履约协作与售后退款处理业务能力中心平台服务的完整业务结果。",
          }),
        ],
        [],
        [
          flow(
            "commerce.fulfillment.flow",
            nodeId,
            "start",
            [
              {
                id: "start",
                kind: "action",
                name: "跨境订单履约协作与售后退款处理业务能力中心平台服务",
                summary: "协调跨境订单履约协作与售后退款处理业务能力中心平台服务的完整业务结果。",
                concept: nodeId,
              },
              flowStep("done", "outcome", "完成"),
            ],
            [transition("start", "done")],
          ),
        ],
      ),
    });
    const outputPath = path.join(repositoryRoot, "artifacts", "wide-character.html");

    const result = await runCli(["render", "--repo", repositoryRoot, "--output", outputPath]);

    expect(result.exitCode).toBe(0);
    const projection = await readFile(outputPath, "utf8");
    expect(projection).toContain("跨境订单履约协作与售后退款处理业务能力中心平台服务");
    expect(projection).toContain(
      "协调跨境订单履约协作与售后退款处理业务能力中心平台服务的完整业务结果。",
    );
    expect(projection).toContain('class="flow-card__title-text"');
    expect(projection).not.toContain("<text");
  });

  it("reports an actionable output failure after successfully loading the graph", async () => {
    const repositoryRoot = await trackedRepository({
      "commerce.yaml": mapDocument("commerce", [node("commerce", "domain", "Commerce")], []),
    });

    const result = await runCli(["render", "--repo", repositoryRoot, "--output", repositoryRoot]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      schemaVersion: 1,
      ok: false,
      command: "render",
      repository: { root: repositoryRoot },
      error: {
        code: "OUTPUT_FAILED",
      },
    });
  });

  it("rejects an invalid graph through the shared validation path before writing output", async () => {
    const repositoryRoot = await trackedRepository({
      "commerce.yaml": mapDocument(
        "commerce",
        [node("commerce", "domain", "Commerce")],
        [relation("commerce.orders", "part_of", "commerce")],
      ),
    });
    const outputPath = path.join(repositoryRoot, "semantic-atlas.html");

    const result = await runCli(["render", "--repo", repositoryRoot, "--output", outputPath]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      schemaVersion: 1,
      ok: false,
      command: "render",
      error: {
        code: "MAP_DOCUMENT_INVALID",
        issues: [{ code: "RELATION_ENDPOINT_MISSING" }],
      },
    });
    await expect(readFile(outputPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });
});

async function trackedRepository(
  documents: Readonly<Record<string, TestMapDocument | string>>,
): Promise<string> {
  const repositoryRoot = await createMapRepository(documents);
  repositories.push(repositoryRoot);
  return repositoryRoot;
}

function mapDocument(
  id: string,
  nodes: readonly Record<string, unknown>[],
  relations: readonly Record<string, unknown>[],
  flows: readonly Record<string, unknown>[] = [],
): TestMapDocument {
  return {
    schemaVersion: 1,
    map: {
      id,
      title: id,
      summary: `${id} map.`,
    },
    nodes,
    relations,
    flows,
  };
}
