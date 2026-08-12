import { afterEach, describe, expect, it } from "vitest";

import {
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
    expect(graph.search("src example", { snapshotId: snapshot.snapshotId })[0]?.node)
      .toMatchObject({ domain: "business", key: "commerce/orders/place-order" });
    expect(graph.search("value", { snapshotId: snapshot.snapshotId, limit: 2 }))
      .toHaveLength(1);
    expect(graph.search("punctuation-only !!!", { snapshotId: snapshot.snapshotId })).toEqual([]);
  });

  it("reports scores in the same relevance order as FTS ranking", async () => {
    const context = await createGraphTestContext();
    contexts.push(context);
    const { graph, snapshot } = context;
    const evidence = evidenceFor(snapshot);
    graph.mutateBusinessGraph({
      baseSnapshotId: snapshot.snapshotId,
      upsertNodes: [
        {
          key: "fixture/strong-ranking-match",
          kind: "Operation",
          label: "Rankingprobe operation",
          summary: "Matches the strongest indexed field.",
          aliases: [],
          certainty: "exact",
          evidence: [evidence],
        },
        {
          key: "fixture/weak-ranking-match",
          kind: "Operation",
          label: "Secondary operation",
          summary: "Contains rankingprobe only in a lower-weight summary field.",
          aliases: [],
          certainty: "exact",
          evidence: [evidence],
        },
      ],
      removeNodeKeys: [],
      upsertRelations: [],
      removeRelations: [],
    });

    const results = graph.search("rankingprobe", { snapshotId: snapshot.snapshotId });

    expect(results.map(({ node }) => node.domain === "business" ? node.key : node.id))
      .toEqual(["fixture/strong-ranking-match", "fixture/weak-ranking-match"]);
    expect(results[0]!.score).toBeGreaterThan(results[1]!.score);
    expect(results.every(({ score }) => score >= 0 && score <= 1)).toBe(true);
  });
});
