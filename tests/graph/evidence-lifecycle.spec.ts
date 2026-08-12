import { afterEach, describe, expect, it } from "vitest";

import { createRepositorySnapshot } from "../../src/snapshots/repository-snapshot.js";
import {
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
    const { fixture, graph, repository, snapshot } = context;
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
    saveSnapshot(repository, changedSnapshot);
    graph.reconcileSnapshot(changedSnapshot.snapshotId);
    expect(graph.getNode(
      { domain: "business", key: "fixture/read-value" },
      changedSnapshot.snapshotId,
    )).toMatchObject({ certainty: "inferred", validity: "stale" });
    expect(graph.listBusinessRelations(changedSnapshot.snapshotId)[0])
      .toMatchObject({ validity: "stale" });

    await fixture.write("src/example.ts", "export const value = 1;\n");
    await fixture.git("add", "src/example.ts");
    await fixture.git("commit", "-m", "test: restore evidence");
    const restoredSnapshot = await createRepositorySnapshot(repository);
    saveSnapshot(repository, restoredSnapshot);
    graph.reconcileSnapshot(restoredSnapshot.snapshotId);
    expect(graph.getNode(
      { domain: "business", key: "fixture/read-value" },
      restoredSnapshot.snapshotId,
    )).toMatchObject({ validity: "valid" });
  });

  it("rejects evidence that is not present in the asserted base snapshot", async () => {
    const context = await createGraphTestContext();
    contexts.push(context);
    const { graph, snapshot } = context;
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
