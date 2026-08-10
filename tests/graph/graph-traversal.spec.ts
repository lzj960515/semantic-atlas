import { afterEach, describe, expect, it } from "vitest";

import type { BusinessGraphMutation } from "../../src/graph/types.js";
import {
  coreStructuralNodes,
  createGraphTestContext,
  evidenceFor,
  type GraphTestContext,
} from "./graph-fixture.js";

describe("graph traversal", () => {
  const contexts: GraphTestContext[] = [];

  afterEach(async () => {
    await Promise.all(contexts.splice(0).map((context) => context.cleanup()));
  });

  it("walks typed adjacency in either direction without revisiting nodes", async () => {
    const context = await createGraphTestContext();
    contexts.push(context);
    const { graph, snapshot } = context;
    graph.replaceStructuralSnapshot(snapshot.snapshotId, coreStructuralNodes(snapshot), [
      { from: "repository:fixture", type: "contains", to: "module:src" },
      { from: "module:src", type: "contains", to: "file:src/example.ts" },
      { from: "file:src/example.ts", type: "declares", to: "symbol:src/example.ts#value" },
      { from: "symbol:src/example.ts#value", type: "references", to: "module:src" },
    ]);

    const result = graph.traverse(
      { domain: "structural", id: "repository:fixture" },
      { snapshotId: snapshot.snapshotId, maxDepth: 3, direction: "outgoing" },
    );

    expect(result.map(({ depth, node }) => [depth, node.kind, "id" in node ? node.id : node.key]))
      .toEqual([
        [1, "Module", "module:src"],
        [2, "File", "file:src/example.ts"],
        [3, "Symbol", "symbol:src/example.ts#value"],
      ]);
    expect(graph.traverse(
      { domain: "structural", id: "symbol:src/example.ts#value" },
      {
        snapshotId: snapshot.snapshotId,
        maxDepth: 1,
        direction: "incoming",
        relationTypes: ["declares"],
      },
    ).map((neighbor) => neighbor.node.kind)).toEqual(["File"]);
  });

  it("traverses structural and learned relations through one reference model", async () => {
    const context = await createGraphTestContext();
    contexts.push(context);
    const { graph, snapshot } = context;
    graph.replaceStructuralSnapshot(snapshot.snapshotId, coreStructuralNodes(snapshot), []);
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
      ["realized_by", "Symbol"],
    ]);
  });
});
