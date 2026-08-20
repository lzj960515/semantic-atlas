import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import type {
  BusinessGraphMutation,
  BusinessNodeInput,
  BusinessRelationInput,
} from "../../src/graph/types.js";
import { bindStructuralTarget } from "../../src/knowledge/structural-target-binding.js";
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

    expect(graph.schemaVersion).toBe(1);
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

  it("atomically reparents a stable business subtree", async () => {
    const context = await createGraphTestContext();
    contexts.push(context);
    const { graph, snapshot } = context;
    const evidence = evidenceFor(snapshot);
    const refunds = businessNode("refunds", "Operation", evidence);
    const orders = businessNode("orders", "Capability", evidence);
    const commerce = businessNode("commerce", "Capability", evidence);
    const refundRule = businessNode("refunds/rule", "Invariant", evidence);
    const refundsInOrders = relation(refunds.key, "part_of", business(orders.key), evidence);
    const ruleInRefunds = relation(refundRule.key, "part_of", business(refunds.key), evidence);
    graph.mutateBusinessGraph(mutation(
      snapshot.snapshotId,
      [refunds, orders, refundRule],
      [refundsInOrders, ruleInRefunds],
    ));

    expect(graph.listBusinessRoots(snapshot.snapshotId).map(({ key }) => key))
      .toEqual([orders.key]);

    graph.mutateBusinessGraph({
      ...mutation(snapshot.snapshotId, [commerce], [
        relation(refunds.key, "part_of", business(commerce.key), evidence),
      ]),
      removeRelations: [{
        from: refundsInOrders.from,
        type: refundsInOrders.type,
        to: refundsInOrders.to,
      }],
    });

    expect(graph.listBusinessRoots(snapshot.snapshotId).map(({ key }) => key))
      .toEqual([commerce.key, orders.key]);
    expect(graph.getNode(business(refunds.key), snapshot.snapshotId)).toMatchObject({
      key: refunds.key,
      label: refunds.label,
      evidence: refunds.evidence,
    });
    expect(graph.listBusinessRelations(snapshot.snapshotId)).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: business(refunds.key), to: business(commerce.key) }),
      expect.objectContaining({ from: business(refundRule.key), to: business(refunds.key) }),
    ]));
  });

  it("rejects a second hierarchy parent without removing the current parent", async () => {
    const context = await createGraphTestContext();
    contexts.push(context);
    const { graph, snapshot } = context;
    const evidence = evidenceFor(snapshot);
    const child = businessNode("refunds", "Operation", evidence);
    const orders = businessNode("orders", "Capability", evidence);
    const support = businessNode("support", "Capability", evidence);
    graph.mutateBusinessGraph(mutation(snapshot.snapshotId, [child, orders, support], [
      relation(child.key, "part_of", business(orders.key), evidence),
    ]));

    expect(() => graph.mutateBusinessGraph(mutation(snapshot.snapshotId, [], [
      relation(child.key, "part_of", business(support.key), evidence),
    ]))).toThrow(/one.*part_of parent/iu);

    expect(graph.listBusinessRelations(snapshot.snapshotId)
      .filter(({ type }) => type === "part_of"))
      .toEqual([expect.objectContaining({ from: business(child.key), to: business(orders.key) })]);
  });

  it("rejects a hierarchy cycle without changing the existing tree", async () => {
    const context = await createGraphTestContext();
    contexts.push(context);
    const { graph, snapshot } = context;
    const evidence = evidenceFor(snapshot);
    const commerce = businessNode("commerce", "Capability", evidence);
    const orders = businessNode("orders", "Capability", evidence);
    graph.mutateBusinessGraph(mutation(snapshot.snapshotId, [commerce, orders], [
      relation(orders.key, "part_of", business(commerce.key), evidence),
    ]));

    expect(() => graph.mutateBusinessGraph(mutation(snapshot.snapshotId, [], [
      relation(commerce.key, "part_of", business(orders.key), evidence),
    ]))).toThrow(/cycle/iu);

    expect(graph.listBusinessRoots(snapshot.snapshotId).map(({ key }) => key))
      .toEqual([commerce.key]);
  });

  it("updates a structural relation after its target reference is rebound", async () => {
    const context = await createGraphTestContext();
    contexts.push(context);
    const { graph, snapshot } = context;
    const evidence = evidenceFor(snapshot);
    const operation = businessNode("fixture/operation", "Operation", evidence);
    const reboundTarget = "symbol:src/example.ts#renamedValue";
    const targetBinding = {
      structuralReference: reboundTarget,
      file: evidence.file,
      qualifiedSymbol: "value",
      structuralKind: "Symbol" as const,
      range: evidence.range,
      atlasSnapshotId: snapshot.snapshotId,
      backendVersion: "1.5.0",
      backendLocator: `backend:${reboundTarget}`,
    };
    const originalRelation = bindStructuralTarget(
      relation(
        operation.key,
        "realized_by",
        structural("symbol:src/example.ts#value"),
        evidence,
      ),
      targetBinding,
    );
    graph.mutateBusinessGraph(mutation(snapshot.snapshotId, [operation], [originalRelation]));

    const reboundRelation = bindStructuralTarget(
      relation(operation.key, "realized_by", structural(reboundTarget), evidence),
      targetBinding,
    );
    graph.mutateBusinessGraph(mutation(snapshot.snapshotId, [], [reboundRelation]));

    expect(graph.listBusinessRelations(snapshot.snapshotId)).toEqual([
      expect.objectContaining({
        from: business(operation.key),
        type: "realized_by",
        to: structural(reboundTarget),
      }),
    ]);
    using database = new DatabaseSync(graph.databasePath, { readOnly: true });
    expect(database.prepare("SELECT COUNT(*) AS count FROM atlas_business_relations").get())
      .toEqual({ count: 1 });
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
