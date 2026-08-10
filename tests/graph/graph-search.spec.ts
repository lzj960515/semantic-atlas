import { afterEach, describe, expect, it } from "vitest";

import {
  coreStructuralNodes,
  createGraphTestContext,
  evidenceFor,
  type GraphTestContext,
} from "./graph-fixture.js";

describe("graph lexical search", () => {
  const contexts: GraphTestContext[] = [];

  afterEach(async () => {
    await Promise.all(contexts.splice(0).map((context) => context.cleanup()));
  });

  it("indexes labels, aliases, summaries, symbols, and paths for the requested snapshot", async () => {
    const context = await createGraphTestContext();
    contexts.push(context);
    const { graph, snapshot } = context;
    graph.replaceStructuralSnapshot(snapshot.snapshotId, coreStructuralNodes(snapshot), []);
    graph.mutateBusinessGraph({
      baseSnapshotId: snapshot.snapshotId,
      upsertNodes: [
        {
          key: "commerce/orders/place-order",
          kind: "Operation",
          label: "Place order",
          summary: "Validates and creates a customer purchase.",
          aliases: ["checkout"],
          certainty: "exact",
          evidence: [evidenceFor(snapshot)],
        },
      ],
      removeNodeKeys: [],
      upsertRelations: [],
      removeRelations: [],
    });

    expect(graph.search("checkout", { snapshotId: snapshot.snapshotId })[0]?.node)
      .toMatchObject({ domain: "business", key: "commerce/orders/place-order" });
    expect(graph.search("customer purchase", { snapshotId: snapshot.snapshotId })[0]?.node)
      .toMatchObject({ domain: "business", key: "commerce/orders/place-order" });
    expect(graph.search("src example", { snapshotId: snapshot.snapshotId })
      .some(({ node }) => node.domain === "structural" && node.id === "file:src/example.ts"))
      .toBe(true);
    expect(graph.search("value", { snapshotId: snapshot.snapshotId, limit: 2 }))
      .toHaveLength(2);
    expect(graph.search("punctuation-only !!!", { snapshotId: snapshot.snapshotId })).toEqual([]);
  });
});
