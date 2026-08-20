import { describe, expect, it } from "vitest";

import {
  cliEnvelopeSchema,
  graphPatchV1Schema,
} from "../../src/contracts/public-contracts.js";

const repositoryId = "a".repeat(64);
const snapshotId = "b".repeat(64);
const previousSnapshotId = "c".repeat(64);
const headCommit = "d".repeat(40);
const evidence = {
  symbolId: "symbol:src/orders/order.service.ts#OrderService.placeOrder",
  file: "src/orders/order.service.ts",
  range: {
    start: { line: 18, column: 3 },
    end: { line: 24, column: 4 },
  },
  contentHash: "e".repeat(64),
};

const repository = {
  id: repositoryId,
  root: "/workspace/example",
  headCommit,
};

const snapshot = {
  id: snapshotId,
  gitHead: headCommit,
  createdAt: "2026-08-10T00:00:00.000Z",
  freshness: "current",
};

const structuralNode = {
  domain: "structural",
  id: "symbol:src/orders/order.service.ts#OrderService.placeOrder",
  kind: "Symbol",
  label: "OrderService.placeOrder",
  validity: "valid",
  locations: [
    {
      file: "src/orders/order.service.ts",
      range: evidence.range,
    },
  ],
  support: { status: "exact", provenance: "tree-sitter" },
};

const staleBusinessNode = {
  domain: "business",
  key: "commerce/orders/place-order",
  kind: "Operation",
  label: "Place order",
  summary: "Validates and creates a customer order.",
  aliases: ["checkout"],
  certainty: "exact",
  validity: "stale",
  evidence: [evidence],
};

const businessRoot = {
  ...staleBusinessNode,
  key: "commerce",
  kind: "Capability",
  label: "Commerce",
  summary: "Owns customer purchasing workflows.",
  aliases: ["shopping"],
};

describe("GraphPatch v1 contract", () => {
  it("accepts evidence-bound business node and relation assertions", () => {
    const patch = {
      schemaVersion: 1,
      baseSnapshotId: snapshotId,
      nodeOperations: [
        {
          op: "upsert",
          node: {
            key: "commerce/orders/place-order",
            kind: "Operation",
            label: "Place order",
            summary: "Validates and creates a customer order.",
            aliases: ["checkout"],
            certainty: "exact",
            evidence: [evidence],
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

  it("rejects a node-only factual assertion without evidence", () => {
    const patch = {
      schemaVersion: 1,
      baseSnapshotId: snapshotId,
      nodeOperations: [
        {
          op: "upsert",
          node: {
            key: "commerce/refunds/thirty-day-guarantee",
            kind: "Invariant",
            label: "Thirty-day refund guarantee",
            summary: "Refunds always complete within 30 days.",
            aliases: [],
          },
        },
      ],
      relationOperations: [],
    };

    expect(() => graphPatchV1Schema.parse(patch)).toThrow(
      /certainty|evidence/,
    );
  });

  it("does not let GraphPatch create compiler-owned structural nodes", () => {
    const patch = {
      schemaVersion: 1,
      baseSnapshotId: snapshotId,
      nodeOperations: [
        {
          op: "upsert",
          node: {
            key: "src/orders/order.service.ts#OrderService",
            kind: "Symbol",
            label: "OrderService",
            summary: "Compiler-owned symbol.",
            aliases: [],
            certainty: "exact",
            evidence: [evidence],
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
      baseSnapshotId: snapshotId,
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
      baseSnapshotId: snapshotId,
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
  const successCases = [
    {
      command: "status",
      data: {
        command: "status",
        currentRevision: {
          headCommit,
          changes: { staged: 0, unstaged: 0, untracked: 0 },
        },
        freshness: "missing",
        storeLocation: "/workspace/example/.atlas/codegraph.db",
        languages: [
          { language: "typescript", support: "supported" },
          {
            language: "python",
            support: "unsupported",
            reason: "Python is outside the v0.1 language scope.",
          },
        ],
      },
    },
    {
      command: "index",
      data: {
        command: "index",
        snapshotId,
        facts: { added: 12, changed: 0, reused: 0, removed: 0 },
        unknowns: { added: 1, resolved: 0, total: 1 },
      },
    },
    {
      command: "map.view",
      data: {
        command: "map.view",
        focus: null,
        breadcrumbs: [],
        regions: [{
          node: businessRoot,
          role: "root",
          childCount: 1,
          expandable: true,
        }],
        connections: [{
          from: { domain: "business", key: "commerce" },
          to: { domain: "business", key: "payments" },
          relations: [{
            type: "invokes",
            directCount: 0,
            aggregatedCount: 2,
            certainty: { exact: 1, inferred: 1, hypothesis: 0 },
            validity: { valid: 1, stale: 1 },
          }],
        }],
      },
    },
    {
      command: "map.search",
      data: {
        command: "map.search",
        query: "place order",
        limit: 20,
        results: [{ score: 0.92, node: staleBusinessNode }],
      },
    },
    {
      command: "code.search",
      data: {
        command: "code.search",
        query: "OrderService.placeOrder",
        limit: 20,
        results: [{ score: 0.98, node: structuralNode }],
      },
    },
    {
      command: "map.show",
      data: {
        command: "map.show",
        node: staleBusinessNode,
        relations: [
          {
            type: "realized_by",
            direction: "outgoing",
            node: structuralNode,
            certainty: "exact",
            validity: "stale",
            evidence: [evidence],
          },
        ],
      },
    },
    {
      command: "learn",
      data: {
        command: "learn",
        baseSnapshotId: snapshotId,
        snapshotId,
        applied: { nodeOperations: 1, relationOperations: 1 },
      },
    },
    {
      command: "changes",
      data: {
        command: "changes",
        fromSnapshotId: previousSnapshotId,
        toSnapshotId: snapshotId,
        nodes: { added: [], changed: ["commerce/orders"], removed: [] },
        relations: { added: [], changed: [], removed: [] },
        staleAssertions: ["commerce/orders/place-order"],
      },
    },
  ] as const;

  it.each(successCases)("validates $command command data", ({ data }) => {
    const response = {
      schemaVersion: 1,
      repository,
      snapshot: data.command === "status" ? null : snapshot,
      status: "ok",
      data,
      warnings: [],
    };

    expect(cliEnvelopeSchema.parse(response)).toEqual(response);
  });

  it("preserves stale assertion state in map results after evidence changes", () => {
    const response = {
      schemaVersion: 1,
      repository,
      snapshot,
      status: "partial",
      data: {
        command: "map.view",
        focus: null,
        breadcrumbs: [],
        regions: [{
          node: businessRoot,
          role: "root",
          childCount: 0,
          expandable: false,
        }],
        connections: [],
        nextContractField: "additive fields remain compatible",
      },
      warnings: [
        {
          code: "STALE_ASSERTION",
          message: "One business assertion has changed evidence.",
        },
      ],
    };

    expect(cliEnvelopeSchema.parse(response)).toEqual(response);
  });

  it("keeps map regions business-only while allowing every business node kind", () => {
    const operationRoot = {
      ...staleBusinessNode,
      key: "refunds",
      validity: "valid",
    };
    const response = {
      schemaVersion: 1,
      repository,
      snapshot,
      status: "ok",
      data: {
        command: "map.view",
        focus: null,
        breadcrumbs: [],
        regions: [{
          node: operationRoot,
          role: "root",
          childCount: 0,
          expandable: false,
        }],
        connections: [],
      },
      warnings: [],
    };

    expect(cliEnvelopeSchema.parse(response)).toEqual(response);
    expect(() => cliEnvelopeSchema.parse({
      ...response,
      data: {
        ...response.data,
        regions: [{ ...response.data.regions[0], node: { ...structuralNode, kind: "Module" } }],
      },
    })).toThrow();
  });

  it("does not allow map results to hide business assertion validity", () => {
    const { validity: _validity, ...nodeWithoutValidity } = businessRoot;
    const response = {
      schemaVersion: 1,
      repository,
      snapshot,
      status: "ok",
      data: {
        command: "map.view",
        focus: null,
        breadcrumbs: [],
        regions: [{
          node: nodeWithoutValidity,
          role: "root",
          childCount: 0,
          expandable: false,
        }],
        connections: [],
      },
      warnings: [],
    };

    expect(() => cliEnvelopeSchema.parse(response)).toThrow(/validity/);
  });

  it("does not allow business relations to hide their evidence lifecycle", () => {
    const response = {
      schemaVersion: 1,
      repository,
      snapshot,
      status: "ok",
      data: {
        command: "map.show",
        node: staleBusinessNode,
        relations: [
          {
            type: "realized_by",
            direction: "outgoing",
            node: structuralNode,
            certainty: null,
            validity: "valid",
            evidence: [],
          },
        ],
      },
      warnings: [],
    };

    expect(() => cliEnvelopeSchema.parse(response)).toThrow(
      /certainty|evidence/,
    );
  });

  it("does not allow structural results to hide support provenance", () => {
    const { support: _support, ...nodeWithoutSupport } = structuralNode;
    const response = {
      schemaVersion: 1,
      repository,
      snapshot,
      status: "ok",
      data: {
        command: "code.search",
        query: "place order",
        limit: 20,
        results: [{ score: 0.92, node: nodeWithoutSupport }],
      },
      warnings: [],
    };

    expect(() => cliEnvelopeSchema.parse(response)).toThrow(/support/);
  });

  it("keeps business and structural search results in separate commands", () => {
    const base = {
      schemaVersion: 1,
      repository,
      snapshot,
      status: "ok",
      warnings: [],
    } as const;

    expect(() => cliEnvelopeSchema.parse({
      ...base,
      data: {
        command: "map.search",
        query: "place order",
        limit: 20,
        results: [{ score: 0.92, node: structuralNode }],
      },
    })).toThrow();
    expect(() => cliEnvelopeSchema.parse({
      ...base,
      data: {
        command: "code.search",
        query: "place order",
        limit: 20,
        results: [{ score: 0.92, node: staleBusinessNode }],
      },
    })).toThrow();
  });

  it("requires a reason when a language is unsupported", () => {
    const response = {
      schemaVersion: 1,
      repository,
      snapshot: null,
      status: "partial",
      data: {
        command: "status",
        currentRevision: {
          headCommit,
          changes: { staged: 0, unstaged: 0, untracked: 0 },
        },
        freshness: "missing",
        storeLocation: "/user-data/semantic-atlas/repository.sqlite",
        languages: [{ language: "python", support: "unsupported" }],
      },
      warnings: [],
    };

    expect(() => cliEnvelopeSchema.parse(response)).toThrow(/reason/);
  });

  it("rejects malformed data for a known command", () => {
    const response = {
      schemaVersion: 1,
      repository,
      snapshot: null,
      status: "ok",
      data: { command: "status", freshness: "missing" },
      warnings: [],
    };

    expect(() => cliEnvelopeSchema.parse(response)).toThrow(
      /currentRevision|storeLocation|languages/,
    );
  });

  it("requires a structured error result", () => {
    const invalidError = {
      schemaVersion: 1,
      repository: null,
      snapshot: null,
      status: "error",
      data: 42,
      warnings: [],
    };

    expect(() => cliEnvelopeSchema.parse(invalidError)).toThrow();

    const errorResponse = {
      schemaVersion: 1,
      repository: null,
      snapshot: null,
      status: "error",
      data: {
        command: null,
        error: {
          code: "INVALID_INPUT",
          message: "The command arguments are invalid.",
        },
      },
      warnings: [],
    };

    expect(cliEnvelopeSchema.parse(errorResponse)).toEqual(errorResponse);
  });
});
