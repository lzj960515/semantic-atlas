import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { GraphStore } from "../../src/graph/graph-store.js";
import { BusinessKnowledgeService } from "../../src/knowledge/business-knowledge-service.js";
import { createRepositorySnapshot } from "../../src/snapshots/repository-snapshot.js";
import type { StructuralNode } from "../../src/structural-backend/types.js";
import type {
  EvidenceLocator,
  StructuralEvidenceResolver,
} from "../../src/world/types.js";
import { WorldSnapshotStore } from "../../src/world/world-snapshot-store.js";
import {
  createGraphTestContext,
  evidenceFor,
  type GraphTestContext,
} from "../graph/graph-fixture.js";

describe("world snapshot reconciliation", () => {
  const contexts: GraphTestContext[] = [];

  afterEach(async () => {
    await Promise.all(contexts.splice(0).map((context) => context.cleanup()));
  });

  it("persists missing, building, failed, and current without serving an unfinished snapshot", async () => {
    const context = await createContext(contexts);
    using store = new WorldSnapshotStore(context.repository);
    using database = new DatabaseSync(context.graph.databasePath);
    database.prepare(`
      UPDATE atlas_worktree_states
      SET
        status = 'missing',
        current_snapshot_id = NULL,
        current_publication_id = NULL,
        target_snapshot_id = NULL
    `).run();

    expect(store.readState()).toMatchObject({
      status: "missing",
      currentSnapshotId: null,
    });
    store.begin(context.snapshot.snapshotId);
    expect(store.readState()).toMatchObject({
      status: "building",
      targetSnapshotId: context.snapshot.snapshotId,
      currentSnapshotId: null,
    });
    expect(() => store.requireCurrentSnapshot()).toThrow(/building/iu);

    store.fail(context.snapshot.snapshotId, new Error("reconciliation failed"));
    expect(store.readState()).toMatchObject({
      status: "failed",
      currentSnapshotId: null,
      targetSnapshotId: context.snapshot.snapshotId,
      failureMessage: "reconciliation failed",
    });
    expect(() => store.requireCurrentSnapshot()).toThrow(/failed/iu);

    store.begin(context.snapshot.snapshotId);
    store.publish(
      context.snapshot,
      "1.5.0",
      1,
      exactResolver(context.evidence.symbolId),
      {
        fromSnapshotId: null,
        toSnapshotId: context.snapshot.snapshotId,
        structural: { added: [], modified: [], removed: [] },
      },
    );
    expect(store.readState()).toMatchObject({
      status: "current",
      currentSnapshotId: context.snapshot.snapshotId,
      targetSnapshotId: null,
      backendVersion: "1.5.0",
      extractionVersion: 1,
    });
    expect(store.requireCurrentSnapshot()).toEqual(context.snapshot);
  });

  it("uniquely rebinds changed backend identifiers and stales ambiguous evidence", async () => {
    const context = await createContext(contexts);
    const evidence = {
      ...evidenceFor(context.snapshot),
      qualifiedSymbol: "value",
      structuralKind: "Symbol" as const,
      atlasSnapshotId: context.snapshot.snapshotId,
      backendVersion: "1.5.0",
      backendLocator: "backend:old",
    };
    context.graph.mutateBusinessGraph({
      baseSnapshotId: context.snapshot.snapshotId,
      upsertNodes: [{
        key: "fixture/read-value",
        kind: "Operation",
        label: "Read value",
        summary: "Returns the fixture value.",
        aliases: [],
        certainty: "hypothesis",
        evidence: [evidence],
      }],
      removeNodeKeys: [],
      upsertRelations: [{
        from: { domain: "business", key: "fixture/read-value" },
        type: "realized_by",
        to: { domain: "structural", id: evidence.symbolId },
        certainty: "exact",
        evidence: [evidence],
      }],
      removeRelations: [],
    });
    using store = new WorldSnapshotStore(context.repository);
    store.begin(context.snapshot.snapshotId);
    const rebound = structuralNode("symbol:new-id");
    expect(store.publish(
      context.snapshot,
      "1.5.0",
      1,
      candidateResolver([rebound]),
      {
        fromSnapshotId: context.snapshot.snapshotId,
        toSnapshotId: context.snapshot.snapshotId,
        structural: { added: [], modified: [], removed: [] },
      },
    ).staleAssertions).toEqual([]);

    expect(readEvidenceRow(context.graph.databasePath)).toMatchObject({
      structural_reference: "symbol:new-id",
      backend_locator: "backend:symbol:new-id",
      qualified_symbol: "value",
      structural_kind: "Symbol",
      atlas_snapshot_id: context.snapshot.snapshotId,
      backend_version: "1.5.0",
      binding_status: "bound",
    });
    expect(context.graph.getNode(
      { domain: "business", key: "fixture/read-value" },
      context.snapshot.snapshotId,
    )).toMatchObject({ certainty: "hypothesis", validity: "valid" });
    expect(context.graph.listBusinessRelations(context.snapshot.snapshotId))
      .toEqual([expect.objectContaining({
        to: { domain: "structural", id: "symbol:new-id" },
        validity: "valid",
      })]);

    store.begin(context.snapshot.snapshotId);
    const ambiguous = store.publish(
      context.snapshot,
      "1.5.0",
      1,
      candidateResolver([rebound, { ...rebound, reference: { id: "symbol:other-id" } }]),
      {
        fromSnapshotId: context.snapshot.snapshotId,
        toSnapshotId: context.snapshot.snapshotId,
        structural: { added: [], modified: [], removed: [] },
      },
    );
    expect(ambiguous.staleAssertions).toEqual([
      "fixture/read-value",
      `fixture/read-value:realized_by:structural:${context.evidence.symbolId}`,
    ]);
    expect(readEvidenceRow(context.graph.databasePath)).toMatchObject({
      structural_reference: context.evidence.symbolId,
      binding_status: "ambiguous",
    });
    expect(context.graph.getNode(
      { domain: "business", key: "fixture/read-value" },
      context.snapshot.snapshotId,
    )).toMatchObject({ certainty: "hypothesis", validity: "stale" });

    context.graph.mutateBusinessGraph({
      baseSnapshotId: context.snapshot.snapshotId,
      upsertNodes: [{
        key: "fixture/unrelated",
        kind: "Invariant",
        label: "Unrelated",
        summary: "Does not change the ambiguous evidence.",
        aliases: [],
        certainty: "exact",
        evidence: [evidenceFor(context.snapshot)],
      }],
      removeNodeKeys: [],
      upsertRelations: [],
      removeRelations: [],
    });
    expect(context.graph.getNode(
      { domain: "business", key: "fixture/read-value" },
      context.snapshot.snapshotId,
    )).toMatchObject({ certainty: "hypothesis", validity: "stale" });
  });

  it("reuses content snapshots while preserving every successful publication", async () => {
    const context = await createContext(contexts);
    using store = new WorldSnapshotStore(context.repository);
    const changes = {
      fromSnapshotId: context.snapshot.snapshotId,
      toSnapshotId: context.snapshot.snapshotId,
      structural: { added: ["src/example.ts"], modified: [], removed: [] },
    } as const;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      store.begin(context.snapshot.snapshotId);
      store.publish(
        context.snapshot,
        "1.5.0",
        1,
        exactResolver(context.evidence.symbolId),
        changes,
      );
    }

    using database = new DatabaseSync(context.graph.databasePath, { readOnly: true });
    expect(database.prepare(`
      SELECT COUNT(*) AS count FROM atlas_world_publications
    `).get()).toEqual({ count: 3 });
    expect(database.prepare(`
      SELECT COUNT(*) AS count FROM atlas_repository_snapshots
    `).get()).toEqual({ count: 1 });
    expect(store.readSemanticChanges()).toEqual({
      fromSnapshotId: context.snapshot.snapshotId,
      toSnapshotId: context.snapshot.snapshotId,
      nodes: { added: [], changed: [], removed: [] },
      relations: { added: [], changed: [], removed: [] },
      staleAssertions: [],
    });

    await context.fixture.write("src/example.ts", "export const value = 2;\n");
    const nextSnapshot = await createRepositorySnapshot(context.repository);
    store.begin(nextSnapshot.snapshotId);
    store.publish(
      nextSnapshot,
      "1.5.0",
      1,
      exactResolver(context.evidence.symbolId),
      {
        fromSnapshotId: context.snapshot.snapshotId,
        toSnapshotId: nextSnapshot.snapshotId,
        structural: { added: [], modified: ["src/example.ts"], removed: [] },
      },
    );
    expect(store.readSemanticChanges()).toEqual({
      fromSnapshotId: context.snapshot.snapshotId,
      toSnapshotId: nextSnapshot.snapshotId,
      nodes: { added: [], changed: ["file:src/example.ts"], removed: [] },
      relations: { added: [], changed: [], removed: [] },
      staleAssertions: [],
    });
  });

  it("publishes only metadata that connects the current and target snapshots", async () => {
    const context = await createContext(contexts);
    using store = new WorldSnapshotStore(context.repository);
    await context.fixture.write("src/example.ts", "export const value = 2;\n");
    const target = await createRepositorySnapshot(context.repository);
    const publicationCount = () => {
      using database = new DatabaseSync(context.graph.databasePath, { readOnly: true });
      return database.prepare(`
        SELECT COUNT(*) AS count FROM atlas_world_publications
      `).get() as { count: number };
    };
    store.begin(target.snapshotId);

    expect(() => store.publish(
      target,
      "1.5.0",
      1,
      exactResolver(context.evidence.symbolId),
      {
        fromSnapshotId: null,
        toSnapshotId: target.snapshotId,
        structural: { added: [], modified: ["src/example.ts"], removed: [] },
      },
    )).toThrow(/current publication/);
    expect(() => store.publish(
      target,
      "1.5.0",
      1,
      exactResolver(context.evidence.symbolId),
      {
        fromSnapshotId: context.snapshot.snapshotId,
        toSnapshotId: context.snapshot.snapshotId,
        structural: { added: [], modified: ["src/example.ts"], removed: [] },
      },
    )).toThrow(/publication target/);

    expect(publicationCount()).toEqual({ count: 1 });
    expect(store.readState()).toMatchObject({
      status: "building",
      currentSnapshotId: context.snapshot.snapshotId,
      targetSnapshotId: target.snapshotId,
    });
  });

  it("rebinds a structural relation target independently from its supporting evidence", async () => {
    const context = await createContext(contexts);
    await context.fixture.write("src/stable.ts", "export const stable = true;\n");
    const snapshot = await createRepositorySnapshot(context.repository);
    const value = structuralNode(context.evidence.symbolId);
    const stable = structuralNode(
      "symbol:src/stable.ts#stable",
      "stable",
      "src/stable.ts",
      28,
    );
    using store = new WorldSnapshotStore(context.repository);
    store.begin(snapshot.snapshotId);
    store.publish(snapshot, "1.5.0", 1, nodeResolver([value, stable]), {
      fromSnapshotId: context.snapshot.snapshotId,
      toSnapshotId: snapshot.snapshotId,
      structural: { added: ["src/stable.ts"], modified: [], removed: [] },
    });
    const service = new BusinessKnowledgeService(
      context.repository,
      context.graph,
      context.structuralBackend,
    );
    await service.learn({
      schemaVersion: 1,
      baseSnapshotId: snapshot.snapshotId,
      nodeOperations: [{
        op: "upsert",
        node: {
          key: "fixture/read-value",
          kind: "Operation",
          label: "Read value",
          summary: "Reads a value with separately located supporting evidence.",
          aliases: [],
          certainty: "exact",
          evidence: [context.evidence],
        },
      }],
      relationOperations: [{
        op: "upsert",
        relation: {
          from: { domain: "business", key: "fixture/read-value" },
          type: "realized_by",
          to: { domain: "structural", id: stable.reference.id },
          certainty: "exact",
          evidence: [context.evidence],
        },
      }],
    });
    using targetDatabase = new DatabaseSync(context.graph.databasePath, { readOnly: true });
    expect(targetDatabase.prepare(`
      SELECT
        relation.to_key,
        relation.target_file,
        relation.target_qualified_symbol,
        relation.target_structural_kind,
        relation.target_start_line,
        relation.target_start_column,
        relation.target_end_line,
        relation.target_end_column,
        binding.snapshot_id AS target_atlas_snapshot_id,
        binding.backend_version AS target_backend_version,
        binding.backend_locator AS target_backend_locator,
        binding.binding_status AS target_binding_status
      FROM atlas_business_relations AS relation
      JOIN atlas_structural_relation_target_bindings AS binding
        ON binding.relation_id = relation.relation_id
      WHERE relation.to_domain = 'structural'
    `).get()).toEqual({
      to_key: stable.reference.id,
      target_file: stable.path,
      target_qualified_symbol: stable.qualifiedName,
      target_structural_kind: stable.kind,
      target_start_line: stable.range.start.line,
      target_start_column: stable.range.start.column,
      target_end_line: stable.range.end.line,
      target_end_column: stable.range.end.column,
      target_atlas_snapshot_id: snapshot.snapshotId,
      target_backend_version: "1.5.0",
      target_backend_locator: `backend:${stable.reference.id}`,
      target_binding_status: "bound",
    });

    const reboundValue = structuralNode("symbol:rebound-value");
    const reboundStable = structuralNode(
      "symbol:rebound-stable",
      "stable",
      "src/stable.ts",
      28,
    );
    store.begin(snapshot.snapshotId);
    expect(store.publish(snapshot, "1.5.0", 1, candidateResolver([
      reboundValue,
      reboundStable,
    ]), {
      fromSnapshotId: snapshot.snapshotId,
      toSnapshotId: snapshot.snapshotId,
      structural: { added: [], modified: [], removed: [] },
    }).staleAssertions).toEqual([]);
    expect(context.graph.listBusinessRelations(snapshot.snapshotId)).toEqual([
      expect.objectContaining({
        to: { domain: "structural", id: reboundStable.reference.id },
        validity: "valid",
        evidence: [expect.objectContaining({ symbolId: reboundValue.reference.id })],
      }),
    ]);

    store.begin(snapshot.snapshotId);
    const missingTarget = store.publish(
      snapshot,
      "1.5.0",
      1,
      candidateResolver([reboundValue]),
      {
        fromSnapshotId: snapshot.snapshotId,
        toSnapshotId: snapshot.snapshotId,
        structural: { added: [], modified: [], removed: [] },
      },
    );
    expect(missingTarget.staleAssertions).toEqual([
      `fixture/read-value:realized_by:structural:${stable.reference.id}`,
    ]);
    expect(context.graph.listBusinessRelations(snapshot.snapshotId)).toEqual([
      expect.objectContaining({
        to: { domain: "structural", id: stable.reference.id },
        validity: "stale",
      }),
    ]);

    context.graph.mutateBusinessGraph({
      baseSnapshotId: snapshot.snapshotId,
      upsertNodes: [{
        key: "fixture/unrelated",
        kind: "Invariant",
        label: "Unrelated",
        summary: "Must not revive a relation with a missing structural target.",
        aliases: [],
        certainty: "exact",
        evidence: [context.evidence],
      }],
      removeNodeKeys: [],
      upsertRelations: [],
      removeRelations: [],
    });
    expect(context.graph.listBusinessRelations(snapshot.snapshotId)).toEqual([
      expect.objectContaining({ validity: "stale" }),
    ]);

    store.begin(snapshot.snapshotId);
    const ambiguousTarget = store.publish(
      snapshot,
      "1.5.0",
      1,
      candidateResolver([
        reboundValue,
        reboundStable,
        { ...reboundStable, reference: { id: "symbol:other-stable" } },
      ]),
      {
        fromSnapshotId: snapshot.snapshotId,
        toSnapshotId: snapshot.snapshotId,
        structural: { added: [], modified: [], removed: [] },
      },
    );
    expect(ambiguousTarget.staleAssertions).toEqual([
      `fixture/read-value:realized_by:structural:${stable.reference.id}`,
    ]);
    expect(context.graph.listBusinessRelations(snapshot.snapshotId)).toEqual([
      expect.objectContaining({ validity: "stale" }),
    ]);
  });
});

async function createContext(contexts: GraphTestContext[]): Promise<GraphTestContext> {
  const context = await createGraphTestContext();
  contexts.push(context);
  return context;
}

function exactResolver(reference: string): StructuralEvidenceResolver {
  const node = structuralNode(reference);
  return {
    getNode: (candidate) => candidate === reference ? node : undefined,
    findCandidates: () => [node],
    backendLocator: (candidate) => `backend:${candidate.reference.id}`,
  };
}

function candidateResolver(candidates: readonly StructuralNode[]): StructuralEvidenceResolver {
  return {
    getNode: () => undefined,
    findCandidates: (_locator: EvidenceLocator) => candidates,
    backendLocator: (candidate) => `backend:${candidate.reference.id}`,
  };
}

function nodeResolver(nodes: readonly StructuralNode[]): StructuralEvidenceResolver {
  return {
    getNode: (reference) => nodes.find((node) => node.reference.id === reference),
    findCandidates: (locator) => nodes.filter((node) => node.path === locator.file),
    backendLocator: (node) => `backend:${node.reference.id}`,
  };
}

function structuralNode(
  reference: string,
  name = "value",
  path = "src/example.ts",
  endColumn = 24,
): StructuralNode {
  return {
    reference: { id: reference },
    kind: "Symbol",
    declarationKind: "variable",
    decorators: [],
    name,
    qualifiedName: name,
    path,
    language: "typescript",
    range: {
      start: { line: 1, column: 1 },
      end: { line: 1, column: endColumn },
    },
    support: { status: "exact", provenance: "backend" },
  };
}

function readEvidenceRow(databasePath: string): Record<string, unknown> {
  using database = new DatabaseSync(databasePath, { readOnly: true });
  return database.prepare(`
    SELECT
      COALESCE(binding.resolved_structural_reference, evidence.structural_reference)
        AS structural_reference,
      COALESCE(binding.resolved_qualified_symbol, evidence.qualified_symbol) AS qualified_symbol,
      COALESCE(binding.resolved_structural_kind, evidence.structural_kind) AS structural_kind,
      binding.snapshot_id AS atlas_snapshot_id,
      binding.backend_version,
      binding.backend_locator,
      binding.binding_status
    FROM atlas_business_node_evidence AS evidence
    JOIN atlas_business_node_evidence_bindings AS binding
      ON binding.node_id = evidence.node_id
      AND binding.position = evidence.position
    ORDER BY binding.rowid DESC
    LIMIT 1
  `).get() as Record<string, unknown>;
}
