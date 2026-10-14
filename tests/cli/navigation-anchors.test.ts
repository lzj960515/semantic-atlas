import { afterEach, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { runCli } from "../../src/cli/run-cli.js";
import { createMapRepository, node, removeRepository } from "../support/map-repository.js";

const repositories: string[] = [];

afterEach(async () => {
  await Promise.all(repositories.splice(0).map(removeRepository));
});

describe("file-bound symbol navigation", () => {
  it("returns specific methods with their owning files alongside existing anchors", async () => {
    const anchors = [
      { kind: "symbol", file: "src/orders.ts", value: "Orders.create", description: "创建订单。" },
      {
        kind: "symbol",
        file: "src/refunds.py",
        value: "Refunds.create",
        description: "创建退款。",
      },
      { kind: "symbol", value: "PLACE_ORDER", description: "既有符号线索。" },
      { kind: "file", value: "src/order.ts", description: "订单数据类型。" },
      { kind: "directory", value: "src/orders", description: "订单领域。" },
      { kind: "document", value: "docs/orders.md", description: "订单规则。" },
      { kind: "search", value: "order placed", description: "订单事件词汇。" },
    ];
    const repositoryRoot = await repositoryWithAnchors(anchors);

    const result = await runCli(["context", "orders.create", "--repo", repositoryRoot]);

    expect(result.exitCode, result.stdout).toBe(0);
    expect(JSON.parse(result.stdout).data.selected.anchors).toEqual(anchors);
    const output = path.join(repositoryRoot, "map.html");
    const rendered = await runCli(["render", "--repo", repositoryRoot, "--output", output]);
    expect(rendered.exitCode, rendered.stdout).toBe(0);
    const html = await readFile(output, "utf8");
    expect(html).toContain('"file":"src/orders.ts"');
    expect(html).toContain('"value":"Orders.create"');
  });

  it.each(["../outside.ts", "/absolute.ts", "src/../orders.ts", "src\\orders.ts"])(
    "rejects a symbol bound to the non-normalized repository path %s",
    async (file) => {
      const repositoryRoot = await repositoryWithAnchors([
        { kind: "symbol", file, value: "Orders.create", description: "创建订单。" },
      ]);

      const result = await runCli(["validate", "--repo", repositoryRoot]);

      expect(result.exitCode).toBe(1);
      expect(JSON.parse(result.stdout).error.issues).toContainEqual(
        expect.objectContaining({
          code: "ANCHOR_PATH_INVALID",
          path: "nodes.orders.create.anchors.0.file",
        }),
      );
    },
  );

  it.each(["file", "directory", "document", "search"])(
    "keeps the file binding exclusive to symbols rather than %s anchors",
    async (kind) => {
      const repositoryRoot = await repositoryWithAnchors([
        { kind, file: "src/orders.ts", value: "src/orders.ts", description: "订单入口。" },
      ]);

      const result = await runCli(["validate", "--repo", repositoryRoot]);

      expect(result.exitCode).toBe(1);
      expect(JSON.parse(result.stdout).error.issues).toContainEqual(
        expect.objectContaining({ code: "DOCUMENT_SCHEMA_INVALID" }),
      );
    },
  );
});

async function repositoryWithAnchors(anchors: readonly Record<string, unknown>[]): Promise<string> {
  const repositoryRoot = await createMapRepository({
    "orders.yaml": {
      schemaVersion: 1,
      map: { id: "orders", title: "订单", summary: "订单创建与管理。" },
      nodes: [node("orders.create", "operation", "创建订单", { anchors })],
      relations: [],
    },
  });
  repositories.push(repositoryRoot);
  return repositoryRoot;
}
