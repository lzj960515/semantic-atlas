import { afterEach, describe, expect, it } from "vitest";

import { createRepositorySnapshot } from "../../src/snapshots/repository-snapshot.js";
import {
  coreStructuralNodes,
  createGraphTestContext,
  evidenceFor,
  saveSnapshot,
  type GraphTestContext,
} from "./graph-fixture.js";

describe("business evidence lifecycle", () => {
  const contexts: GraphTestContext[] = [];

  afterEach(async () => {
    await Promise.all(contexts.splice(0).map((context) => context.cleanup()));
  });

  it("persists ordered evidence and derives valid, stale, and restored states", async () => {
    const context = await createGraphTestContext();
    contexts.push(context);
    const { dataDirectory, fixture, graph, repository, snapshot } = context;
    graph.replaceStructuralSnapshot(snapshot.snapshotId, coreStructuralNodes(snapshot), []);
    const evidence = evidenceFor(snapshot);
    graph.mutateBusinessGraph({
      baseSnapshotId: snapshot.snapshotId,
      upsertNodes: [
        {
          key: "fixture/read-value",
          kind: "Operation",
          label: "Read value",
          summary: "Returns the fixture value.",
          aliases: [],
          certainty: "inferred",
          evidence: [evidence],
        },
      ],
      removeNodeKeys: [],
      upsertRelations: [
        {
          from: { domain: "business", key: "fixture/read-value" },
          type: "realized_by",
          to: { domain: "structural", id: "symbol:src/example.ts#value" },
          certainty: "exact",
          evidence: [evidence],
        },
      ],
      removeRelations: [],
    });

    expect(graph.getEvidence({
      type: "node",
      node: { domain: "business", key: "fixture/read-value" },
    })).toEqual([evidence]);
    expect(graph.getEvidence({
      type: "relation",
      relation: {
        from: { domain: "business", key: "fixture/read-value" },
        type: "realized_by",
        to: { domain: "structural", id: "symbol:src/example.ts#value" },
      },
    })).toEqual([evidence]);
    expect(graph.getNode(
      { domain: "business", key: "fixture/read-value" },
      snapshot.snapshotId,
    )).toMatchObject({ certainty: "inferred", validity: "valid" });

    await fixture.write("src/example.ts", "export const value = 2;\n");
    await fixture.git("add", "src/example.ts");
    await fixture.git("commit", "-m", "test: change evidence");
    const changedSnapshot = await createRepositorySnapshot(repository);
    saveSnapshot(dataDirectory, repository, changedSnapshot);
    graph.replaceStructuralSnapshot(
      changedSnapshot.snapshotId,
      coreStructuralNodes(changedSnapshot),
      [],
    );
    expect(graph.getNode(
      { domain: "business", key: "fixture/read-value" },
      changedSnapshot.snapshotId,
    )).toMatchObject({ certainty: "inferred", validity: "stale" });
    expect(graph.traverse(
      { domain: "business", key: "fixture/read-value" },
      {
        snapshotId: changedSnapshot.snapshotId,
        maxDepth: 1,
        direction: "outgoing",
      },
    )[0]).toMatchObject({ relation: { validity: "stale" } });

    graph.replaceStructuralSnapshot(
      snapshot.snapshotId,
      coreStructuralNodes(snapshot),
      [],
    );
    expect(graph.getNode(
      { domain: "business", key: "fixture/read-value" },
      changedSnapshot.snapshotId,
    )).toMatchObject({ validity: "stale" });

    await fixture.write("src/example.ts", "export const value = 1;\n");
    await fixture.git("add", "src/example.ts");
    await fixture.git("commit", "-m", "test: restore evidence");
    const restoredSnapshot = await createRepositorySnapshot(repository);
    saveSnapshot(dataDirectory, repository, restoredSnapshot);
    graph.replaceStructuralSnapshot(
      restoredSnapshot.snapshotId,
      coreStructuralNodes(restoredSnapshot),
      [],
    );
    expect(graph.getNode(
      { domain: "business", key: "fixture/read-value" },
      restoredSnapshot.snapshotId,
    )).toMatchObject({ validity: "valid" });
  });

  it("rejects evidence that is not present in the asserted base snapshot", async () => {
    const context = await createGraphTestContext();
    contexts.push(context);
    const { graph, snapshot } = context;
    graph.replaceStructuralSnapshot(snapshot.snapshotId, coreStructuralNodes(snapshot), []);
    const invalidEvidence = {
      ...evidenceFor(snapshot),
      contentHash: "f".repeat(64),
    };

    expect(() => graph.mutateBusinessGraph({
      baseSnapshotId: snapshot.snapshotId,
      upsertNodes: [
        {
          key: "fixture/invalid",
          kind: "Operation",
          label: "Invalid evidence",
          summary: "Cannot be stored.",
          aliases: [],
          certainty: "exact",
          evidence: [invalidEvidence],
        },
      ],
      removeNodeKeys: [],
      upsertRelations: [],
      removeRelations: [],
    })).toThrow(/evidence/i);
    expect(graph.getNode(
      { domain: "business", key: "fixture/invalid" },
      snapshot.snapshotId,
    )).toBeUndefined();
  });
});
