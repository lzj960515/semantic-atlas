import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { BusinessFlow, BusinessNode, BusinessRelation } from "../../src/contracts/map.js";
import { QuerySourceLocator } from "../../src/query/query-source-locator.js";
import { createMapRepository, removeRepository } from "../support/map-repository.js";

const repositories: string[] = [];
const documentPath = "docs/business-map/orders.yaml";

afterEach(async () => {
  await Promise.all(repositories.splice(0).map(removeRepository));
});

describe("query source locations", () => {
  it("locates YAML identities rather than repeated prose, property order, or step order", async () => {
    const repositoryRoot = await repository(`nodes:
    - name: "orders.create appears here before its identity"
      'id': ' orders.create '
    - { id: orders.archive }
flows:
  - id: orders.other
    steps: [{id: start}]
  - name: Create orders
    id: "orders.create-flow"
    steps:
      - {id: finish, kind: outcome}
      - name: Start
        id: start
relations:
  - from: orders.create
    type: reads
    to: orders.record
  - summary: "orders.create writes orders.record"
    to: orders.record
    type: 'writes'
    "from": "orders.create"
`);
    const locator = new QuerySourceLocator(repositoryRoot);
    const flow = businessFlow("orders.create-flow");

    expect(await locator.node(businessNode("orders.create"))).toEqual({
      file: documentPath,
      line: 3,
      column: 7,
    });
    expect(await locator.flow(flow)).toEqual({ file: documentPath, line: 9, column: 5 });
    expect(await locator.step(flow, "start")).toEqual({
      file: documentPath,
      line: 13,
      column: 9,
    });
    expect(await locator.step(businessFlow("orders.other"), "start")).toEqual({
      file: documentPath,
      line: 7,
      column: 14,
    });
    expect(await locator.relation(businessRelation())).toEqual({
      file: documentPath,
      line: 21,
      column: 5,
    });
  });

  it("locates identities in a one-line YAML document", async () => {
    const repositoryRoot = await repository(
      "{nodes: [{id: orders.create}], flows: [{id: orders.create-flow, steps: [{id: start}]}], relations: [{from: orders.create, type: writes, to: orders.record}]}\n",
    );
    const locator = new QuerySourceLocator(repositoryRoot);

    expect(await locator.node(businessNode("orders.create"))).toEqual({
      file: documentPath,
      line: 1,
      column: 11,
    });
    expect(await locator.flow(businessFlow("orders.create-flow"))).toEqual({
      file: documentPath,
      line: 1,
      column: 41,
    });
    expect(await locator.step(businessFlow("orders.create-flow"), "start")).toEqual({
      file: documentPath,
      line: 1,
      column: 74,
    });
    expect(await locator.relation(businessRelation())).toEqual({
      file: documentPath,
      line: 1,
      column: 102,
    });
  });

  it("does not assign a location when the current declaration is missing or ambiguous", async () => {
    const repositoryRoot = await repository(`nodes: [{id: orders.create}, {id: orders.create}]
flows:
  - id: orders.create-flow
    steps: [{id: start}, {id: start}]
relations:
  - {from: orders.create, type: writes, to: orders.record}
  - {from: orders.create, type: writes, to: orders.record}
`);
    const locator = new QuerySourceLocator(repositoryRoot);

    expect(await locator.node(businessNode("orders.create"))).toBeUndefined();
    expect(await locator.node(businessNode("orders.missing"))).toBeUndefined();
    expect(await locator.flow(businessFlow("orders.missing"))).toBeUndefined();
    expect(await locator.step(businessFlow("orders.create-flow"), "start")).toBeUndefined();
    expect(await locator.relation(businessRelation())).toBeUndefined();
    expect(
      await locator.node({ ...businessNode("orders.create"), documentPath: "missing.yaml" }),
    ).toBeUndefined();
  });

  it("returns no guessed positions for malformed YAML or ambiguous flow owners", async () => {
    const repositoryRoot = await repository("nodes: [\n");
    expect(
      await new QuerySourceLocator(repositoryRoot).node(businessNode("orders.create")),
    ).toBeUndefined();

    await writeFile(
      path.join(repositoryRoot, documentPath),
      "flows: [{id: orders.create-flow, steps: [{id: start}]}, {id: orders.create-flow, steps: [{id: start}]}]\n",
    );
    const locator = new QuerySourceLocator(repositoryRoot);
    expect(await locator.flow(businessFlow("orders.create-flow"))).toBeUndefined();
    expect(await locator.step(businessFlow("orders.create-flow"), "start")).toBeUndefined();
  });

  it("shares parsed positions within one query and derives fresh positions for the next query", async () => {
    const source = "nodes: [{id: orders.create}]\nflows: [{id: orders.create-flow}]\n";
    const repositoryRoot = await repository(source);
    const firstQuery = new QuerySourceLocator(repositoryRoot);
    expect(await firstQuery.node(businessNode("orders.create"))).toMatchObject({ line: 1 });

    await writeFile(path.join(repositoryRoot, documentPath), `\n\n${source}`);

    expect(await firstQuery.flow(businessFlow("orders.create-flow"))).toMatchObject({ line: 2 });
    const nextQuery = new QuerySourceLocator(repositoryRoot);
    expect(await nextQuery.node(businessNode("orders.create"))).toMatchObject({ line: 3 });
    expect(await nextQuery.flow(businessFlow("orders.create-flow"))).toMatchObject({ line: 4 });
  });

  it("distinguishes file entries, missing targets, and unconfirmed symbol hints", async () => {
    const repositoryRoot = await repository("nodes: []\n");
    await mkdir(path.join(repositoryRoot, "src"));
    await writeFile(path.join(repositoryRoot, "src/orders.ts"), "class Orders { create() {} }\n");
    const locator = new QuerySourceLocator(repositoryRoot);
    const symbol = {
      kind: "symbol",
      file: "src/orders.ts",
      value: "Orders.create",
      description: "创建订单。",
    } as const;

    expect(await locator.anchor(symbol)).toEqual({ ...symbol, resolution: "hint" });
    expect(await locator.anchor({ ...symbol, file: "src/missing.ts" })).toEqual({
      ...symbol,
      file: "src/missing.ts",
      resolution: "missing",
    });
    expect(
      await locator.anchor({ kind: "symbol", value: "Orders.create", description: "创建订单。" }),
    ).toEqual({
      kind: "symbol",
      value: "Orders.create",
      description: "创建订单。",
      resolution: "hint",
    });
    for (const kind of ["file", "document"] as const) {
      const anchor = { kind, value: "src/orders.ts", description: "订单入口。" };
      expect(await locator.anchor(anchor)).toEqual({
        ...anchor,
        resolution: "located",
        location: { file: "src/orders.ts", line: 1, column: 1 },
      });
    }
    expect(
      await locator.anchor({ kind: "directory", value: "src", description: "订单目录。" }),
    ).toEqual({ kind: "directory", value: "src", description: "订单目录。", resolution: "hint" });
    expect(
      await locator.anchor({ kind: "file", value: "src", description: "错误文件入口。" }),
    ).toEqual({ kind: "file", value: "src", description: "错误文件入口。", resolution: "missing" });
    expect(
      await locator.anchor({ kind: "search", value: "order placed", description: "订单事件。" }),
    ).toEqual({
      kind: "search",
      value: "order placed",
      description: "订单事件。",
      resolution: "hint",
    });
  });
});

async function repository(source: string): Promise<string> {
  const root = await createMapRepository({ "orders.yaml": source });
  repositories.push(root);
  return root;
}

function businessNode(id: string): BusinessNode {
  return {
    id,
    kind: "operation",
    name: id,
    summary: id,
    aliases: [],
    anchors: [],
    documentId: "orders",
    documentPath,
  };
}

function businessFlow(id: string): BusinessFlow {
  return {
    id,
    name: id,
    summary: id,
    scenario: "orders.scenario",
    startsAt: ["start"],
    steps: [],
    transitions: [],
    documentId: "orders",
    documentPath,
  };
}

function businessRelation(): BusinessRelation {
  return {
    from: "orders.create",
    type: "writes",
    to: "orders.record",
    summary: "创建订单数据。",
    documentId: "orders",
    documentPath,
  };
}
