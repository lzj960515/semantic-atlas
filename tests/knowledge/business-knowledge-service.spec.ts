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
  GraphSourceLocation,
  StructuralGraphNodeInput,
} from "../../src/graph/types.js";
import {
  coreStructuralNodes,
  createGraphTestContext,
  evidenceFor,
  locationFor,
  saveSnapshot,
  type GraphTestContext,
} from "../graph/graph-fixture.js";

describe("business knowledge learning", () => {
  const contexts: GraphTestContext[] = [];

  afterEach(async () => {
    await Promise.all(contexts.splice(0).map((context) => context.cleanup()));
  });

  it("atomically learns a navigable business hierarchy from GraphPatch v1", async () => {
    const context = await graphContext(contexts);
    const { graph, repository, snapshot } = context;
    graph.replaceStructuralSnapshot(snapshot.snapshotId, coreStructuralNodes(snapshot), []);
    const evidence = evidenceFor(snapshot);
    const capability = businessNode("fixture", "Capability", evidence);
    const scenario = businessNode("fixture/read-value", "Scenario", evidence);
    const operation = businessNode("fixture/read-value/return-value", "Operation", evidence);
    const service = new BusinessKnowledgeService(repository, graph);

    const result = await service.learn(patch(
      snapshot.snapshotId,
      [capability, scenario, operation],
      [
        businessRelation(scenario.key, "part_of", business(capability.key), evidence),
        businessRelation(operation.key, "part_of", business(scenario.key), evidence),
        businessRelation(
          operation.key,
          "realized_by",
          structural("symbol:src/example.ts#value"),
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
      "realized_by",
    ]);
    expect(neighbors.find(({ relation }) => relation.type === "realized_by")?.relation)
      .toMatchObject({
        certainty: "exact",
        validity: "valid",
        evidence: [evidence],
      });
  });

  it("rejects an old base snapshot before writing any operation", async () => {
    const context = await graphContext(contexts);
    const { fixture, graph, repository, snapshot } = context;
    graph.replaceStructuralSnapshot(snapshot.snapshotId, coreStructuralNodes(snapshot), []);
    const service = new BusinessKnowledgeService(repository, graph);
    const node = businessNode("fixture/stale-write", "Operation", evidenceFor(snapshot));

    await fixture.write("src/example.ts", "export const value = 2;\n");

    await expect(service.learn(patch(snapshot.snapshotId, [node]))).rejects.toMatchObject({
      name: "GraphPatchConflictError",
      code: "BASE_SNAPSHOT_MISMATCH",
      baseSnapshotId: snapshot.snapshotId,
    } satisfies Partial<GraphPatchConflictError>);
    expect(graph.getNode(business(node.key), snapshot.snapshotId)).toBeUndefined();
  });

  it("rolls back valid operations when a relation references a missing node", async () => {
    const context = await graphContext(contexts);
    const { graph, repository, snapshot } = context;
    graph.replaceStructuralSnapshot(snapshot.snapshotId, coreStructuralNodes(snapshot), []);
    const evidence = evidenceFor(snapshot);
    const node = businessNode("fixture/rolled-back", "Operation", evidence);
    const service = new BusinessKnowledgeService(repository, graph);

    await expect(service.learn(patch(snapshot.snapshotId, [node], [
      businessRelation(
        "fixture/missing-source",
        "realized_by",
        structural("symbol:src/example.ts#value"),
        evidence,
      ),
    ]))).rejects.toThrow(/missing/i);

    expect(graph.getNode(business(node.key), snapshot.snapshotId)).toBeUndefined();
  });

  it("rejects removals whose referenced nodes are missing", async () => {
    const context = await graphContext(contexts);
    const { graph, repository, snapshot } = context;
    graph.replaceStructuralSnapshot(snapshot.snapshotId, coreStructuralNodes(snapshot), []);
    const service = new BusinessKnowledgeService(repository, graph);

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
            to: structural("symbol:src/example.ts#value"),
          },
        },
      ],
    })).rejects.toThrow(/missing/i);
  });

  it("rejects repository-boundary, changed-hash, and relation-kind violations", async () => {
    const context = await graphContext(contexts);
    const { graph, repository, snapshot } = context;
    graph.replaceStructuralSnapshot(snapshot.snapshotId, coreStructuralNodes(snapshot), []);
    const evidence = evidenceFor(snapshot);
    const service = new BusinessKnowledgeService(repository, graph);

    const outsideEvidenceNode = businessNode("fixture/outside", "Operation", {
      ...evidence,
      file: "../outside.ts",
    });
    await expect(service.learn(patch(snapshot.snapshotId, [outsideEvidenceNode])))
      .rejects.toThrow(/repository-relative path/i);

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
            to: structural("symbol:src/example.ts#value"),
            certainty: "exact",
            evidence: [evidence],
          },
        },
      ],
    };
    await expect(service.learn(invalidRelationPatch)).rejects.toThrow();

    for (const key of [outsideEvidenceNode.key, changedHashNode.key, "fixture/invalid-relation"]) {
      expect(graph.getNode(business(key), snapshot.snapshotId)).toBeUndefined();
    }
  });

  it("marks only changed evidence stale while preserving hypothesis and unknown states", async () => {
    const context = await graphContext(contexts);
    const { fixture, graph, repository } = context;
    await fixture.write("src/stable.ts", "export const stable = true;\n");
    await fixture.git("add", "src/stable.ts");
    await fixture.git("commit", "-m", "test: add stable evidence");
    const baseSnapshot = await createRepositorySnapshot(repository);
    saveSnapshot(context.dataDirectory, repository, baseSnapshot);
    graph.replaceStructuralSnapshot(baseSnapshot.snapshotId, lifecycleNodes(baseSnapshot), []);
    const changingEvidence = evidenceFor(baseSnapshot);
    const stableEvidence = evidenceAt(
      baseSnapshot,
      "symbol:src/stable.ts#stable",
      "src/stable.ts",
      28,
    );
    const service = new BusinessKnowledgeService(repository, graph);

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
    saveSnapshot(context.dataDirectory, repository, changedSnapshot);
    graph.replaceStructuralSnapshot(changedSnapshot.snapshotId, lifecycleNodes(changedSnapshot), []);

    expect(graph.getNode(business("fixture/changing"), changedSnapshot.snapshotId))
      .toMatchObject({ validity: "stale", certainty: "exact" });
    expect(graph.getNode(business("fixture/stable"), changedSnapshot.snapshotId))
      .toMatchObject({ validity: "valid", certainty: "exact" });
    expect(graph.getNode(business("fixture/hypothesis"), changedSnapshot.snapshotId))
      .toMatchObject({ validity: "valid", certainty: "hypothesis" });
    expect(graph.listUnknownBoundaries(changedSnapshot.snapshotId))
      .toEqual([expect.objectContaining({ validity: "unknown" })]);
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

function lifecycleNodes(snapshot: RepositorySnapshot): readonly StructuralGraphNodeInput[] {
  const stableLocation = sourceLocation(snapshot, "src/stable.ts", 28);
  return [
    ...coreStructuralNodes(snapshot),
    {
      id: "file:src/stable.ts",
      kind: "File",
      label: "src/stable.ts",
      locations: [stableLocation],
    },
    {
      id: "symbol:src/stable.ts#stable",
      kind: "Symbol",
      label: "stable",
      locations: [stableLocation],
    },
    {
      id: "unknown:src/example.ts#dynamic-value",
      kind: "UnknownBoundary",
      label: "Dynamic value",
      reason: "The property name is selected at runtime.",
      location: locationFor(snapshot),
      candidates: ["symbol:src/example.ts#value"],
    },
  ];
}

function evidenceAt(
  snapshot: RepositorySnapshot,
  symbolId: string,
  file: string,
  endColumn: number,
): Evidence {
  return { symbolId, ...sourceLocation(snapshot, file, endColumn) };
}

function sourceLocation(
  snapshot: RepositorySnapshot,
  file: string,
  endColumn: number,
): GraphSourceLocation {
  const source = snapshot.files.find((candidate) => candidate.path === file);
  if (source?.worktree === null || source?.worktree === undefined) {
    throw new Error(`Expected ${file} in test snapshot`);
  }
  return {
    file,
    range: {
      start: { line: 1, column: 1 },
      end: { line: 1, column: endColumn },
    },
    contentHash: source.worktree.contentHash,
  };
}
