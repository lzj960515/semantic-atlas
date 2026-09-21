import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../../src/cli/run-cli.js";
import {
  createEmptyRepository,
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

describe("semantic-atlas validate", () => {
  it("validates a deterministic graph assembled from multiple domain files", async () => {
    const repositoryRoot = await trackedRepository({
      "orders.yaml": mapDocument(
        "orders",
        [
          node("commerce.orders", "capability", "Orders"),
          node("commerce.orders.place-order", "scenario", "Place order"),
          node("commerce.orders.order", "data", "Order"),
        ],
        [
          relation("commerce.orders.place-order", "part_of", "commerce.orders"),
          relation("commerce.orders.place-order", "writes", "commerce.orders.order"),
        ],
      ),
      "commerce.yaml": mapDocument(
        "commerce",
        [node("commerce", "domain", "Commerce")],
        [relation("commerce.orders", "part_of", "commerce")],
      ),
    });

    const first = await runCli(["validate", "--repo", repositoryRoot]);
    const second = await runCli(["validate", "--repo", repositoryRoot]);

    expect(first.exitCode).toBe(0);
    expect(first.stderr).toBe("");
    expect(first.stdout).toBe(second.stdout);
    expect(JSON.parse(first.stdout)).toMatchObject({
      schemaVersion: 1,
      ok: true,
      command: "validate",
      repository: {
        root: repositoryRoot,
        mapDirectory: "docs/business-map",
        documents: ["commerce.yaml", "orders.yaml"],
      },
      data: {
        documentCount: 2,
        nodeCount: 4,
        relationCount: 3,
        flowCount: 0,
      },
    });
  });

  it("validates business decisions, branches, outcomes, and concept references", async () => {
    const repositoryRoot = await trackedRepository({
      "commerce.yaml": mapDocument(
        "commerce",
        [
          node("commerce", "domain", "Commerce"),
          node("commerce.orders", "capability", "Orders"),
          node("commerce.orders.place-order", "scenario", "Place order"),
          node("commerce.orders.create-order", "operation", "Create order"),
          node("commerce.orders.payment-required", "invariant", "Payment is required"),
        ],
        [
          relation("commerce.orders", "part_of", "commerce"),
          relation("commerce.orders.place-order", "part_of", "commerce.orders"),
          relation("commerce.orders.create-order", "part_of", "commerce.orders.place-order"),
        ],
        [placeOrderFlow()],
      ),
    });

    const result = await runCli(["validate", "--repo", repositoryRoot]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      data: {
        flowCount: 1,
      },
    });
  });

  it("reports unusable flow structure instead of accepting an ambiguous diagram", async () => {
    const repositoryRoot = await trackedRepository({
      "commerce.yaml": mapDocument(
        "commerce",
        [
          node("commerce", "domain", "Commerce"),
          node("commerce.orders.place-order", "scenario", "Place order"),
        ],
        [],
        [
          flow(
            "commerce.orders.broken-flow",
            "commerce.orders.missing-scenario",
            "start",
            [
              flowStep("start", "action", "Start"),
              flowStep("decision", "decision", "Should continue?", "commerce.missing-rule"),
              flowStep("done", "outcome", "Done"),
              flowStep("orphan", "action", "Unreachable action"),
            ],
            [
              transition("start", "decision"),
              transition("decision", "done"),
              transition("decision", "missing-step", "yes"),
              transition("done", "start"),
            ],
          ),
        ],
      ),
    });

    const result = await runCli(["validate", "--repo", repositoryRoot]);
    const codes = JSON.parse(result.stdout).error.issues.map(
      (issue: { code: string }) => issue.code,
    );

    expect(result.exitCode).toBe(1);
    expect(codes).toEqual(
      expect.arrayContaining([
        "FLOW_SCENARIO_MISSING",
        "FLOW_CONCEPT_MISSING",
        "FLOW_TRANSITION_ENDPOINT_MISSING",
        "FLOW_DECISION_BRANCH_INVALID",
        "FLOW_OUTCOME_HAS_TRANSITION",
        "FLOW_STEP_UNREACHABLE",
      ]),
    );
  });

  it("returns every safely collectable graph issue in one invalid result", async () => {
    const repositoryRoot = await trackedRepository({
      "broken.yaml": mapDocument(
        "broken",
        [
          node("commerce", "domain", "Commerce"),
          node("commerce.orders", "capability", "Orders"),
          node("commerce.other", "capability", "Other"),
          node("commerce.order", "data", "Order", {
            anchors: [
              {
                kind: "file",
                value: "../outside.ts",
                description: "Escapes the repository.",
              },
            ],
          }),
        ],
        [
          relation("commerce.orders", "part_of", "commerce"),
          relation("commerce.orders", "part_of", "commerce.other"),
          relation("commerce.other", "part_of", "commerce.orders"),
          relation("commerce.orders", "reads", "commerce.missing"),
          relation("commerce.orders", "writes", "commerce.other"),
        ],
      ),
    });

    const result = await runCli(["validate", "--repo", repositoryRoot]);
    const envelope = JSON.parse(result.stdout);
    const codes = envelope.error.issues.map((issue: { code: string }) => issue.code);

    expect(result.exitCode).toBe(1);
    expect(envelope).toMatchObject({
      schemaVersion: 1,
      ok: false,
      command: "validate",
      error: {
        code: "MAP_DOCUMENT_INVALID",
      },
    });
    expect(codes).toEqual(
      expect.arrayContaining([
        "ANCHOR_PATH_INVALID",
        "RELATION_ENDPOINT_MISSING",
        "MULTIPLE_CONTAINMENT_PARENTS",
        "CONTAINMENT_CYCLE",
        "RELATION_KIND_MISMATCH",
      ]),
    );
  });

  it("reports duplicate document, node, alias, relation, and domain-parent identities", async () => {
    const duplicatedNode = node("commerce", "domain", "Commerce", {
      aliases: ["Shop", "shop"],
    });
    const duplicatedRelation = relation("commerce", "part_of", "commerce.other");
    const repositoryRoot = await trackedRepository({
      "first.yaml": mapDocument(
        "commerce-map",
        [duplicatedNode, node("commerce.other", "domain", "Other")],
        [duplicatedRelation, duplicatedRelation],
      ),
      "second.yaml": mapDocument(
        "commerce-map",
        [node("commerce", "domain", "Commerce duplicate")],
        [],
      ),
    });

    const result = await runCli(["validate", "--repo", repositoryRoot]);
    const codes = JSON.parse(result.stdout).error.issues.map(
      (issue: { code: string }) => issue.code,
    );

    expect(result.exitCode).toBe(1);
    expect(codes).toEqual(
      expect.arrayContaining([
        "DUPLICATE_DOCUMENT_ID",
        "DUPLICATE_NODE_ID",
        "DUPLICATE_NODE_ALIAS",
        "DUPLICATE_RELATION",
        "DOMAIN_HAS_PARENT",
      ]),
    );
  });

  it("reports YAML and strict document-shape errors without successful empty results", async () => {
    const repositoryRoot = await trackedRepository({
      "invalid-yaml.yaml": "schemaVersion: [",
      "invalid-shape.yaml": {
        ...mapDocument("invalid", [], []),
        unexpected: true,
      } as TestMapDocument,
    });

    const result = await runCli(["validate", "--repo", repositoryRoot]);
    const codes = JSON.parse(result.stdout).error.issues.map(
      (issue: { code: string }) => issue.code,
    );

    expect(result.exitCode).toBe(1);
    expect(codes).toEqual(
      expect.arrayContaining(["DOCUMENT_PARSE_FAILED", "DOCUMENT_SCHEMA_INVALID"]),
    );
  });

  it("distinguishes a repository with no map documents", async () => {
    const repositoryRoot = await createEmptyRepository();
    repositories.push(repositoryRoot);

    const result = await runCli(["validate", "--repo", repositoryRoot]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      command: "validate",
      repository: {
        root: repositoryRoot,
        mapDirectory: "docs/business-map",
        documents: [],
      },
      error: {
        code: "MAP_NOT_FOUND",
      },
    });
  });
});

describe("semantic-atlas search", () => {
  it("ranks mixed node kinds for a natural mixed-language query", async () => {
    const repositoryRoot = await trackedRepository({
      "relay.yaml": mapDocument(
        "relay",
        [
          node("engagement.relay-notifications", "domain", "Relay 订单与发货提醒交接", {
            aliases: ["Relay"],
          }),
          node(
            "engagement.relay-notifications.publish-shipment-updates",
            "scenario",
            "投递新增承运商发货提醒",
          ),
          node(
            "engagement.relay-notifications.notification-boundary",
            "interface",
            "AI Relay 消息入口",
          ),
          node(
            "engagement.relay-notifications.delivery-semantics",
            "invariant",
            "订单提醒失败传播，入队与卡片完成分开",
          ),
          node("shipment-intelligence", "domain", "承运商发货情报"),
        ],
        [
          relation(
            "engagement.relay-notifications.publish-shipment-updates",
            "part_of",
            "engagement.relay-notifications",
          ),
          relation(
            "engagement.relay-notifications.notification-boundary",
            "part_of",
            "engagement.relay-notifications",
          ),
          relation(
            "engagement.relay-notifications.delivery-semantics",
            "part_of",
            "engagement.relay-notifications",
          ),
          relation(
            "engagement.relay-notifications.publish-shipment-updates",
            "publishes",
            "engagement.relay-notifications.notification-boundary",
          ),
          relation(
            "engagement.relay-notifications.publish-shipment-updates",
            "constrained_by",
            "engagement.relay-notifications.delivery-semantics",
          ),
        ],
      ),
    });

    const first = await runCli(["search", "Relay订单通知", "--repo", repositoryRoot]);
    const second = await runCli(["search", "Relay订单通知", "--repo", repositoryRoot]);
    const envelope = JSON.parse(first.stdout);

    expect(first.exitCode).toBe(0);
    expect(first.stderr).toBe("");
    expect(first.stdout).toBe(second.stdout);
    expect(envelope).toMatchObject({
      schemaVersion: 1,
      ok: true,
      command: "search",
      data: {
        query: "Relay订单通知",
      },
    });
    expect(envelope.data.results[0]).toMatchObject({
      rank: 1,
      id: "engagement.relay-notifications",
      name: "Relay 订单与发货提醒交接",
      kind: "domain",
      documentId: "relay",
      matchedFields: expect.arrayContaining(["name"]),
    });
    expect(envelope.data.results.length).toBeLessThanOrEqual(5);
    expect(envelope.data.results[0].score).toBeGreaterThan(envelope.data.results[1].score);
    expect(
      envelope.data.results.every(({ score }: { score: number }) => score > 0 && score <= 1),
    ).toBe(true);
  });

  it("ranks a specific scenario above a related top-level domain", async () => {
    const repositoryRoot = await trackedRepository({
      "relay.yaml": mapDocument(
        "relay",
        [
          node("engagement.relay-notifications", "domain", "Relay 订单与发货提醒交接"),
          node(
            "engagement.relay-notifications.publish-shipment-updates",
            "scenario",
            "投递新增承运商发货提醒",
          ),
          node("shipment-intelligence", "domain", "承运商发货情报"),
        ],
        [
          relation(
            "engagement.relay-notifications.publish-shipment-updates",
            "part_of",
            "engagement.relay-notifications",
          ),
        ],
      ),
    });

    const result = await runCli(["search", "承运商发货提醒", "--repo", repositoryRoot]);

    expect(result.exitCode).toBe(0);
    const envelope = JSON.parse(result.stdout);
    expect(envelope).toMatchObject({
      ok: true,
      command: "search",
    });
    expect(envelope.data.results[0]).toMatchObject({
      rank: 1,
      id: "engagement.relay-notifications.publish-shipment-updates",
      kind: "scenario",
    });
  });

  it("searches every business-node kind", async () => {
    const nodeKinds = [
      "domain",
      "capability",
      "scenario",
      "operation",
      "data",
      "invariant",
      "interface",
    ] as const;
    const repositoryRoot = await trackedRepository({
      "concepts.yaml": mapDocument(
        "concepts",
        nodeKinds.map((kind) =>
          node(`concepts.${kind}`, kind, `${kind} concept`, {
            aliases: [`${kind} lookup target`],
          }),
        ),
        [],
      ),
    });

    for (const kind of nodeKinds) {
      const result = await runCli(["search", `${kind} lookup target`, "--repo", repositoryRoot]);
      const envelope = JSON.parse(result.stdout);

      expect(result.exitCode, `${kind}: ${result.stdout}`).toBe(0);
      expect(envelope.data.results[0], kind).toMatchObject({
        rank: 1,
        score: 1,
        id: `concepts.${kind}`,
        kind,
        matchedFields: expect.arrayContaining(["alias"]),
      });
    }
  });

  it("breaks equal-score ties by stable ID", async () => {
    const repositoryRoot = await trackedRepository({
      "concepts.yaml": mapDocument(
        "concepts",
        [
          node("concepts.zeta", "domain", "Zeta", { aliases: ["Shared target"] }),
          node("concepts.alpha", "domain", "Alpha", { aliases: ["Shared target"] }),
          node("concepts.middle", "domain", "Middle", { aliases: ["Shared target"] }),
        ],
        [],
      ),
    });

    const result = await runCli(["search", "Shared target", "--repo", repositoryRoot]);
    const envelope = JSON.parse(result.stdout);

    expect(result.exitCode, result.stdout).toBe(0);
    expect(
      envelope.data.results.map(({ id, score }: { id: string; score: number }) => ({ id, score })),
    ).toEqual([
      { id: "concepts.alpha", score: 1 },
      { id: "concepts.middle", score: 1 },
      { id: "concepts.zeta", score: 1 },
    ]);
  });

  it("breaks publicly rounded score ties by stable ID", async () => {
    const repositoryRoot = await trackedRepository({
      "concepts.yaml": mapDocument(
        "concepts",
        [
          node("concepts.alpha", "domain", "home base message order"),
          node(
            "concepts.zeta",
            "domain",
            "order publish process product analysis rule external advertising",
          ),
        ],
        [],
      ),
    });

    const result = await runCli(["search", "order social notification", "--repo", repositoryRoot]);
    const envelope = JSON.parse(result.stdout);

    expect(result.exitCode, result.stdout).toBe(0);
    expect(
      envelope.data.results.map(({ id, score }: { id: string; score: number }) => ({ id, score })),
    ).toEqual([
      { id: "concepts.alpha", score: 0.25 },
      { id: "concepts.zeta", score: 0.25 },
    ]);
  });

  it("uses the public score threshold consistently for candidates and matched fields", async () => {
    const repositoryRoot = await trackedRepository({
      "concepts.yaml": mapDocument(
        "concepts",
        [
          node(
            "concepts.threshold",
            "domain",
            "advertising-collect-advertising-interface-competitor-product-advertising-order-delivery-customer-home-advertising-base",
          ),
        ],
        [],
      ),
    });

    const result = await runCli(["search", "order social notification", "--repo", repositoryRoot]);
    const envelope = JSON.parse(result.stdout);

    expect(result.exitCode, result.stdout).toBe(0);
    expect(envelope.data.results[0]).toMatchObject({
      score: 0.2,
      id: "concepts.threshold",
      matchedFields: ["name"],
    });
  });

  it("gives exact lookup vocabulary the maximum score and returns no irrelevant candidates", async () => {
    const repositoryRoot = await trackedRepository({
      "commerce.yaml": mapDocument(
        "commerce",
        [
          node("commerce", "domain", "Commerce"),
          node("commerce.orders.place-order", "scenario", "Place order", {
            aliases: ["Checkout"],
          }),
        ],
        [relation("commerce.orders.place-order", "part_of", "commerce")],
      ),
    });

    const exact = await runCli(["search", "Checkout", "--repo", repositoryRoot]);
    const missing = await runCli(["search", "unrelated xyz", "--repo", repositoryRoot]);

    const exactEnvelope = JSON.parse(exact.stdout);
    expect(exactEnvelope).toMatchObject({
      ok: true,
    });
    expect(exactEnvelope.data.results[0]).toMatchObject({
      rank: 1,
      score: 1,
      id: "commerce.orders.place-order",
      matchedFields: expect.arrayContaining(["alias"]),
    });
    expect(JSON.parse(missing.stdout)).toMatchObject({
      ok: true,
      command: "search",
      data: { query: "unrelated xyz", results: [] },
    });
  });

  it("preserves map-loading failures under the search command", async () => {
    const repositoryRoot = await createEmptyRepository();
    repositories.push(repositoryRoot);

    const result = await runCli(["search", "Checkout", "--repo", repositoryRoot]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      command: "search",
      error: { code: "MAP_NOT_FOUND" },
    });
  });
});

describe("semantic-atlas context", () => {
  it("returns containment, horizontal relations, endpoint summaries, and anchors", async () => {
    const repositoryRoot = await trackedRepository({
      "commerce.yaml": mapDocument(
        "commerce",
        [
          node("commerce", "domain", "Commerce"),
          node("commerce.orders", "capability", "Orders"),
          node("commerce.orders.place-order", "scenario", "Place order", {
            aliases: ["Checkout"],
            anchors: [
              {
                kind: "symbol",
                value: "PlaceOrderService.execute",
                description: "Likely orchestration symbol.",
              },
            ],
          }),
          node("commerce.orders.create-order", "operation", "Create order"),
          node("commerce.orders.order", "data", "Order"),
        ],
        [
          relation("commerce.orders", "part_of", "commerce"),
          relation("commerce.orders.place-order", "part_of", "commerce.orders"),
          relation("commerce.orders.create-order", "part_of", "commerce.orders.place-order"),
          relation("commerce.orders.place-order", "invokes", "commerce.orders.create-order"),
          relation("commerce.orders.create-order", "writes", "commerce.orders.order"),
        ],
      ),
    });

    const result = await runCli(["context", "Checkout", "--repo", repositoryRoot]);
    const envelope = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(envelope).toMatchObject({
      schemaVersion: 1,
      ok: true,
      command: "context",
      data: {
        selector: "Checkout",
        matchedBy: "alias",
        selected: {
          id: "commerce.orders.place-order",
          name: "Place order",
          documentId: "commerce",
          anchors: [{ value: "PlaceOrderService.execute" }],
        },
        ancestors: [
          { id: "commerce", name: "Commerce" },
          { id: "commerce.orders", name: "Orders" },
        ],
        children: [{ id: "commerce.orders.create-order", name: "Create order" }],
        incoming: [],
        outgoing: [
          {
            type: "invokes",
            from: { id: "commerce.orders.place-order" },
            to: { id: "commerce.orders.create-order", name: "Create order" },
          },
        ],
        flows: [],
      },
    });

    const operationResult = await runCli([
      "context",
      "commerce.orders.create-order",
      "--repo",
      repositoryRoot,
    ]);
    expect(JSON.parse(operationResult.stdout)).toMatchObject({
      ok: true,
      data: {
        incoming: [
          {
            type: "invokes",
            from: { id: "commerce.orders.place-order" },
            to: { id: "commerce.orders.create-order" },
          },
        ],
        outgoing: [
          {
            type: "writes",
            from: { id: "commerce.orders.create-order" },
            to: { id: "commerce.orders.order" },
          },
        ],
      },
    });
  });

  it("returns complete related flows for a scenario and its referenced concepts", async () => {
    const repositoryRoot = await trackedRepository({
      "commerce.yaml": mapDocument(
        "commerce",
        [
          node("commerce", "domain", "Commerce"),
          node("commerce.orders", "capability", "Orders"),
          node("commerce.orders.place-order", "scenario", "Place order", {
            aliases: ["Checkout"],
          }),
          node("commerce.orders.create-order", "operation", "Create order"),
          node("commerce.orders.payment-required", "invariant", "Payment is required"),
        ],
        [
          relation("commerce.orders", "part_of", "commerce"),
          relation("commerce.orders.place-order", "part_of", "commerce.orders"),
          relation("commerce.orders.create-order", "part_of", "commerce.orders.place-order"),
        ],
        [placeOrderFlow()],
      ),
    });

    const scenarioResult = await runCli(["context", "Checkout", "--repo", repositoryRoot]);
    const operationResult = await runCli([
      "context",
      "commerce.orders.create-order",
      "--repo",
      repositoryRoot,
    ]);

    expect(scenarioResult.exitCode).toBe(0);
    expect(JSON.parse(scenarioResult.stdout)).toMatchObject({
      ok: true,
      data: {
        flows: [
          {
            id: "commerce.orders.place-order-flow",
            scenario: "commerce.orders.place-order",
            startsAt: "receive-order",
            steps: [
              { id: "create-order", concept: "commerce.orders.create-order" },
              { id: "order-created", kind: "outcome" },
              { id: "payment-authorized", kind: "decision" },
              { id: "payment-declined", kind: "outcome" },
              { id: "receive-order", kind: "action" },
            ],
            transitions: expect.arrayContaining([
              { from: "payment-authorized", when: "authorized", to: "create-order" },
              { from: "payment-authorized", when: "declined", to: "payment-declined" },
            ]),
          },
        ],
      },
    });
    expect(JSON.parse(operationResult.stdout)).toMatchObject({
      ok: true,
      data: {
        flows: [{ id: "commerce.orders.place-order-flow" }],
      },
    });
  });

  it("returns stable ambiguity candidates instead of choosing a partial match", async () => {
    const repositoryRoot = await trackedRepository({
      "commerce.yaml": mapDocument(
        "commerce",
        [
          node("commerce", "domain", "Commerce"),
          node("commerce.orders.create-order", "operation", "Create order"),
          node("commerce.orders.cancel-order", "operation", "Cancel order"),
        ],
        [],
      ),
    });

    const result = await runCli(["context", "order", "--repo", repositoryRoot]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      command: "context",
      error: {
        code: "CONCEPT_AMBIGUOUS",
        candidates: [
          { id: "commerce.orders.cancel-order", name: "Cancel order" },
          { id: "commerce.orders.create-order", name: "Create order" },
        ],
      },
    });
  });

  it("returns a bounded not-found result for ordinary source discovery", async () => {
    const repositoryRoot = await trackedRepository({
      "commerce.yaml": mapDocument("commerce", [node("commerce", "domain", "Commerce")], []),
    });

    const result = await runCli(["context", "refund", "--repo", repositoryRoot]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      command: "context",
      error: {
        code: "CONCEPT_NOT_FOUND",
        selector: "refund",
      },
    });
  });
});

describe("semantic-atlas command boundary", () => {
  it("prints command help successfully", async () => {
    const result = await runCli(["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Usage: semantic-atlas [options] [command]");
    expect(result.stdout).toContain("validate");
    expect(result.stdout).toContain("context");
    expect(result.stdout).toContain("setup");
    expect(result.stdout).toContain("upgrade");
    expect(result.stdout).toContain("observe");
    expect(result.stdout).toContain("insights");
  });

  it("returns a stable command error and usage exit code for unknown commands", async () => {
    const result = await runCli(["unknown"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      schemaVersion: 1,
      ok: false,
      command: "command",
      error: {
        code: "INVALID_COMMAND",
      },
    });
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

function placeOrderFlow(): Record<string, unknown> {
  return flow(
    "commerce.orders.place-order-flow",
    "commerce.orders.place-order",
    "receive-order",
    [
      flowStep("receive-order", "action", "Receive order", "commerce.orders.place-order"),
      flowStep(
        "payment-authorized",
        "decision",
        "Is payment authorized?",
        "commerce.orders.payment-required",
      ),
      flowStep("create-order", "action", "Create order", "commerce.orders.create-order"),
      flowStep("order-created", "outcome", "Order created"),
      flowStep("payment-declined", "outcome", "Order not created"),
    ],
    [
      transition("receive-order", "payment-authorized"),
      transition("payment-authorized", "create-order", "authorized"),
      transition("payment-authorized", "payment-declined", "declined"),
      transition("create-order", "order-created"),
    ],
  );
}
