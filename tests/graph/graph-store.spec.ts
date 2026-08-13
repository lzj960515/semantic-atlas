import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import type {
  BusinessGraphMutation,
  BusinessNodeInput,
  BusinessRelationInput,
} from "../../src/graph/types.js";
import {
  createGraphTestContext,
  evidenceFor,
  type GraphTestContext,
} from "./graph-fixture.js";

describe("business graph storage", () => {
  const contexts: GraphTestContext[] = [];

  afterEach(async () => {
    await Promise.all(contexts.splice(0).map((context) => context.cleanup()));
  });

  it("stores every business node and relation kind in namespaced objects", async () => {
    const context = await createGraphTestContext();
    contexts.push(context);
    const { graph, snapshot } = context;
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
      relation("fixture/scenario", "invokes", business("fixture/operation"), evidence),
      relation("fixture/operation", "realized_by", structural(evidence.symbolId), evidence),
      relation("fixture/operation", "reads", business("fixture/data"), evidence),
      relation("fixture/scenario", "writes", business("fixture/data"), evidence),
      relation("fixture/operation", "publishes", business("fixture/interface"), evidence),
      relation("fixture/scenario", "consumes", business("fixture/interface"), evidence),
      relation("fixture/operation", "constrained_by", business("fixture/invariant"), evidence),
      relation("fixture/scenario", "verified_by", structural("test:src/example.ts#value"), evidence),
    ];

    graph.mutateBusinessGraph(mutation(snapshot.snapshotId, businessNodes, businessRelations));

    expect(graph.schemaVersion).toBe(5);
    using schema = new DatabaseSync(graph.databasePath);
    const atlasObjects = schema.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE name LIKE 'atlas_%'
      ORDER BY name
    `).all() as unknown as { name: string }[];
    expect(atlasObjects.length).toBeGreaterThan(0);
    expect(atlasObjects.every(({ name }) => name.startsWith("atlas_"))).toBe(true);
    expect(schema.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE name IN ('structural_nodes', 'structural_relations')
    `).all()).toEqual([]);
    for (const node of businessNodes) {
      expect(graph.getNode(business(node.key), snapshot.snapshotId)).toMatchObject({
        kind: node.kind,
        validity: "valid",
      });
    }
    expect(graph.listBusinessRelations(snapshot.snapshotId).map(({ type }) => type).sort())
      .toEqual([
        "constrained_by",
        "consumes",
        "invokes",
        "part_of",
        "publishes",
        "reads",
        "realized_by",
        "verified_by",
        "writes",
      ]);

    using reopenedGraph = new (await import("../../src/graph/graph-store.js")).GraphStore(
      context.repository,
    );
    expect(reopenedGraph.getNode(
      business("fixture/operation"),
      snapshot.snapshotId,
    )).toMatchObject({ label: "Operation", validity: "valid" });
  });

  it("rolls back a GraphPatch transaction when one operation is invalid", async () => {
    const context = await createGraphTestContext();
    contexts.push(context);
    const { graph, snapshot } = context;
    const evidence = evidenceFor(snapshot);
    const capability = businessNode("fixture/capability", "Capability", evidence);
    const operation = businessNode("fixture/operation", "Operation", evidence);
    graph.mutateBusinessGraph(mutation(snapshot.snapshotId, [capability, operation], [
      relation(operation.key, "part_of", business(capability.key), evidence),
    ]));

    expect(() => graph.mutateBusinessGraph({
      ...mutation(snapshot.snapshotId),
      removeRelations: [{
        from: business(operation.key),
        type: "part_of",
        to: business(capability.key),
      }],
      removeNodeKeys: [capability.key],
      upsertNodes: [{
        ...operation,
        label: "Changed in failed transaction",
        evidence: [{ ...evidence, contentHash: "f".repeat(64) }],
      }],
    })).toThrow(/evidence/i);

    expect(graph.getNode(business(operation.key), snapshot.snapshotId))
      .toMatchObject({ label: "fixture/operation" });
    expect(graph.getNode(business(capability.key), snapshot.snapshotId)).toBeDefined();
    expect(graph.listBusinessRelations(snapshot.snapshotId)).toHaveLength(1);
  });

  it("requires relation removal before deleting a referenced business node", async () => {
    const context = await createGraphTestContext();
    contexts.push(context);
    const { graph, snapshot } = context;
    const evidence = evidenceFor(snapshot);
    const capability = businessNode("fixture/capability", "Capability", evidence);
    const operation = businessNode("fixture/operation", "Operation", evidence);
    const partOf = relation(operation.key, "part_of", business(capability.key), evidence);
    graph.mutateBusinessGraph(mutation(snapshot.snapshotId, [capability, operation], [partOf]));

    expect(() => graph.mutateBusinessGraph({
      ...mutation(snapshot.snapshotId),
      removeNodeKeys: [capability.key],
    })).toThrow(/referenced/i);

    graph.mutateBusinessGraph({
      ...mutation(snapshot.snapshotId),
      removeRelations: [{ from: partOf.from, type: partOf.type, to: partOf.to }],
      removeNodeKeys: [capability.key],
    });
    expect(graph.getNode(business(capability.key), snapshot.snapshotId)).toBeUndefined();
  });
});

function businessNode(
  key: string,
  kind: BusinessNodeInput["kind"],
  evidence: BusinessNodeInput["evidence"][number],
): BusinessNodeInput {
  return {
    key,
    kind,
    label: key,
    summary: `${key} assertion`,
    aliases: [],
    certainty: "exact",
    evidence: [evidence],
  };
}

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
  return { from: business(from), type, to, certainty: "exact", evidence: [evidence] };
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
