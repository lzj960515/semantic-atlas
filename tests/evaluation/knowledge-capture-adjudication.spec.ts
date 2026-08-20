import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buildKnowledgeCaptureAdjudicationEvidence,
} from "../../scripts/evaluation/knowledge-capture-adjudication.js";
import type { EvaluationRun } from "../../src/evaluation/contracts.js";

describe("knowledge-capture adjudication evidence", () => {
  it("reduces retained Atlas envelopes to business coverage and successful source evidence", () => {
    const run = JSON.parse(readFileSync(
      "evaluation/results/fresh-agent-discovery-v5/location-nestjs-provider-atlas.json",
      "utf8",
    )) as EvaluationRun;

    const evidence = buildKnowledgeCaptureAdjudicationEvidence(run);
    const mapShow = evidence.atlasCalls.find(
      (call) => call.resultCommand === "map.show",
    );

    expect(evidence.skillDiscovery?.knowledgeCaptureDecision.outcome).toBe(
      "persist",
    );
    expect(evidence.successfulSourceOpens.map(({ file }) => file)).toEqual([
      "src/orders/order.service.ts",
      "src/orders/orders.module.ts",
    ]);
    expect(
      evidence.atlasCalls.flatMap(({ businessNodes }) => businessNodes),
    ).toEqual([]);
    expect(mapShow).toMatchObject({
      status: "partial",
      businessNodeCount: 0,
      businessNodes: [],
      businessNodesTruncated: false,
    });
    expect(mapShow?.structuralNodeCount).toBeGreaterThan(0);
    expect(mapShow?.unknownBoundaryCount).toBeGreaterThan(0);
    expect(JSON.stringify(evidence)).not.toContain('"output"');
  });

  it("bounds business-node evidence while retaining the complete count", () => {
    const run = JSON.parse(readFileSync(
      "evaluation/results/fresh-agent-discovery-v5/location-nestjs-provider-atlas.json",
      "utf8",
    )) as EvaluationRun;
    run.observations.atlasCalls = [{
      sequence: 1,
      commandSequence: 2,
      command: "semantic-atlas map view",
      exitCode: 0,
      output: JSON.stringify({
        status: "ok",
        data: {
          command: "map.view",
          focus: null,
          breadcrumbs: [],
          regions: Array.from({ length: 51 }, (_, index) => ({
            node: {
              domain: "business",
              key: `capability-${index}`,
              kind: "Capability",
              label: `Capability ${index}`,
            },
            role: "root",
            childCount: 0,
            expandable: false,
          })),
          connections: [],
        },
        warnings: [],
      }),
    }];

    const [atlasCall] = buildKnowledgeCaptureAdjudicationEvidence(run).atlasCalls;

    expect(atlasCall).toMatchObject({
      businessNodeCount: 51,
      businessNodesTruncated: true,
    });
    expect(atlasCall?.businessNodes).toHaveLength(50);
  });
});
