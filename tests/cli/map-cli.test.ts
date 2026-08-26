import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../../src/cli/run-cli.js";
import {
  createEmptyRepository,
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
      },
    });
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
    expect(codes).toEqual(expect.arrayContaining([
      "ANCHOR_PATH_INVALID",
      "RELATION_ENDPOINT_MISSING",
      "MULTIPLE_CONTAINMENT_PARENTS",
      "CONTAINMENT_CYCLE",
      "RELATION_KIND_MISMATCH",
    ]));
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
    const codes = JSON.parse(result.stdout).error.issues
      .map((issue: { code: string }) => issue.code);

    expect(result.exitCode).toBe(1);
    expect(codes).toEqual(expect.arrayContaining([
      "DUPLICATE_DOCUMENT_ID",
      "DUPLICATE_NODE_ID",
      "DUPLICATE_NODE_ALIAS",
      "DUPLICATE_RELATION",
      "DOMAIN_HAS_PARENT",
    ]));
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
    const codes = JSON.parse(result.stdout).error.issues
      .map((issue: { code: string }) => issue.code);

    expect(result.exitCode).toBe(1);
    expect(codes).toEqual(expect.arrayContaining([
      "DOCUMENT_PARSE_FAILED",
      "DOCUMENT_SCHEMA_INVALID",
    ]));
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
        children: [
          { id: "commerce.orders.create-order", name: "Create order" },
        ],
        incoming: [],
        outgoing: [
          {
            type: "invokes",
            from: { id: "commerce.orders.place-order" },
            to: { id: "commerce.orders.create-order", name: "Create order" },
          },
        ],
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
      "commerce.yaml": mapDocument(
        "commerce",
        [node("commerce", "domain", "Commerce")],
        [],
      ),
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
