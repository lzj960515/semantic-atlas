import { afterEach, describe, expect, it } from "vitest";

import type { BusinessGraphMutation } from "../../src/graph/types.js";
import { createRepositorySnapshot } from "../../src/snapshots/repository-snapshot.js";
import type {
  StructuralIndexBackend,
  StructuralNode,
  StructuralRelation,
  StructuralTraversalResult,
  StructuralUnknownBoundary,
} from "../../src/structural-backend/types.js";
import { WorldGraphQuery } from "../../src/world/world-graph-query.js";
import { WorldSnapshotStore } from "../../src/world/world-snapshot-store.js";
import {
  createGraphTestContext,
  evidenceFor,
  type GraphTestContext,
} from "../graph/graph-fixture.js";

describe("unified world graph queries", () => {
  const contexts: GraphTestContext[] = [];

  afterEach(async () => {
    await Promise.all(contexts.splice(0).map((context) => context.cleanup()));
  });

  it("uses structural module roots until business capabilities are learned", async () => {
    const context = await createGraphTestContext();
    contexts.push(context);
    const query = createQuery(context);

    await expect(query.roots()).resolves.toEqual([
      expect.objectContaining({ domain: "structural", id: "module:src", kind: "Module" }),
    ]);

    learnBusinessWorld(context);

    await expect(query.roots()).resolves.toEqual([
      expect.objectContaining({ domain: "business", key: "fixture", kind: "Capability" }),
    ]);
  });

  it("traverses hierarchy, evidence links, constraints, tests, structure, and unknowns", async () => {
    const context = await createGraphTestContext();
    contexts.push(context);
    learnBusinessWorld(context);
    const query = createQuery(context);

    const children = await query.children({ domain: "business", key: "fixture" });
    expect(children.map((node) => node.kind)).toEqual(["Operation"]);

    const business = await query.show(
      { domain: "business", key: "fixture/checkout" },
      { maxDepth: 1 },
    );
    expect(business).toBeDefined();
    if (business === undefined) throw new Error("Expected business graph view");
    expect(business.neighbors.map(({ relation, node }) => [relation.type, node.kind])).toEqual([
      ["constrained_by", "Invariant"],
      ["part_of", "Capability"],
      ["realized_by", "Symbol"],
      ["verified_by", "Test"],
    ]);
    expect(business.invariants).toEqual([
      expect.objectContaining({ key: "fixture/checkout/rule", certainty: "inferred" }),
    ]);
    expect(business.tests).toEqual([
      expect.objectContaining({ id: "test:src/example.test.ts#checkout", support: exactSupport }),
    ]);

    const structural = await query.show(
      { domain: "structural", id: "symbol:src/example.ts#value" },
      { maxDepth: 1 },
    );
    expect(structural).toBeDefined();
    if (structural === undefined) throw new Error("Expected structural graph view");
    expect(structural.neighbors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        direction: "incoming",
        relation: expect.objectContaining({ domain: "business", certainty: "exact" }),
        node: expect.objectContaining({ key: "fixture/checkout" }),
      }),
      expect.objectContaining({
        direction: "incoming",
        relation: expect.objectContaining({ domain: "structural", type: "calls" }),
        node: expect.objectContaining({ id: "symbol:src/caller.ts#caller" }),
      }),
      expect.objectContaining({
        direction: "outgoing",
        relation: expect.objectContaining({
          domain: "structural",
          type: "calls",
          certainty: null,
          support: inferredSupport,
        }),
        node: expect.objectContaining({ id: "symbol:src/target.ts#target" }),
      }),
    ]));
    expect(structural.unknowns).toEqual([
      expect.objectContaining({
        id: "unknown:dynamic-checkout",
        validity: "unknown",
        support: { status: "unresolved", provenance: "backend" },
      }),
    ]);

    const file = await query.show(
      { domain: "structural", id: "file:src/example.ts" },
      { maxDepth: 1 },
    );
    expect(file?.neighbors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        direction: "outgoing",
        relation: expect.objectContaining({ domain: "structural", type: "imports" }),
        node: expect.objectContaining({ id: "file:src/dependency.ts" }),
      }),
    ]));
  });

  it("deterministically combines business vocabulary and structural search", async () => {
    const context = await createGraphTestContext();
    contexts.push(context);
    learnBusinessWorld(context);
    const query = createQuery(context);

    const first = await query.search("checkout", { limit: 4 });
    const second = await query.search("checkout", { limit: 4 });

    expect(first).toEqual(second);
    expect(first.map(({ node }) => node.domain === "business" ? node.key : node.id)).toEqual([
      "fixture/checkout",
      "symbol:src/target.ts#target",
      "fixture/checkout/rule",
      "fixture",
    ]);
    expect(first.every(({ score }) => score >= 0 && score <= 1)).toBe(true);
    await expect(query.search("!!!", { limit: 4 })).resolves.toEqual([]);
  });

  it("returns persisted structural transitions as stable Atlas references", async () => {
    const context = await createGraphTestContext();
    contexts.push(context);
    const query = createQuery(context);

    expect(query.changes()).toBeUndefined();
    expect(query.changes({ toSnapshotId: "f".repeat(64) })).toBeUndefined();
  });

  it("rejects a result when publication changes during an asynchronous query", async () => {
    const context = await createGraphTestContext();
    contexts.push(context);
    const backend = structuralBackend();
    const query = new WorldGraphQuery(context.repository, context.graph, {
      ...backend,
      listRoots: async () => {
        await context.fixture.write("src/next.ts", "export const next = true;\n");
        const nextSnapshot = await createRepositorySnapshot(context.repository);
        using store = new WorldSnapshotStore(context.repository);
        store.begin(nextSnapshot.snapshotId);
        store.publish(nextSnapshot, "1.5.0", 1, emptyResolver(), {
          fromSnapshotId: context.snapshot.snapshotId,
          toSnapshotId: nextSnapshot.snapshotId,
          structural: { added: ["src/next.ts"], modified: [], removed: [] },
        });
        return backend.listRoots();
      },
    });

    await expect(query.roots()).rejects.toThrow(/World snapshot changed/);
    expect(query.changes()).toEqual({
      fromSnapshotId: context.snapshot.snapshotId,
      toSnapshotId: expect.any(String),
      nodes: { added: ["file:src/next.ts"], changed: [], removed: [] },
      relations: { added: [], changed: [], removed: [] },
      staleAssertions: [],
    });
  });
});

const exactSupport = { status: "exact", provenance: "tree-sitter" } as const;
const inferredSupport = { status: "inferred", provenance: "heuristic" } as const;

function createQuery(context: GraphTestContext): WorldGraphQuery {
  return new WorldGraphQuery(
    context.repository,
    context.graph,
    structuralBackend(),
  );
}

function structuralBackend(): StructuralIndexBackend {
  const nodes = new Map(structuralNodes().map((node) => [node.reference.id, node]));
  const relations: StructuralRelation[] = [
    relation("module:src", "contains", "file:src/example.ts", exactSupport),
    relation("file:src/example.ts", "imports", "file:src/dependency.ts", exactSupport),
    relation("file:src/example.ts", "declares", "symbol:src/example.ts#value", exactSupport),
    relation("symbol:src/caller.ts#caller", "calls", "symbol:src/example.ts#value", exactSupport),
    relation("symbol:src/example.ts#value", "calls", "symbol:src/target.ts#target", inferredSupport),
  ];
  const boundary: StructuralUnknownBoundary = {
    reference: { id: "unknown:dynamic-checkout" },
    kind: "UnknownBoundary",
    owner: { id: "symbol:src/example.ts#value" },
    operation: "calls",
    reason: "The runtime-selected checkout handler cannot be uniquely resolved.",
    path: "src/example.ts",
    position: { line: 1, column: 1 },
    candidates: ["symbol:src/target.ts#target"],
    support: { status: "unresolved", provenance: "backend" },
  };
  return {
    inspect: async () => ({
      completeness: "complete",
      databasePath: "/fixture/.atlas/codegraph.db",
      backendVersion: "1.5.0",
      extractionVersion: 1,
      indexedAt: "2026-08-13T00:00:00.000Z",
      diagnostics: [],
    }),
    build: async () => buildResult(),
    sync: async () => buildResult(),
    listRoots: async () => [nodes.get("module:src")!],
    search: async ({ query }) => query.toLowerCase().includes("checkout")
      ? [{ score: 88, node: nodes.get("symbol:src/target.ts#target")! }]
      : [],
    getNode: async ({ id }) => nodes.get(id),
    traverse: async ({ reference, direction = "both", relationTypes }) => {
      const selected = relations.filter((item) => (
        (direction === "both" || direction === "outgoing" ? item.from.id === reference.id : false)
        || (direction === "both" || direction === "incoming" ? item.to.id === reference.id : false)
      ) && (relationTypes === undefined || relationTypes.includes(item.type)));
      const selectedNodes = new Set(selected.flatMap((item) => [item.from.id, item.to.id]));
      selectedNodes.add(reference.id);
      return {
        roots: [{ id: reference.id }],
        nodes: [...selectedNodes].flatMap((id) => nodes.get(id) ?? []),
        relations: selected,
        boundaries: reference.id === boundary.owner.id ? [boundary] : [],
      } satisfies StructuralTraversalResult;
    },
    getCallers: async () => [],
    getCallees: async () => [],
    getFileDependencies: async () => [],
  };
}

function structuralNodes(): StructuralNode[] {
  return [
    node("module:src", "Module", "src", "src/example.ts"),
    node("file:src/example.ts", "File", "example.ts", "src/example.ts"),
    node("file:src/dependency.ts", "File", "dependency.ts", "src/example.ts"),
    node("symbol:src/caller.ts#caller", "Symbol", "caller", "src/example.ts"),
    node("symbol:src/example.ts#value", "Symbol", "value", "src/example.ts"),
    node("symbol:src/target.ts#target", "Symbol", "CheckoutHandler", "src/example.ts"),
    node("test:src/example.test.ts#checkout", "Test", "checkout test", "src/example.ts"),
  ];
}

function node(
  id: string,
  kind: StructuralNode["kind"],
  name: string,
  path: string,
): StructuralNode {
  return {
    reference: { id },
    kind,
    name,
    qualifiedName: name,
    path,
    language: "typescript",
    range: {
      start: { line: 1, column: 1 },
      end: { line: 1, column: 24 },
    },
    support: exactSupport,
  };
}

function relation(
  from: string,
  type: StructuralRelation["type"],
  to: string,
  support: StructuralRelation["support"],
): StructuralRelation {
  return { from: { id: from }, type, to: { id: to }, support };
}

function buildResult() {
  return {
    completeness: "complete" as const,
    databasePath: "/fixture/.atlas/codegraph.db",
    backendVersion: "1.5.0",
    extractionVersion: 1,
    indexedAt: "2026-08-13T00:00:00.000Z",
    diagnostics: [],
    mode: "incremental" as const,
    counts: {
      filesDiscovered: 1,
      filesIndexed: 1,
      filesSkipped: 0,
      filesErrored: 0,
      nodes: 5,
      relations: 3,
    },
    changes: { added: [], modified: [], removed: [] },
    boundaries: [],
  };
}

function emptyResolver() {
  return {
    getNode: () => undefined,
    findCandidates: () => [],
    backendLocator: () => undefined,
  };
}

function learnBusinessWorld(context: GraphTestContext): void {
  const evidence = evidenceFor(context.snapshot);
  const mutation: BusinessGraphMutation = {
    baseSnapshotId: context.snapshot.snapshotId,
    upsertNodes: [
      {
        key: "fixture",
        kind: "Capability",
        label: "Fixture commerce",
        summary: "Owns fixture checkout behavior.",
        aliases: ["commerce"],
        certainty: "exact",
        evidence: [evidence],
      },
      {
        key: "fixture/checkout",
        kind: "Operation",
        label: "Run checkout",
        summary: "Processes checkout requests.",
        aliases: ["checkout"],
        certainty: "exact",
        evidence: [evidence],
      },
      {
        key: "fixture/checkout/rule",
        kind: "Invariant",
        label: "Checkout rule",
        summary: "Constrains checkout processing.",
        aliases: [],
        certainty: "inferred",
        evidence: [evidence],
      },
    ],
    removeNodeKeys: [],
    upsertRelations: [
      businessRelation(
        evidence,
        "fixture/checkout",
        "part_of",
        { domain: "business", key: "fixture" },
      ),
      businessRelation(
        evidence,
        "fixture/checkout",
        "constrained_by",
        { domain: "business", key: "fixture/checkout/rule" },
        "inferred",
      ),
      businessRelation(
        evidence,
        "fixture/checkout",
        "realized_by",
        { domain: "structural", id: "symbol:src/example.ts#value" },
      ),
      businessRelation(
        evidence,
        "fixture/checkout",
        "verified_by",
        { domain: "structural", id: "test:src/example.test.ts#checkout" },
      ),
    ],
    removeRelations: [],
  };
  context.graph.mutateBusinessGraph(mutation);
}

function businessRelation(
  evidence: BusinessGraphMutation["upsertRelations"][number]["evidence"][number],
  from: string,
  type: BusinessGraphMutation["upsertRelations"][number]["type"],
  to: BusinessGraphMutation["upsertRelations"][number]["to"],
  certainty: BusinessGraphMutation["upsertRelations"][number]["certainty"] = "exact",
): BusinessGraphMutation["upsertRelations"][number] {
  return { from: { domain: "business", key: from }, type, to, certainty, evidence: [evidence] } as BusinessGraphMutation["upsertRelations"][number];
}
