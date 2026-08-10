import { describe, expect, it } from "vitest";

import {
  cliEnvelopeSchema,
  graphPatchV1Schema,
} from "../../src/contracts/public-contracts.js";

const evidence = {
  symbolId: "symbol:src/orders/order.service.ts#OrderService.placeOrder",
  file: "src/orders/order.service.ts",
  range: {
    start: { line: 18, column: 3 },
    end: { line: 24, column: 4 },
  },
  contentHash: `sha256:${"a".repeat(64)}`,
};

describe("GraphPatch v1 contract", () => {
  it("accepts evidence-bound business knowledge operations", () => {
    const patch = {
      schemaVersion: 1,
      baseSnapshotId: `snap_${"b".repeat(64)}`,
      nodeOperations: [
        {
          op: "upsert",
          node: {
            key: "commerce/orders/place-order",
            kind: "Operation",
            label: "Place order",
            summary: "Validates and creates a customer order.",
            aliases: ["checkout"],
          },
        },
      ],
      relationOperations: [
        {
          op: "upsert",
          relation: {
            from: {
              domain: "business",
              key: "commerce/orders/place-order",
            },
            type: "realized_by",
            to: {
              domain: "structural",
              id: "symbol:src/orders/order.service.ts#OrderService.placeOrder",
            },
            certainty: "exact",
            evidence: [evidence],
          },
        },
      ],
    };

    expect(graphPatchV1Schema.parse(patch)).toEqual(patch);
  });

  it("does not let GraphPatch create compiler-owned structural nodes", () => {
    const patch = {
      schemaVersion: 1,
      baseSnapshotId: `snap_${"b".repeat(64)}`,
      nodeOperations: [
        {
          op: "upsert",
          node: {
            key: "src/orders/order.service.ts#OrderService",
            kind: "Symbol",
            label: "OrderService",
            summary: "Compiler-owned symbol.",
            aliases: [],
          },
        },
      ],
      relationOperations: [],
    };

    expect(() => graphPatchV1Schema.parse(patch)).toThrow();
  });

  it("requires evidence for every learned relation", () => {
    const patch = {
      schemaVersion: 1,
      baseSnapshotId: `snap_${"b".repeat(64)}`,
      nodeOperations: [],
      relationOperations: [
        {
          op: "upsert",
          relation: {
            from: { domain: "business", key: "commerce/orders" },
            type: "realized_by",
            to: { domain: "structural", id: "symbol:file.ts#orders" },
            certainty: "hypothesis",
            evidence: [],
          },
        },
      ],
    };

    expect(() => graphPatchV1Schema.parse(patch)).toThrow(/evidence/);
  });

  it("binds learned evidence to a compiler symbol", () => {
    const patch = {
      schemaVersion: 1,
      baseSnapshotId: `snap_${"b".repeat(64)}`,
      nodeOperations: [],
      relationOperations: [
        {
          op: "upsert",
          relation: {
            from: { domain: "business", key: "commerce/orders" },
            type: "realized_by",
            to: { domain: "structural", id: "symbol:file.ts#orders" },
            certainty: "exact",
            evidence: [{ ...evidence, symbolId: "file:src/orders/file.ts" }],
          },
        },
      ],
    };

    expect(() => graphPatchV1Schema.parse(patch)).toThrow(/symbol/i);
  });
});

describe("CLI response envelope v1", () => {
  it("keeps status output machine-readable before the first index", () => {
    const response = {
      schemaVersion: 1,
      repository: {
        id: "repo_local-123",
        root: "/workspace/example",
        headCommit: "0123456789abcdef0123456789abcdef01234567",
      },
      snapshot: null,
      status: "ok",
      data: {
        command: "status",
        freshness: "missing",
        storeLocation: "/user-data/semantic-atlas/repo_local-123.sqlite",
        languages: [{ language: "typescript", support: "supported" }],
      },
      warnings: [],
    };

    expect(cliEnvelopeSchema.parse(response)).toEqual(response);
  });
});
