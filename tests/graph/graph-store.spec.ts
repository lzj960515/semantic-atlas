import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { GraphStore } from "../../src/graph/graph-store.js";
import type {
  BusinessGraphMutation,
  BusinessNodeInput,
  BusinessRelationInput,
  StructuralRelationInput,
} from "../../src/graph/types.js";
import {
  coreStructuralNodes,
  createGraphTestContext,
  evidenceFor,
  locationFor,
  type GraphTestContext,
} from "./graph-fixture.js";

describe("graph storage", () => {
  const contexts: GraphTestContext[] = [];

  afterEach(async () => {
    await Promise.all(contexts.splice(0).map((context) => context.cleanup()));
  });

  it("stores every confirmed node and relation kind in the versioned schema", async () => {
    const context = await createGraphTestContext();
    contexts.push(context);
    const { graph, snapshot } = context;
    const nodes = [
      ...coreStructuralNodes(snapshot),
      {
        id: "unknown:src/example.ts#runtime-value",
        kind: "UnknownBoundary" as const,
        label: "Runtime value lookup",
        reason: "The property name is computed at runtime.",
        location: locationFor(snapshot),
        candidates: ["symbol:src/example.ts#value"],
      },
    ];
    const structuralRelationTypes = [
      "contains",
      "declares",
      "imports",
      "exports",
      "references",
      "calls",
      "extends",
      "implements",
      "decorated_by",
    ] as const;
    const structuralRelations: StructuralRelationInput[] = structuralRelationTypes.map((type) => ({
      from: "symbol:src/example.ts#value",
      type,
      to: "file:src/example.ts",
    }));

    graph.replaceStructuralSnapshot(snapshot.snapshotId, nodes, structuralRelations);

    const evidence = evidenceFor(snapshot);
    const businessKinds = [
      "Capability",
      "Scenario",
      "Operation",
      "Invariant",
      "Interface",
      "Data",
    ] as const;
    const businessNodes: BusinessNodeInput[] = businessKinds.map((kind) => ({
      key: `fixture/${kind.toLowerCase()}`,
      kind,
      label: kind,
      summary: `${kind} assertion`,
      aliases: [`fixture-${kind.toLowerCase()}`],
      certainty: "exact",
      evidence: [evidence],
    }));
    const businessRelations: BusinessRelationInput[] = [
      relation("fixture/scenario", "part_of", business("fixture/capability"), evidence),
      relation("fixture/operation", "realized_by", structural("symbol:src/example.ts#value"), evidence),
      relation("fixture/operation", "reads", business("fixture/data"), evidence),
      relation("fixture/scenario", "writes", business("fixture/data"), evidence),
      relation("fixture/operation", "publishes", business("fixture/interface"), evidence),
      relation("fixture/scenario", "consumes", business("fixture/interface"), evidence),
      relation("fixture/operation", "constrained_by", business("fixture/invariant"), evidence),
      relation("fixture/scenario", "verified_by", structural("test:src/example.ts#value"), evidence),
    ];

    graph.mutateBusinessGraph(mutation(snapshot.snapshotId, businessNodes, businessRelations));

    expect(graph.schemaVersion).toBe(2);
    using schema = new DatabaseSync(graph.databasePath);
    const businessNodeColumns = schema.prepare("PRAGMA table_info(business_nodes)")
      .all() as unknown as { name: string }[];
    expect(businessNodeColumns.map(({ name }) => name)).not.toContain("validity");
    const validityTables = schema.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name LIKE 'business_%_validity'
      ORDER BY name ASC
    `).all() as unknown as { name: string }[];
    expect(validityTables.map(({ name }) => name)).toEqual([
      "business_node_validity",
      "business_relation_validity",
    ]);
    for (const node of nodes) {
      expect(graph.getNode(structural(node.id), snapshot.snapshotId)?.kind).toBe(node.kind);
    }
    for (const node of businessNodes) {
      expect(graph.getNode(business(node.key), snapshot.snapshotId)).toMatchObject({
        kind: node.kind,
        validity: "valid",
      });
    }
    expect(graph.traverse(structural("symbol:src/example.ts#value"), {
      snapshotId: snapshot.snapshotId,
      maxDepth: 1,
      direction: "outgoing",
    })).toHaveLength(structuralRelationTypes.length);
    expect(graph.traverse(business("fixture/operation"), {
      snapshotId: snapshot.snapshotId,
      maxDepth: 1,
      direction: "outgoing",
    }).map((neighbor) => neighbor.relation.type).sort()).toEqual([
      "constrained_by",
      "publishes",
      "reads",
      "realized_by",
    ]);

    using reopenedGraph = new GraphStore(context.dataDirectory, context.repository);
    expect(reopenedGraph.getNode(
      business("fixture/operation"),
      snapshot.snapshotId,
    )).toMatchObject({ label: "Operation", validity: "valid" });
    expect(await context.fixture.git("status", "--porcelain", "--untracked-files=all"))
      .toBe("");
  });

  it("atomically replaces one structural snapshot and rolls back invalid relations", async () => {
    const context = await createGraphTestContext();
    contexts.push(context);
    const { graph, snapshot } = context;
    const nodes = coreStructuralNodes(snapshot);
    graph.replaceStructuralSnapshot(snapshot.snapshotId, nodes, [
      { from: "repository:fixture", type: "contains", to: "module:src" },
    ]);

    expect(() => graph.replaceStructuralSnapshot(snapshot.snapshotId, [nodes[0]!], [
      { from: "repository:fixture", type: "contains", to: "module:missing" },
    ])).toThrow(/endpoint/i);

    expect(graph.getNode(structural("module:src"), snapshot.snapshotId)).toBeDefined();
    expect(graph.traverse(structural("repository:fixture"), {
      snapshotId: snapshot.snapshotId,
      direction: "outgoing",
      maxDepth: 1,
    })).toHaveLength(1);

    graph.replaceStructuralSnapshot(snapshot.snapshotId, [nodes[0]!], []);
    expect(graph.getNode(structural("module:src"), snapshot.snapshotId)).toBeUndefined();
    expect(graph.traverse(structural("repository:fixture"), {
      snapshotId: snapshot.snapshotId,
      direction: "outgoing",
      maxDepth: 1,
    })).toEqual([]);
  });

  it("rejects business node removal that would leave a relation dangling", async () => {
    const context = await createGraphTestContext();
    contexts.push(context);
    const { graph, snapshot } = context;
    graph.replaceStructuralSnapshot(snapshot.snapshotId, coreStructuralNodes(snapshot), []);
    const evidence = evidenceFor(snapshot);
    const capability: BusinessNodeInput = {
      key: "fixture/capability",
      kind: "Capability",
      label: "Fixture capability",
      summary: "Owns fixture behavior.",
      aliases: [],
      certainty: "exact",
      evidence: [evidence],
    };
    const operation: BusinessNodeInput = {
      ...capability,
      key: "fixture/operation",
      kind: "Operation",
      label: "Fixture operation",
    };
    const partOf = relation(
      operation.key,
      "part_of",
      business(capability.key),
      evidence,
    );
    graph.mutateBusinessGraph(mutation(snapshot.snapshotId, [capability, operation], [partOf]));

    expect(() => graph.mutateBusinessGraph({
      ...mutation(snapshot.snapshotId),
      removeNodeKeys: [capability.key],
      removeRelations: [{ from: business(operation.key), type: "part_of", to: business(capability.key) }],
      upsertNodes: [{
        ...operation,
        label: "Changed in failed transaction",
        evidence: [{ ...evidence, contentHash: "f".repeat(64) }],
      }],
    })).toThrow(/evidence/i);
    expect(graph.getNode(business(operation.key), snapshot.snapshotId)).toMatchObject({
      label: "Fixture operation",
    });
    expect(graph.getNode(business(capability.key), snapshot.snapshotId)).toBeDefined();
    expect(graph.traverse(business(operation.key), {
      snapshotId: snapshot.snapshotId,
      maxDepth: 1,
      direction: "outgoing",
    })).toHaveLength(1);

    graph.mutateBusinessGraph({
      ...mutation(snapshot.snapshotId),
      removeNodeKeys: [capability.key],
      removeRelations: [{ from: business(operation.key), type: "part_of", to: business(capability.key) }],
    });
    expect(graph.getNode(business(capability.key), snapshot.snapshotId)).toBeUndefined();
    expect(graph.traverse(business(operation.key), {
      snapshotId: snapshot.snapshotId,
      maxDepth: 1,
      direction: "outgoing",
    })).toEqual([]);
  });
});

function structural(id: string) {
  return { domain: "structural" as const, id };
}

function business(key: string) {
  return { domain: "business" as const, key };
}

function relation(
  from: string,
  type: BusinessRelationInput["type"],
  to: BusinessRelationInput["to"],
  evidence: BusinessRelationInput["evidence"][number],
): BusinessRelationInput {
  return {
    from: business(from),
    type,
    to,
    certainty: "exact",
    evidence: [evidence],
  };
}

function mutation(
  snapshotId: string,
  upsertNodes: readonly BusinessNodeInput[] = [],
  upsertRelations: readonly BusinessRelationInput[] = [],
): BusinessGraphMutation {
  return {
    baseSnapshotId: snapshotId,
    upsertNodes,
    removeNodeKeys: [],
    upsertRelations,
    removeRelations: [],
  };
}
