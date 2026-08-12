import { afterEach, describe, expect, it } from "vitest";

import type { BusinessGraphMutation } from "../../src/graph/types.js";
import {
  createGraphTestContext,
  evidenceFor,
  type GraphTestContext,
} from "./graph-fixture.js";

describe("graph traversal", () => {
  const contexts: GraphTestContext[] = [];

  afterEach(async () => {
    await Promise.all(contexts.splice(0).map((context) => context.cleanup()));
  });

  it("leaves structural traversal to the backend-owned query layer", async () => {
    const context = await createGraphTestContext();
    contexts.push(context);
    const { graph, snapshot } = context;
    expect(graph.traverse(
      { domain: "structural", id: "repository:fixture" },
      { snapshotId: snapshot.snapshotId, maxDepth: 3, direction: "outgoing" },
    )).toEqual([]);
  });

  it("traverses persisted business hierarchy without copying structural nodes", async () => {
    const context = await createGraphTestContext();
    contexts.push(context);
    const { graph, snapshot } = context;
    const evidence = evidenceFor(snapshot);
    const mutation: BusinessGraphMutation = {
      baseSnapshotId: snapshot.snapshotId,
      upsertNodes: [
        {
          key: "fixture/capability",
          kind: "Capability",
          label: "Fixture capability",
          summary: "Owns fixture behavior.",
          aliases: [],
          certainty: "exact",
          evidence: [evidence],
        },
        {
          key: "fixture/operation",
          kind: "Operation",
          label: "Read fixture value",
          summary: "Reads the fixture value.",
          aliases: [],
          certainty: "exact",
          evidence: [evidence],
        },
      ],
      removeNodeKeys: [],
      upsertRelations: [
        {
          from: { domain: "business", key: "fixture/operation" },
          type: "part_of",
          to: { domain: "business", key: "fixture/capability" },
          certainty: "exact",
          evidence: [evidence],
        },
        {
          from: { domain: "business", key: "fixture/operation" },
          type: "realized_by",
          to: { domain: "structural", id: "symbol:src/example.ts#value" },
          certainty: "exact",
          evidence: [evidence],
        },
      ],
      removeRelations: [],
    };
    graph.mutateBusinessGraph(mutation);

    expect(graph.traverse(
      { domain: "business", key: "fixture/operation" },
      { snapshotId: snapshot.snapshotId, maxDepth: 1, direction: "outgoing" },
    ).map((neighbor) => [neighbor.relation.type, neighbor.node.kind])).toEqual([
      ["part_of", "Capability"],
    ]);
    expect(graph.listBusinessRelations(snapshot.snapshotId)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "realized_by", to: mutation.upsertRelations[1]!.to }),
    ]));
  });
});
