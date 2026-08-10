import { afterEach, describe, expect, it } from "vitest";

import { createRepositorySnapshot } from "../../src/snapshots/repository-snapshot.js";
import {
  coreStructuralNodes,
  createGraphTestContext,
  locationFor,
  saveSnapshot,
  type GraphTestContext,
} from "./graph-fixture.js";

describe("unknown boundary lifecycle", () => {
  const contexts: GraphTestContext[] = [];

  afterEach(async () => {
    await Promise.all(contexts.splice(0).map((context) => context.cleanup()));
  });

  it("persists unresolved boundaries by snapshot and resolves them without rewriting history", async () => {
    const context = await createGraphTestContext();
    contexts.push(context);
    const { dataDirectory, fixture, graph, repository, snapshot } = context;
    const unknown = {
      id: "unknown:src/example.ts#dynamic-import",
      kind: "UnknownBoundary" as const,
      label: "Dynamic import",
      reason: "The module specifier is computed at runtime.",
      location: locationFor(snapshot),
      candidates: ["file:src/first.ts", "file:src/second.ts"],
    };
    graph.replaceStructuralSnapshot(
      snapshot.snapshotId,
      [...coreStructuralNodes(snapshot), unknown],
      [],
    );

    expect(graph.listUnknownBoundaries(snapshot.snapshotId)).toEqual([
      expect.objectContaining({
        ...unknown,
        domain: "structural",
        snapshotId: snapshot.snapshotId,
        validity: "unknown",
      }),
    ]);

    await fixture.write("src/resolved.ts", "export const resolved = true;\n");
    const resolvedSnapshot = await createRepositorySnapshot(repository);
    saveSnapshot(dataDirectory, repository, resolvedSnapshot);
    graph.replaceStructuralSnapshot(
      resolvedSnapshot.snapshotId,
      coreStructuralNodes(resolvedSnapshot),
      [],
    );

    expect(graph.listUnknownBoundaries(resolvedSnapshot.snapshotId)).toEqual([]);
    expect(graph.listUnknownBoundaries(snapshot.snapshotId)).toHaveLength(1);
  });
});
