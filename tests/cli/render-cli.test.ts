import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../../src/cli/run-cli.js";
import {
  createMapRepository,
  node,
  relation,
  removeRepository,
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
            anchors: [{
              kind: "directory",
              value: "src/orders",
              description: "Likely source area for order behavior.",
            }],
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
      ),
    });
    const firstOutput = path.join(repositoryRoot, "artifacts", "first.html");
    const secondOutput = path.join(repositoryRoot, "artifacts", "second.html");

    const first = await runCli(["render", "--repo", repositoryRoot, "--output", firstOutput]);
    const second = await runCli(["render", "--repo", repositoryRoot, "--output", secondOutput]);

    expect(first.exitCode).toBe(0);
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
      },
    });

    const firstProjection = await readFile(firstOutput, "utf8");
    const secondProjection = await readFile(secondOutput, "utf8");
    expect(firstProjection).toBe(secondProjection);
    expect(firstProjection).toContain("<svg");
    expect(firstProjection).toContain('data-channel="containment"');
    expect(firstProjection).toContain('data-channel="directed-relation"');
    expect(firstProjection).toContain('data-relation-id="commerce.orders--part_of--commerce"');
    expect(firstProjection).toMatch(/marker-end="url\(#relation-arrow-[^)]+\)"/u);
    expect(firstProjection).toContain("Likely source area for order behavior.");
    expect(firstProjection).toContain("src/orders");
    expect(firstProjection).toContain('data-viewer-mode="export"');
    expect(firstProjection).toContain('id="project-select"');
    expect(firstProjection).toContain('id="domain-select"');
    expect(firstProjection).toContain('data-action="zoom-in"');
    expect(firstProjection).toContain('data-action="fit"');
    expect(firstProjection).toContain("Containment relationships");
    expect(firstProjection).toContain("Directed business relationships");
    expect(firstProjection).toContain("<script");
    expect(firstProjection).not.toContain("__vite_ssr_import");
    expect(firstProjection).not.toContain("Business relationships, made visible.");
  });

  it("wraps wide-character labels within the card and includes every line in its height", async () => {
    const nodeId = "commerce.cross-border-fulfillment";
    const repositoryRoot = await trackedRepository({
      "commerce.yaml": mapDocument(
        "commerce",
        [node(nodeId, "capability", "跨境订单履约协作与售后退款处理业务能力中心平台服务", {
          summary: "协调跨境订单履约协作与售后退款处理业务能力中心平台服务的完整业务结果。",
        })],
        [],
      ),
    });
    const outputPath = path.join(repositoryRoot, "artifacts", "wide-character.html");

    const result = await runCli([
      "render",
      "--repo",
      repositoryRoot,
      "--output",
      outputPath,
    ]);

    expect(result.exitCode).toBe(0);
    const projection = await readFile(outputPath, "utf8");
    const nodeMarkup = extractNodeMarkup(projection, nodeId);
    const titleMarkup = extractTextMarkup(nodeMarkup, "node-card__title");
    const summaryMarkup = extractTextMarkup(nodeMarkup, "node-card__summary");
    const cardHeight = extractCardHeight(nodeMarkup);

    expect(titleMarkup.match(/<tspan /gu)).toHaveLength(2);
    expect(summaryMarkup.match(/<tspan /gu)).toHaveLength(2);
    expect(cardHeight).toBeGreaterThan(124);
  });

  it("reports an actionable output failure after successfully loading the graph", async () => {
    const repositoryRoot = await trackedRepository({
      "commerce.yaml": mapDocument(
        "commerce",
        [node("commerce", "domain", "Commerce")],
        [],
      ),
    });

    const result = await runCli([
      "render",
      "--repo",
      repositoryRoot,
      "--output",
      repositoryRoot,
    ]);

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

    const result = await runCli([
      "render",
      "--repo",
      repositoryRoot,
      "--output",
      outputPath,
    ]);

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
  };
}

function extractNodeMarkup(projection: string, nodeId: string): string {
  const escapedNodeId = nodeId.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = projection.match(new RegExp(
    `<g class="node-card[^>]*data-node-id="${escapedNodeId}"[\\s\\S]*?</g>`,
    "u",
  ));
  expect(match, `Expected rendered node ${nodeId}`).not.toBeNull();
  return match?.[0] ?? "";
}

function extractTextMarkup(nodeMarkup: string, className: string): string {
  const match = nodeMarkup.match(new RegExp(
    `<text class="${className}"[^>]*>[\\s\\S]*?</text>`,
    "u",
  ));
  expect(match, `Expected rendered text ${className}`).not.toBeNull();
  return match?.[0] ?? "";
}

function extractCardHeight(nodeMarkup: string): number {
  const match = nodeMarkup.match(/<rect class="node-card__surface"[^>]*height="([^"]+)"/u);
  expect(match, "Expected rendered node card surface").not.toBeNull();
  return Number(match?.[1]);
}
