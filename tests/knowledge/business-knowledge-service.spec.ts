import { afterEach, describe, expect, it } from "vitest";

import {
  BusinessKnowledgeService,
  GraphPatchConflictError,
} from "../../src/knowledge/business-knowledge-service.js";
import { createRepositorySnapshot } from "../../src/snapshots/repository-snapshot.js";
import type { RepositorySnapshot } from "../../src/snapshots/types.js";
import type {
  BusinessNodeInput,
  BusinessRelationInput,
  Evidence,
} from "../../src/graph/types.js";
import {
  createGraphTestContext,
  saveSnapshot,
  type GraphTestContext,
} from "../graph/graph-fixture.js";
import { WorldSnapshotStore } from "../../src/world/world-snapshot-store.js";

describe("business knowledge learning", () => {
  const contexts: GraphTestContext[] = [];

  afterEach(async () => {
    await Promise.all(contexts.splice(0).map((context) => context.cleanup()));
  });

  it("atomically learns a navigable business hierarchy from GraphPatch v1", async () => {
    const context = await graphContext(contexts);
    const { graph, repository, snapshot } = context;
    const evidence = context.evidence;
    const capability = businessNode("fixture", "Capability", evidence);
    const scenario = businessNode("fixture/read-value", "Scenario", evidence);
    const operation = businessNode("fixture/read-value/return-value", "Operation", evidence);
    const service = new BusinessKnowledgeService(repository, graph, context.structuralBackend);

    const result = await service.learn(patch(
      snapshot.snapshotId,
      [capability, scenario, operation],
      [
        businessRelation(scenario.key, "part_of", business(capability.key), evidence),
        businessRelation(operation.key, "part_of", business(scenario.key), evidence),
        businessRelation(
          operation.key,
          "realized_by",
          structural(evidence.symbolId),
          evidence,
        ),
      ],
    ));

    expect(result).toEqual({
      baseSnapshotId: snapshot.snapshotId,
      snapshotId: snapshot.snapshotId,
      applied: { nodeOperations: 3, relationOperations: 3 },
    });
    expect(graph.getNode(business(capability.key), snapshot.snapshotId)).toMatchObject({
      kind: "Capability",
      validity: "valid",
    });
    const neighbors = graph.traverse(business(operation.key), {
      snapshotId: snapshot.snapshotId,
      direction: "outgoing",
      maxDepth: 2,
    });
    expect(neighbors.map(({ relation }) => relation.type).sort()).toEqual([
      "part_of",
      "part_of",
    ]);
    expect(graph.listBusinessRelations(snapshot.snapshotId)
      .find(({ type }) => type === "realized_by"))
      .toMatchObject({
        certainty: "exact",
        validity: "valid",
        evidence: [evidence],
      });
  });

  it("rejects an old base snapshot before writing any operation", async () => {
    const context = await graphContext(contexts);
    const { fixture, graph, repository, snapshot } = context;
    const service = new BusinessKnowledgeService(repository, graph, context.structuralBackend);
    const node = businessNode("fixture/stale-write", "Operation", context.evidence);

    await fixture.write("src/example.ts", "export const value = 2;\n");

    await expect(service.learn(patch(snapshot.snapshotId, [node]))).rejects.toMatchObject({
      name: "GraphPatchConflictError",
      code: "BASE_SNAPSHOT_MISMATCH",
      baseSnapshotId: snapshot.snapshotId,
    } satisfies Partial<GraphPatchConflictError>);
    expect(graph.getNode(business(node.key), snapshot.snapshotId)).toBeUndefined();
  });

  it("rejects learning while the combined world snapshot is failed", async () => {
    const context = await graphContext(contexts);
    const { graph, repository, snapshot } = context;
    using world = new WorldSnapshotStore(repository);
    world.fail(snapshot.snapshotId, new Error("world reconciliation failed"));
    const service = new BusinessKnowledgeService(repository, graph, context.structuralBackend);
    const node = businessNode("fixture/failed-world", "Operation", context.evidence);

    await expect(service.learn(patch(snapshot.snapshotId, [node])))
      .rejects.toThrow(/world snapshot is failed/iu);
    expect(graph.getNode(business(node.key), snapshot.snapshotId)).toBeUndefined();
  });

  it("rolls back valid operations when a relation references a missing node", async () => {
    const context = await graphContext(contexts);
    const { graph, repository, snapshot } = context;
    const evidence = context.evidence;
    const node = businessNode("fixture/rolled-back", "Operation", evidence);
    const service = new BusinessKnowledgeService(repository, graph, context.structuralBackend);

    await expect(service.learn(patch(snapshot.snapshotId, [node], [
      businessRelation(
        "fixture/missing-source",
        "realized_by",
        structural(evidence.symbolId),
        evidence,
      ),
    ]))).rejects.toThrow(/missing/i);

    expect(graph.getNode(business(node.key), snapshot.snapshotId)).toBeUndefined();
  });

  it("rejects removals whose referenced nodes are missing", async () => {
    const context = await graphContext(contexts);
    const { graph, repository, snapshot } = context;
    const service = new BusinessKnowledgeService(repository, graph, context.structuralBackend);

    await expect(service.learn({
      schemaVersion: 1,
      baseSnapshotId: snapshot.snapshotId,
      nodeOperations: [{ op: "remove", key: "fixture/missing-node" }],
      relationOperations: [],
    })).rejects.toThrow(/missing/i);

    await expect(service.learn({
      schemaVersion: 1,
      baseSnapshotId: snapshot.snapshotId,
      nodeOperations: [],
      relationOperations: [
        {
          op: "remove",
          relation: {
            from: business("fixture/missing-source"),
            type: "realized_by",
            to: structural(context.evidence.symbolId),
          },
        },
      ],
    })).rejects.toThrow(/missing/i);
  });

  it("removes a stale structural relation without resolving its former target", async () => {
    const context = await graphContext(contexts);
    const { graph, repository, snapshot } = context;
    const node = businessNode("fixture/stale-target", "Operation", context.evidence);
    const relation = businessRelation(
      node.key,
      "realized_by",
      structural(context.evidence.symbolId),
      context.evidence,
    );
    graph.mutateBusinessGraph({
      baseSnapshotId: snapshot.snapshotId,
      upsertNodes: [node],
      removeNodeKeys: [],
      upsertRelations: [relation],
      removeRelations: [],
    });
    const unavailableStructural = new Proxy(context.structuralBackend, {
      get(target, property) {
        if (property === "getNode") {
          return async () => undefined;
        }
        return Reflect.get(target, property, target) as unknown;
      },
    });
    const service = new BusinessKnowledgeService(repository, graph, unavailableStructural);

    await expect(service.learn({
      schemaVersion: 1,
      baseSnapshotId: snapshot.snapshotId,
      nodeOperations: [],
      relationOperations: [{
        op: "remove",
        relation: { from: relation.from, type: relation.type, to: relation.to },
      }],
    })).resolves.toMatchObject({ applied: { relationOperations: 1 } });
    expect(graph.listBusinessRelations(snapshot.snapshotId)).toEqual([]);
  });

  it("rejects repository-boundary, fabricated-reference, changed-hash, and relation-kind violations", async () => {
    const context = await graphContext(contexts);
    const { graph, repository, snapshot } = context;
    const evidence = context.evidence;
    const service = new BusinessKnowledgeService(repository, graph, context.structuralBackend);

    const outsideEvidenceNode = businessNode("fixture/outside", "Operation", {
      ...evidence,
      file: "../outside.ts",
    });
    await expect(service.learn(patch(snapshot.snapshotId, [outsideEvidenceNode])))
      .rejects.toThrow(/repository-relative path/i);

    const fabricatedReferenceNode = businessNode("fixture/fabricated-reference", "Operation", {
      ...evidence,
      symbolId: "symbol:src/example.ts#fabricated",
    });
    await expect(service.learn(patch(snapshot.snapshotId, [fabricatedReferenceNode])))
      .rejects.toThrow(/does not resolve/i);

    const changedHashNode = businessNode("fixture/changed-hash", "Operation", {
      ...evidence,
      contentHash: "f".repeat(64),
    });
    await expect(service.learn(patch(snapshot.snapshotId, [changedHashNode])))
      .rejects.toThrow(/does not match snapshot/i);

    const invalidRelationPatch = {
      schemaVersion: 1,
      baseSnapshotId: snapshot.snapshotId,
      nodeOperations: [
        {
          op: "upsert",
          node: businessNode("fixture/invalid-relation", "Operation", evidence),
        },
      ],
      relationOperations: [
        {
          op: "upsert",
          relation: {
            from: business("fixture/invalid-relation"),
            type: "contains",
            to: structural(evidence.symbolId),
            certainty: "exact",
            evidence: [evidence],
          },
        },
      ],
    };
    await expect(service.learn(invalidRelationPatch)).rejects.toThrow();

    for (const key of [
      outsideEvidenceNode.key,
      fabricatedReferenceNode.key,
      changedHashNode.key,
      "fixture/invalid-relation",
    ]) {
      expect(graph.getNode(business(key), snapshot.snapshotId)).toBeUndefined();
    }
  });

  it("marks only changed evidence stale while preserving hypothesis certainty", async () => {
    const context = await graphContext(contexts);
    const { fixture, graph, repository } = context;
    await fixture.write("src/stable.ts", "export const stable = true;\n");
    await fixture.git("add", "src/stable.ts");
    await fixture.git("commit", "-m", "test: add stable evidence");
    await context.structuralBackend.sync();
    const baseSnapshot = await createRepositorySnapshot(repository);
    saveSnapshot(repository, baseSnapshot);
    graph.reconcileSnapshot(baseSnapshot.snapshotId);
    const changingNode = await context.structuralBackend.getNode({ id: context.evidence.symbolId });
    const stableNode = (await context.structuralBackend.search({ query: "stable", limit: 10 }))
      .find(({ node }) => node.name === "stable")?.node;
    if (changingNode === undefined || stableNode === undefined) {
      throw new Error("Expected current structural evidence nodes");
    }
    using world = new WorldSnapshotStore(repository);
    world.begin(baseSnapshot.snapshotId);
    world.publish(baseSnapshot, "1.5.0", 1, {
      getNode: (reference) => {
        if (reference === changingNode.reference.id) return changingNode;
        if (reference === stableNode.reference.id) return stableNode;
        return undefined;
      },
      findCandidates: ({ file }) => [changingNode, stableNode].filter((node) => node.path === file),
      backendLocator: (node) => `backend:${node.reference.id}`,
    }, {
      fromSnapshotId: context.snapshot.snapshotId,
      toSnapshotId: baseSnapshot.snapshotId,
      structural: { added: ["src/stable.ts"], modified: [], removed: [] },
    });
    const changingEvidence = evidenceAtNode(baseSnapshot, changingNode);
    const stableEvidence = evidenceAtNode(baseSnapshot, stableNode);
    const service = new BusinessKnowledgeService(repository, graph, context.structuralBackend);

    await service.learn(patch(baseSnapshot.snapshotId, [
      businessNode("fixture/changing", "Operation", changingEvidence),
      businessNode("fixture/stable", "Invariant", stableEvidence),
      {
        ...businessNode("fixture/hypothesis", "Scenario", stableEvidence),
        certainty: "hypothesis",
      },
    ]));

    await fixture.write("src/example.ts", "export const value = 2;\n");
    const changedSnapshot = await createRepositorySnapshot(repository);
    saveSnapshot(repository, changedSnapshot);
    graph.reconcileSnapshot(changedSnapshot.snapshotId);

    expect(graph.getNode(business("fixture/changing"), changedSnapshot.snapshotId))
      .toMatchObject({ validity: "stale", certainty: "exact" });
    expect(graph.getNode(business("fixture/stable"), changedSnapshot.snapshotId))
      .toMatchObject({ validity: "valid", certainty: "exact" });
    expect(graph.getNode(business("fixture/hypothesis"), changedSnapshot.snapshotId))
      .toMatchObject({ validity: "valid", certainty: "hypothesis" });
  });
});

async function graphContext(contexts: GraphTestContext[]): Promise<GraphTestContext> {
  const context = await createGraphTestContext();
  contexts.push(context);
  return context;
}

function patch(
  snapshotId: string,
  nodes: readonly BusinessNodeInput[] = [],
  relations: readonly BusinessRelationInput[] = [],
) {
  return {
    schemaVersion: 1,
    baseSnapshotId: snapshotId,
    nodeOperations: nodes.map((node) => ({ op: "upsert", node })),
    relationOperations: relations.map((relation) => ({ op: "upsert", relation })),
  };
}

function businessNode(
  key: string,
  kind: BusinessNodeInput["kind"],
  evidence: Evidence,
): BusinessNodeInput {
  return {
    key,
    kind,
    label: key,
    summary: `Verified knowledge for ${key}.`,
    aliases: [],
    certainty: "exact",
    evidence: [evidence],
  };
}

function businessRelation(
  from: string,
  type: BusinessRelationInput["type"],
  to: BusinessRelationInput["to"],
  evidence: Evidence,
): BusinessRelationInput {
  return {
    from: business(from),
    type,
    to,
    certainty: "exact",
    evidence: [evidence],
  };
}

function business(key: string) {
  return { domain: "business" as const, key };
}

function structural(id: string) {
  return { domain: "structural" as const, id };
}

function evidenceAtNode(
  snapshot: RepositorySnapshot,
  node: import("../../src/structural-backend/types.js").StructuralNode,
): Evidence {
  const source = snapshot.files.find((candidate) => candidate.path === node.path);
  if (source?.worktree === null || source?.worktree === undefined) {
    throw new Error(`Expected ${node.path} in test snapshot`);
  }
  return {
    symbolId: node.reference.id,
    file: node.path,
    range: node.range,
    contentHash: source.worktree.contentHash,
  };
}
