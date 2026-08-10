import type { DatabaseSync } from "node:sqlite";

import {
  assertionCertaintySchema,
  businessKeySchema,
  businessNodeKindSchema,
  businessRelationTypeSchema,
  evidenceSchema,
  relativeSourcePathSchema,
  sourceRangeSchema,
  structuralNodeIdSchema,
  structuralNodeKindSchema,
  structuralRelationTypeSchema,
} from "../contracts/graph.js";
import { contentIdentifierSchema } from "../contracts/identifiers.js";
import type { GitRepository } from "../repository/types.js";
import {
  AtlasDatabase,
  CURRENT_ATLAS_SCHEMA_VERSION,
} from "../storage/atlas-database.js";
import type {
  AssertionCertainty,
  BusinessGraphMutation,
  BusinessGraphNode,
  BusinessGraphRelation,
  BusinessNodeInput,
  BusinessNodeReference,
  BusinessRelationInput,
  BusinessRelationSelector,
  Evidence,
  EvidenceOwner,
  GraphNeighbor,
  GraphNode,
  GraphNodeReference,
  GraphRelation,
  GraphSearchOptions,
  GraphSearchResult,
  GraphSourceLocation,
  GraphTraversalOptions,
  KnowledgeValidity,
  StructuralGraphNode,
  StructuralGraphNodeInput,
  StructuralGraphRelation,
  StructuralNodeReference,
  StructuralRelationInput,
  StructuralRelationType,
  TraversalDirection,
  UnknownBoundary,
} from "./types.js";

interface IdentityRow {
  readonly identity_id: number;
  readonly domain: "structural" | "business";
  readonly node_key: string;
}

interface StructuralNodeRow extends IdentityRow {
  readonly snapshot_id: string;
  readonly kind: StructuralGraphNodeInput["kind"];
  readonly label: string;
  readonly reason: string | null;
}

interface BusinessNodeRow extends IdentityRow {
  readonly base_snapshot_id: string;
  readonly kind: BusinessGraphNode["kind"];
  readonly label: string;
  readonly summary: string;
  readonly certainty: AssertionCertainty;
  readonly validity: KnowledgeValidity;
}

interface LocationRow {
  readonly file: string;
  readonly start_line: number;
  readonly start_column: number;
  readonly end_line: number;
  readonly end_column: number;
  readonly content_hash: string;
}

interface EvidenceRow extends LocationRow {
  readonly symbol_id: string;
}

interface StructuralRelationRow {
  readonly relation_id: number;
  readonly snapshot_id: string;
  readonly relation_type: StructuralRelationType;
  readonly from_identity_id: number;
  readonly from_key: string;
  readonly to_identity_id: number;
  readonly to_key: string;
}

interface BusinessRelationRow {
  readonly relation_id: number;
  readonly base_snapshot_id: string;
  readonly relation_type: BusinessGraphRelation["type"];
  readonly certainty: AssertionCertainty;
  readonly validity: KnowledgeValidity;
  readonly from_identity_id: number;
  readonly from_key: string;
  readonly to_identity_id: number;
  readonly to_domain: "structural" | "business";
  readonly to_key: string;
}

interface InternalAdjacency {
  readonly relationKey: string;
  readonly direction: "incoming" | "outgoing";
  readonly relation: GraphRelation;
  readonly node: GraphNode;
}

const structuralPrefixes: Readonly<Record<StructuralGraphNodeInput["kind"], string>> = {
  Repository: "repository:",
  Module: "module:",
  File: "file:",
  Symbol: "symbol:",
  Test: "test:",
  UnknownBoundary: "unknown:",
};

export class GraphStore implements Disposable {
  readonly databasePath: string;
  readonly #atlasDatabase: AtlasDatabase;
  readonly #repositoryId: string;

  constructor(
    dataDirectory: string,
    repository: GitRepository,
  ) {
    this.#atlasDatabase = new AtlasDatabase(dataDirectory, repository);
    this.databasePath = this.#atlasDatabase.databasePath;
    this.#repositoryId = repository.repositoryId;
  }

  get schemaVersion(): number {
    return this.#atlasDatabase.schemaVersion;
  }

  replaceStructuralSnapshot(
    snapshotId: string,
    nodes: readonly StructuralGraphNodeInput[],
    relations: readonly StructuralRelationInput[],
  ): void {
    contentIdentifierSchema.parse(snapshotId);
    this.validateStructuralGraph(nodes, relations);

    this.transaction(() => {
      this.requireSnapshot(snapshotId);
      this.database.prepare(`
        INSERT INTO structural_graph_snapshots (repository_id, snapshot_id)
        VALUES (?, ?)
        ON CONFLICT (repository_id, snapshot_id) DO NOTHING
      `).run(this.#repositoryId, snapshotId);
      this.database.prepare(`
        DELETE FROM graph_search
        WHERE repository_id = ? AND scope = ?
      `).run(this.#repositoryId, snapshotId);
      this.database.prepare(`
        DELETE FROM structural_relations
        WHERE repository_id = ? AND snapshot_id = ?
      `).run(this.#repositoryId, snapshotId);
      this.database.prepare(`
        DELETE FROM structural_nodes
        WHERE repository_id = ? AND snapshot_id = ?
      `).run(this.#repositoryId, snapshotId);

      for (const node of nodes) {
        this.insertStructuralNode(snapshotId, node);
      }
      for (const relation of relations) {
        this.insertStructuralRelation(snapshotId, relation);
      }

      this.refreshBusinessValidity(snapshotId);
    });
  }

  mutateBusinessGraph(mutation: BusinessGraphMutation): void {
    this.validateBusinessMutation(mutation);

    this.transaction(() => {
      this.requireSnapshot(mutation.baseSnapshotId);
      for (const selector of mutation.removeRelations) {
        this.removeBusinessRelation(mutation.baseSnapshotId, selector);
      }
      for (const key of mutation.removeNodeKeys) {
        this.removeBusinessNode(key);
      }
      for (const node of mutation.upsertNodes) {
        this.upsertBusinessNode(mutation.baseSnapshotId, node);
      }
      for (const relation of mutation.upsertRelations) {
        this.upsertBusinessRelation(mutation.baseSnapshotId, relation);
      }

      this.refreshAllBusinessValidity();
    });
  }

  getNode(reference: GraphNodeReference, snapshotId: string): GraphNode | undefined {
    contentIdentifierSchema.parse(snapshotId);
    return reference.domain === "business"
      ? this.readBusinessNode(reference.key, snapshotId)
      : this.readStructuralNode(reference.id, snapshotId);
  }

  getEvidence(owner: EvidenceOwner): readonly Evidence[] {
    if (owner.type === "node") {
      const identity = this.findIdentity(owner.node);
      return identity === undefined ? [] : this.readNodeEvidence(identity.identity_id);
    }

    const relation = this.findBusinessRelation(owner.relation);
    return relation === undefined ? [] : this.readRelationEvidence(relation.relation_id);
  }

  traverse(
    start: GraphNodeReference,
    options: GraphTraversalOptions,
  ): readonly GraphNeighbor[] {
    const maxDepth = options.maxDepth ?? 1;
    if (!Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > 3) {
      throw new Error("Graph traversal depth must be an integer from 1 through 3");
    }
    const direction = options.direction ?? "both";
    const startNode = this.getNode(start, options.snapshotId);
    if (startNode === undefined) {
      return [];
    }

    const relationTypes = options.relationTypes === undefined
      ? undefined
      : new Set(options.relationTypes);
    const queue: { reference: GraphNodeReference; depth: number }[] = [
      { reference: start, depth: 0 },
    ];
    const queuedNodes = new Set([referenceKey(start)]);
    const emittedRelations = new Set<string>();
    const result: GraphNeighbor[] = [];

    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index]!;
      if (current.depth >= maxDepth) {
        continue;
      }

      for (const adjacent of this.readAdjacency(
        current.reference,
        options.snapshotId,
        direction,
      )) {
        if (
          emittedRelations.has(adjacent.relationKey)
          || (relationTypes !== undefined && !relationTypes.has(adjacent.relation.type))
        ) {
          continue;
        }
        emittedRelations.add(adjacent.relationKey);
        const depth = current.depth + 1;
        result.push({
          depth,
          direction: adjacent.direction,
          relation: adjacent.relation,
          node: adjacent.node,
        });

        const nextReference = nodeReference(adjacent.node);
        const nextKey = referenceKey(nextReference);
        if (!queuedNodes.has(nextKey)) {
          queuedNodes.add(nextKey);
          queue.push({ reference: nextReference, depth });
        }
      }
    }

    return result;
  }

  search(query: string, options: GraphSearchOptions): readonly GraphSearchResult[] {
    contentIdentifierSchema.parse(options.snapshotId);
    const limit = options.limit ?? 20;
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error("Graph search limit must be a positive integer");
    }
    const terms = query.match(/[\p{L}\p{N}_]+/gu) ?? [];
    if (terms.length === 0) {
      return [];
    }
    const match = terms.map((term) => `"${term.replaceAll('"', '""')}"`).join(" AND ");
    const rows = this.database.prepare(`
      SELECT
        scope,
        node_domain,
        node_key,
        bm25(graph_search, 0, 0, 0, 0, 10, 8, 4, 6, 5) AS rank
      FROM graph_search
      WHERE graph_search MATCH ?
        AND repository_id = ?
        AND scope IN ('business', ?)
      ORDER BY rank ASC, node_domain ASC, node_key ASC
      LIMIT ?
    `).all(match, this.#repositoryId, options.snapshotId, limit) as unknown as {
      scope: string;
      node_domain: "structural" | "business";
      node_key: string;
      rank: number;
    }[];

    return rows.flatMap((row): GraphSearchResult[] => {
      const reference: GraphNodeReference = row.node_domain === "business"
        ? { domain: "business", key: row.node_key }
        : { domain: "structural", id: row.node_key };
      const node = this.getNode(reference, options.snapshotId);
      if (node === undefined) {
        return [];
      }
      return [{ score: relevanceScoreFromBm25(row.rank), node }];
    });
  }

  listUnknownBoundaries(snapshotId: string): readonly UnknownBoundary[] {
    contentIdentifierSchema.parse(snapshotId);
    const rows = this.database.prepare(`
      SELECT identity.node_key
      FROM structural_nodes AS node
      JOIN graph_node_identities AS identity
        ON identity.identity_id = node.identity_id
      WHERE node.repository_id = ?
        AND node.snapshot_id = ?
        AND node.kind = 'UnknownBoundary'
      ORDER BY identity.node_key ASC
    `).all(this.#repositoryId, snapshotId) as unknown as { node_key: string }[];

    return rows.map(({ node_key }) => {
      const node = this.readStructuralNode(node_key, snapshotId);
      if (node?.kind !== "UnknownBoundary") {
        throw new Error(`Unknown boundary ${node_key} is missing its persisted details`);
      }
      return node;
    });
  }

  close(): void {
    this.#atlasDatabase.close();
  }

  [Symbol.dispose](): void {
    this.close();
  }

  private get database(): DatabaseSync {
    return this.#atlasDatabase.connection;
  }

  private transaction(operation: () => void): void {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      operation();
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  private validateStructuralGraph(
    nodes: readonly StructuralGraphNodeInput[],
    relations: readonly StructuralRelationInput[],
  ): void {
    const nodeIds = new Set<string>();
    for (const node of nodes) {
      structuralNodeIdSchema.parse(node.id);
      structuralNodeKindSchema.parse(node.kind);
      if (!node.id.startsWith(structuralPrefixes[node.kind])) {
        throw new Error(`${node.kind} node ID must start with ${structuralPrefixes[node.kind]}`);
      }
      if (node.label.length === 0) {
        throw new Error("Structural node labels cannot be empty");
      }
      if (nodeIds.has(node.id)) {
        throw new Error(`Duplicate structural node ${node.id}`);
      }
      nodeIds.add(node.id);
      if (node.kind === "UnknownBoundary") {
        if (node.reason.length === 0 || node.candidates.some((candidate) => candidate.length === 0)) {
          throw new Error(`Unknown boundary ${node.id} requires a reason and finite candidates`);
        }
        this.validateLocation(node.location);
      } else {
        node.locations.forEach((location) => this.validateLocation(location));
      }
    }

    const relationKeys = new Set<string>();
    for (const relation of relations) {
      structuralRelationTypeSchema.parse(relation.type);
      if (!nodeIds.has(relation.from) || !nodeIds.has(relation.to)) {
        throw new Error(
          `Structural relation endpoint is missing: ${relation.from} ${relation.type} ${relation.to}`,
        );
      }
      const key = `${relation.from}\0${relation.type}\0${relation.to}`;
      if (relationKeys.has(key)) {
        throw new Error(`Duplicate structural relation ${relation.from} ${relation.type} ${relation.to}`);
      }
      relationKeys.add(key);
    }
  }

  private validateBusinessMutation(mutation: BusinessGraphMutation): void {
    contentIdentifierSchema.parse(mutation.baseSnapshotId);
    const upsertedKeys = new Set<string>();
    for (const node of mutation.upsertNodes) {
      businessKeySchema.parse(node.key);
      businessNodeKindSchema.parse(node.kind);
      assertionCertaintySchema.parse(node.certainty);
      if (node.label.length === 0 || node.summary.length === 0 || node.evidence.length === 0) {
        throw new Error(`Business node ${node.key} requires a label, summary, and evidence`);
      }
      node.aliases.forEach((alias) => {
        if (alias.length === 0) {
          throw new Error(`Business node ${node.key} has an empty alias`);
        }
      });
      node.evidence.forEach((evidence) => evidenceSchema.parse(evidence));
      if (upsertedKeys.has(node.key)) {
        throw new Error(`Duplicate business node upsert ${node.key}`);
      }
      upsertedKeys.add(node.key);
    }

    const removedKeys = new Set(mutation.removeNodeKeys);
    mutation.removeNodeKeys.forEach((key) => businessKeySchema.parse(key));
    for (const key of upsertedKeys) {
      if (removedKeys.has(key)) {
        throw new Error(`Business node ${key} cannot be removed and upserted together`);
      }
    }
    mutation.removeRelations.forEach((relation) => this.validateBusinessRelation(relation));
    mutation.upsertRelations.forEach((relation) => {
      this.validateBusinessRelation(relation);
      assertionCertaintySchema.parse(relation.certainty);
      if (relation.evidence.length === 0) {
        throw new Error("Business relations require evidence");
      }
      relation.evidence.forEach((evidence) => evidenceSchema.parse(evidence));
    });
  }

  private validateBusinessRelation(relation: BusinessRelationSelector): void {
    businessKeySchema.parse(relation.from.key);
    businessRelationTypeSchema.parse(relation.type);
    if (relation.to.domain === "business") {
      businessKeySchema.parse(relation.to.key);
    } else {
      structuralNodeIdSchema.parse(relation.to.id);
    }

    const requiresStructuralTarget = relation.type === "realized_by" || relation.type === "verified_by";
    const expectedDomain = requiresStructuralTarget ? "structural" : "business";
    if (relation.to.domain !== expectedDomain) {
      throw new Error(`${relation.type} relations require a ${expectedDomain} target`);
    }
  }

  private validateLocation(location: GraphSourceLocation): void {
    relativeSourcePathSchema.parse(location.file);
    sourceRangeSchema.parse(location.range);
    contentIdentifierSchema.parse(location.contentHash);
  }

  private requireSnapshot(snapshotId: string): void {
    const row = this.database.prepare(`
      SELECT 1 AS present
      FROM repository_snapshots
      WHERE repository_id = ? AND snapshot_id = ?
    `).get(this.#repositoryId, snapshotId);
    if (row === undefined) {
      throw new Error(`Repository snapshot ${snapshotId} is not stored`);
    }
  }

  private insertStructuralNode(snapshotId: string, node: StructuralGraphNodeInput): void {
    const identityId = this.ensureIdentity({ domain: "structural", id: node.id });
    this.database.prepare(`
      INSERT INTO structural_nodes (
        identity_id, repository_id, snapshot_id, kind, label
      ) VALUES (?, ?, ?, ?, ?)
    `).run(identityId, this.#repositoryId, snapshotId, node.kind, node.label);

    const locations = node.kind === "UnknownBoundary" ? [node.location] : node.locations;
    locations.forEach((location, position) => {
      this.insertLocation(identityId, snapshotId, position, location);
    });
    if (node.kind === "UnknownBoundary") {
      this.database.prepare(`
        INSERT INTO unknown_boundaries (identity_id, snapshot_id, reason)
        VALUES (?, ?, ?)
      `).run(identityId, snapshotId, node.reason);
      node.candidates.forEach((candidate, position) => {
        this.database.prepare(`
          INSERT INTO unknown_boundary_candidates (
            identity_id, snapshot_id, position, candidate
          ) VALUES (?, ?, ?, ?)
        `).run(identityId, snapshotId, position, candidate);
      });
    }

    this.insertSearchDocument({
      scope: snapshotId,
      domain: "structural",
      key: node.id,
      label: node.label,
      aliases: "",
      summary: node.kind === "UnknownBoundary" ? node.reason : "",
      symbols: node.kind === "Symbol" || node.kind === "Test" ? node.id : "",
      paths: locations.map((location) => location.file).join(" "),
    });
  }

  private insertLocation(
    identityId: number,
    snapshotId: string,
    position: number,
    location: GraphSourceLocation,
  ): void {
    this.database.prepare(`
      INSERT INTO structural_node_locations (
        identity_id,
        snapshot_id,
        position,
        file,
        start_line,
        start_column,
        end_line,
        end_column,
        content_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      identityId,
      snapshotId,
      position,
      location.file,
      location.range.start.line,
      location.range.start.column,
      location.range.end.line,
      location.range.end.column,
      location.contentHash,
    );
  }

  private insertStructuralRelation(snapshotId: string, relation: StructuralRelationInput): void {
    const fromIdentity = this.requireIdentity({ domain: "structural", id: relation.from });
    const toIdentity = this.requireIdentity({ domain: "structural", id: relation.to });
    this.database.prepare(`
      INSERT INTO structural_relations (
        repository_id,
        snapshot_id,
        from_identity_id,
        relation_type,
        to_identity_id
      ) VALUES (?, ?, ?, ?, ?)
    `).run(
      this.#repositoryId,
      snapshotId,
      fromIdentity.identity_id,
      relation.type,
      toIdentity.identity_id,
    );
  }

  private upsertBusinessNode(baseSnapshotId: string, node: BusinessNodeInput): void {
    node.evidence.forEach((evidence) => this.requireEvidence(baseSnapshotId, evidence));
    const identityId = this.ensureIdentity({ domain: "business", key: node.key });
    this.database.prepare(`
      INSERT INTO business_nodes (
        identity_id,
        repository_id,
        base_snapshot_id,
        kind,
        label,
        summary,
        certainty
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (identity_id) DO UPDATE SET
        base_snapshot_id = excluded.base_snapshot_id,
        kind = excluded.kind,
        label = excluded.label,
        summary = excluded.summary,
        certainty = excluded.certainty
    `).run(
      identityId,
      this.#repositoryId,
      baseSnapshotId,
      node.kind,
      node.label,
      node.summary,
      node.certainty,
    );
    this.database.prepare("DELETE FROM business_node_aliases WHERE identity_id = ?").run(identityId);
    this.database.prepare("DELETE FROM business_node_evidence WHERE identity_id = ?").run(identityId);
    node.aliases.forEach((alias, position) => {
      this.database.prepare(`
        INSERT INTO business_node_aliases (identity_id, position, alias)
        VALUES (?, ?, ?)
      `).run(identityId, position, alias);
    });
    node.evidence.forEach((evidence, position) => {
      this.insertNodeEvidence(identityId, position, evidence);
    });

    this.database.prepare(`
      DELETE FROM graph_search
      WHERE repository_id = ?
        AND scope = 'business'
        AND node_domain = 'business'
        AND node_key = ?
    `).run(this.#repositoryId, node.key);
    this.insertSearchDocument({
      scope: "business",
      domain: "business",
      key: node.key,
      label: node.label,
      aliases: node.aliases.join(" "),
      summary: node.summary,
      symbols: node.evidence.map((evidence) => evidence.symbolId).join(" "),
      paths: node.evidence.map((evidence) => evidence.file).join(" "),
    });
  }

  private upsertBusinessRelation(
    baseSnapshotId: string,
    relation: BusinessRelationInput,
  ): void {
    relation.evidence.forEach((evidence) => this.requireEvidence(baseSnapshotId, evidence));
    const fromIdentity = this.requireBusinessEndpoint(relation.from);
    const toIdentity = relation.to.domain === "business"
      ? this.requireBusinessEndpoint(relation.to)
      : this.requireStructuralEndpoint(relation.to, baseSnapshotId);
    this.database.prepare(`
      INSERT INTO business_relations (
        repository_id,
        base_snapshot_id,
        from_identity_id,
        relation_type,
        to_identity_id,
        certainty
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (repository_id, from_identity_id, relation_type, to_identity_id)
      DO UPDATE SET
        base_snapshot_id = excluded.base_snapshot_id,
        certainty = excluded.certainty
    `).run(
      this.#repositoryId,
      baseSnapshotId,
      fromIdentity.identity_id,
      relation.type,
      toIdentity.identity_id,
      relation.certainty,
    );
    const stored = this.findBusinessRelation(relation);
    if (stored === undefined) {
      throw new Error("Business relation was not stored");
    }
    this.database.prepare(`
      DELETE FROM business_relation_evidence
      WHERE relation_id = ?
    `).run(stored.relation_id);
    relation.evidence.forEach((evidence, position) => {
      this.insertRelationEvidence(stored.relation_id, position, evidence);
    });
  }

  private removeBusinessNode(key: string): void {
    const identity = this.findIdentity({ domain: "business", key });
    if (identity === undefined) {
      throw new Error(`Business node ${key} is missing`);
    }
    const relation = this.database.prepare(`
      SELECT relation_id
      FROM business_relations
      WHERE repository_id = ?
        AND (from_identity_id = ? OR to_identity_id = ?)
      LIMIT 1
    `).get(this.#repositoryId, identity.identity_id, identity.identity_id);
    if (relation !== undefined) {
      throw new Error(`Business node ${key} is still referenced by a relation`);
    }
    this.database.prepare("DELETE FROM business_nodes WHERE identity_id = ?").run(identity.identity_id);
    this.database.prepare(`
      DELETE FROM graph_search
      WHERE repository_id = ?
        AND scope = 'business'
        AND node_domain = 'business'
        AND node_key = ?
    `).run(this.#repositoryId, key);
  }

  private removeBusinessRelation(
    baseSnapshotId: string,
    selector: BusinessRelationSelector,
  ): void {
    this.requireBusinessEndpoint(selector.from);
    if (selector.to.domain === "business") {
      this.requireBusinessEndpoint(selector.to);
    } else {
      this.requireStructuralEndpoint(selector.to, baseSnapshotId);
    }
    const relation = this.findBusinessRelation(selector);
    if (relation !== undefined) {
      this.database.prepare("DELETE FROM business_relations WHERE relation_id = ?")
        .run(relation.relation_id);
    }
  }

  private insertNodeEvidence(identityId: number, position: number, evidence: Evidence): void {
    const symbolIdentity = this.requireIdentity({ domain: "structural", id: evidence.symbolId });
    this.database.prepare(`
      INSERT INTO business_node_evidence (
        identity_id,
        position,
        symbol_identity_id,
        file,
        start_line,
        start_column,
        end_line,
        end_column,
        content_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      identityId,
      position,
      symbolIdentity.identity_id,
      evidence.file,
      evidence.range.start.line,
      evidence.range.start.column,
      evidence.range.end.line,
      evidence.range.end.column,
      evidence.contentHash,
    );
  }

  private insertRelationEvidence(relationId: number, position: number, evidence: Evidence): void {
    const symbolIdentity = this.requireIdentity({ domain: "structural", id: evidence.symbolId });
    this.database.prepare(`
      INSERT INTO business_relation_evidence (
        relation_id,
        position,
        symbol_identity_id,
        file,
        start_line,
        start_column,
        end_line,
        end_column,
        content_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      relationId,
      position,
      symbolIdentity.identity_id,
      evidence.file,
      evidence.range.start.line,
      evidence.range.start.column,
      evidence.range.end.line,
      evidence.range.end.column,
      evidence.contentHash,
    );
  }

  private requireEvidence(snapshotId: string, evidence: Evidence): void {
    const row = this.database.prepare(`
      SELECT 1 AS present
      FROM graph_node_identities AS identity
      JOIN structural_nodes AS node
        ON node.identity_id = identity.identity_id
      JOIN structural_node_locations AS location
        ON location.identity_id = node.identity_id
        AND location.snapshot_id = node.snapshot_id
      WHERE identity.repository_id = ?
        AND identity.domain = 'structural'
        AND identity.node_key = ?
        AND node.snapshot_id = ?
        AND node.kind = 'Symbol'
        AND location.file = ?
        AND location.start_line = ?
        AND location.start_column = ?
        AND location.end_line = ?
        AND location.end_column = ?
        AND location.content_hash = ?
      LIMIT 1
    `).get(
      this.#repositoryId,
      evidence.symbolId,
      snapshotId,
      evidence.file,
      evidence.range.start.line,
      evidence.range.start.column,
      evidence.range.end.line,
      evidence.range.end.column,
      evidence.contentHash,
    );
    if (row === undefined) {
      throw new Error(
        `Evidence ${evidence.symbolId} at ${evidence.file} does not match snapshot ${snapshotId}`,
      );
    }
  }

  private refreshBusinessValidity(snapshotId: string): void {
    this.database.prepare(`
      INSERT INTO business_node_validity (
        identity_id,
        repository_id,
        snapshot_id,
        validity
      )
      SELECT
        assertion.identity_id,
        assertion.repository_id,
        ?,
        CASE WHEN EXISTS (
          SELECT 1
          FROM business_node_evidence AS evidence
          WHERE evidence.identity_id = assertion.identity_id
            AND NOT EXISTS (
              SELECT 1
              FROM structural_nodes AS symbol
              JOIN structural_node_locations AS location
                ON location.identity_id = symbol.identity_id
                AND location.snapshot_id = symbol.snapshot_id
              WHERE symbol.identity_id = evidence.symbol_identity_id
                AND symbol.snapshot_id = ?
                AND symbol.kind = 'Symbol'
                AND location.file = evidence.file
                AND location.start_line = evidence.start_line
                AND location.start_column = evidence.start_column
                AND location.end_line = evidence.end_line
                AND location.end_column = evidence.end_column
                AND location.content_hash = evidence.content_hash
            )
        ) THEN 'stale' ELSE 'valid' END
      FROM business_nodes AS assertion
      WHERE assertion.repository_id = ?
      ON CONFLICT (identity_id, snapshot_id) DO UPDATE SET
        validity = excluded.validity
    `).run(snapshotId, snapshotId, this.#repositoryId);
    this.database.prepare(`
      INSERT INTO business_relation_validity (
        relation_id,
        repository_id,
        snapshot_id,
        validity
      )
      SELECT
        assertion.relation_id,
        assertion.repository_id,
        ?,
        CASE WHEN EXISTS (
          SELECT 1
          FROM business_relation_evidence AS evidence
          WHERE evidence.relation_id = assertion.relation_id
            AND NOT EXISTS (
              SELECT 1
              FROM structural_nodes AS symbol
              JOIN structural_node_locations AS location
                ON location.identity_id = symbol.identity_id
                AND location.snapshot_id = symbol.snapshot_id
              WHERE symbol.identity_id = evidence.symbol_identity_id
                AND symbol.snapshot_id = ?
                AND symbol.kind = 'Symbol'
                AND location.file = evidence.file
                AND location.start_line = evidence.start_line
                AND location.start_column = evidence.start_column
                AND location.end_line = evidence.end_line
                AND location.end_column = evidence.end_column
                AND location.content_hash = evidence.content_hash
            )
        ) OR (
          EXISTS (
            SELECT 1
            FROM graph_node_identities AS target
            WHERE target.identity_id = assertion.to_identity_id
              AND target.domain = 'structural'
          )
          AND NOT EXISTS (
            SELECT 1
            FROM structural_nodes AS target_node
            WHERE target_node.identity_id = assertion.to_identity_id
              AND target_node.snapshot_id = ?
          )
        ) THEN 'stale' ELSE 'valid' END
      FROM business_relations AS assertion
      WHERE assertion.repository_id = ?
      ON CONFLICT (relation_id, snapshot_id) DO UPDATE SET
        validity = excluded.validity
    `).run(snapshotId, snapshotId, snapshotId, this.#repositoryId);
  }

  private refreshAllBusinessValidity(): void {
    const snapshots = this.database.prepare(`
      SELECT snapshot_id
      FROM structural_graph_snapshots
      WHERE repository_id = ?
      ORDER BY snapshot_id ASC
    `).all(this.#repositoryId) as unknown as { snapshot_id: string }[];
    for (const { snapshot_id } of snapshots) {
      this.refreshBusinessValidity(snapshot_id);
    }
  }

  private readStructuralNode(id: string, snapshotId: string): GraphNode | undefined {
    const row = this.database.prepare(`
      SELECT
        identity.identity_id,
        identity.domain,
        identity.node_key,
        node.snapshot_id,
        node.kind,
        node.label,
        boundary.reason
      FROM graph_node_identities AS identity
      JOIN structural_nodes AS node
        ON node.identity_id = identity.identity_id
      LEFT JOIN unknown_boundaries AS boundary
        ON boundary.identity_id = node.identity_id
        AND boundary.snapshot_id = node.snapshot_id
      WHERE identity.repository_id = ?
        AND identity.domain = 'structural'
        AND identity.node_key = ?
        AND node.snapshot_id = ?
    `).get(this.#repositoryId, id, snapshotId) as StructuralNodeRow | undefined;
    if (row === undefined) {
      return undefined;
    }
    const locations = this.readLocations(row.identity_id, snapshotId);
    if (row.kind === "UnknownBoundary") {
      const location = locations[0];
      if (location === undefined || row.reason === null) {
        throw new Error(`Unknown boundary ${id} is missing its location or reason`);
      }
      const candidates = this.database.prepare(`
        SELECT candidate
        FROM unknown_boundary_candidates
        WHERE identity_id = ? AND snapshot_id = ?
        ORDER BY position ASC
      `).all(row.identity_id, snapshotId) as unknown as { candidate: string }[];
      return {
        domain: "structural",
        id,
        kind: "UnknownBoundary",
        label: row.label,
        snapshotId,
        validity: "unknown",
        reason: row.reason,
        location,
        candidates: candidates.map(({ candidate }) => candidate),
      };
    }

    return {
      domain: "structural",
      id,
      kind: row.kind,
      label: row.label,
      snapshotId,
      validity: "valid",
      locations,
    } as StructuralGraphNode;
  }

  private readBusinessNode(key: string, snapshotId: string): BusinessGraphNode | undefined {
    const row = this.database.prepare(`
      SELECT
        identity.identity_id,
        identity.domain,
        identity.node_key,
        node.base_snapshot_id,
        node.kind,
        node.label,
        node.summary,
        node.certainty,
        COALESCE(validity.validity, 'stale') AS validity
      FROM graph_node_identities AS identity
      JOIN business_nodes AS node
        ON node.identity_id = identity.identity_id
      LEFT JOIN business_node_validity AS validity
        ON validity.identity_id = node.identity_id
        AND validity.snapshot_id = ?
      WHERE identity.repository_id = ?
        AND identity.domain = 'business'
        AND identity.node_key = ?
    `).get(snapshotId, this.#repositoryId, key) as BusinessNodeRow | undefined;
    if (row === undefined) {
      return undefined;
    }
    const aliases = this.database.prepare(`
      SELECT alias
      FROM business_node_aliases
      WHERE identity_id = ?
      ORDER BY position ASC
    `).all(row.identity_id) as unknown as { alias: string }[];
    return {
      domain: "business",
      key,
      kind: row.kind,
      label: row.label,
      summary: row.summary,
      aliases: aliases.map(({ alias }) => alias),
      certainty: row.certainty,
      validity: row.validity,
      evidence: this.readNodeEvidence(row.identity_id),
      baseSnapshotId: row.base_snapshot_id,
    };
  }

  private readLocations(identityId: number, snapshotId: string): readonly GraphSourceLocation[] {
    const rows = this.database.prepare(`
      SELECT
        file,
        start_line,
        start_column,
        end_line,
        end_column,
        content_hash
      FROM structural_node_locations
      WHERE identity_id = ? AND snapshot_id = ?
      ORDER BY position ASC
    `).all(identityId, snapshotId) as unknown as LocationRow[];
    return rows.map(locationFromRow);
  }

  private readNodeEvidence(identityId: number): readonly Evidence[] {
    const rows = this.database.prepare(`
      SELECT
        symbol.node_key AS symbol_id,
        evidence.file,
        evidence.start_line,
        evidence.start_column,
        evidence.end_line,
        evidence.end_column,
        evidence.content_hash
      FROM business_node_evidence AS evidence
      JOIN graph_node_identities AS symbol
        ON symbol.identity_id = evidence.symbol_identity_id
      WHERE evidence.identity_id = ?
      ORDER BY evidence.position ASC
    `).all(identityId) as unknown as EvidenceRow[];
    return rows.map(evidenceFromRow);
  }

  private readRelationEvidence(relationId: number): readonly Evidence[] {
    const rows = this.database.prepare(`
      SELECT
        symbol.node_key AS symbol_id,
        evidence.file,
        evidence.start_line,
        evidence.start_column,
        evidence.end_line,
        evidence.end_column,
        evidence.content_hash
      FROM business_relation_evidence AS evidence
      JOIN graph_node_identities AS symbol
        ON symbol.identity_id = evidence.symbol_identity_id
      WHERE evidence.relation_id = ?
      ORDER BY evidence.position ASC
    `).all(relationId) as unknown as EvidenceRow[];
    return rows.map(evidenceFromRow);
  }

  private readAdjacency(
    reference: GraphNodeReference,
    snapshotId: string,
    direction: TraversalDirection,
  ): readonly InternalAdjacency[] {
    const identity = this.findIdentity(reference);
    if (identity === undefined) {
      return [];
    }
    const adjacency: InternalAdjacency[] = [];
    const directions = direction === "both" ? ["outgoing", "incoming"] as const : [direction];

    for (const currentDirection of directions) {
      const endpointColumn = currentDirection === "outgoing" ? "from_identity_id" : "to_identity_id";
      const structuralRows = this.database.prepare(`
        SELECT
          relation.relation_id,
          relation.snapshot_id,
          relation.relation_type,
          relation.from_identity_id,
          source.node_key AS from_key,
          relation.to_identity_id,
          target.node_key AS to_key
        FROM structural_relations AS relation
        JOIN graph_node_identities AS source
          ON source.identity_id = relation.from_identity_id
        JOIN graph_node_identities AS target
          ON target.identity_id = relation.to_identity_id
        WHERE relation.repository_id = ?
          AND relation.snapshot_id = ?
          AND relation.${endpointColumn} = ?
      `).all(this.#repositoryId, snapshotId, identity.identity_id) as unknown as StructuralRelationRow[];
      for (const row of structuralRows) {
        const otherId = currentDirection === "outgoing" ? row.to_key : row.from_key;
        const node = this.readStructuralNode(otherId, snapshotId);
        if (node === undefined) {
          continue;
        }
        const relation: StructuralGraphRelation = {
          domain: "structural",
          from: { domain: "structural", id: row.from_key },
          type: row.relation_type,
          to: { domain: "structural", id: row.to_key },
          snapshotId: row.snapshot_id,
          certainty: null,
          validity: "valid",
          evidence: [],
        };
        adjacency.push({
          relationKey: `structural:${row.relation_id}`,
          direction: currentDirection,
          relation,
          node,
        });
      }

      const businessRows = this.database.prepare(`
        SELECT
          relation.relation_id,
          relation.base_snapshot_id,
          relation.relation_type,
          relation.certainty,
          COALESCE(validity.validity, 'stale') AS validity,
          relation.from_identity_id,
          source.node_key AS from_key,
          relation.to_identity_id,
          target.domain AS to_domain,
          target.node_key AS to_key
        FROM business_relations AS relation
        JOIN graph_node_identities AS source
          ON source.identity_id = relation.from_identity_id
        JOIN graph_node_identities AS target
          ON target.identity_id = relation.to_identity_id
        LEFT JOIN business_relation_validity AS validity
          ON validity.relation_id = relation.relation_id
          AND validity.snapshot_id = ?
        WHERE relation.repository_id = ?
          AND relation.${endpointColumn} = ?
      `).all(snapshotId, this.#repositoryId, identity.identity_id) as unknown as BusinessRelationRow[];
      for (const row of businessRows) {
        const from: BusinessNodeReference = { domain: "business", key: row.from_key };
        const to: GraphNodeReference = row.to_domain === "business"
          ? { domain: "business", key: row.to_key }
          : { domain: "structural", id: row.to_key };
        const other = currentDirection === "outgoing" ? to : from;
        const node = this.readRelationNode(other, snapshotId, row.base_snapshot_id);
        if (node === undefined) {
          continue;
        }
        const relation: BusinessGraphRelation = {
          domain: "business",
          from,
          type: row.relation_type,
          to,
          baseSnapshotId: row.base_snapshot_id,
          certainty: row.certainty,
          validity: row.validity,
          evidence: this.readRelationEvidence(row.relation_id),
        };
        adjacency.push({
          relationKey: `business:${row.relation_id}`,
          direction: currentDirection,
          relation,
          node,
        });
      }
    }

    return adjacency.sort((left, right) => {
      const typeOrder = left.relation.type.localeCompare(right.relation.type);
      if (typeOrder !== 0) {
        return typeOrder;
      }
      return referenceKey(nodeReference(left.node)).localeCompare(referenceKey(nodeReference(right.node)));
    });
  }

  private readRelationNode(
    reference: GraphNodeReference,
    currentSnapshotId: string,
    baseSnapshotId: string,
  ): GraphNode | undefined {
    const current = this.getNode(reference, currentSnapshotId);
    if (current !== undefined || reference.domain === "business") {
      return current;
    }
    const historical = this.readStructuralNode(reference.id, baseSnapshotId);
    if (historical === undefined || historical.kind === "UnknownBoundary") {
      return historical;
    }
    return { ...historical, validity: "stale" };
  }

  private findBusinessRelation(
    selector: BusinessRelationSelector,
  ): { relation_id: number } | undefined {
    const from = this.findIdentity(selector.from);
    const to = this.findIdentity(selector.to);
    if (from === undefined || to === undefined) {
      return undefined;
    }
    return this.database.prepare(`
      SELECT relation_id
      FROM business_relations
      WHERE repository_id = ?
        AND from_identity_id = ?
        AND relation_type = ?
        AND to_identity_id = ?
    `).get(
      this.#repositoryId,
      from.identity_id,
      selector.type,
      to.identity_id,
    ) as { relation_id: number } | undefined;
  }

  private requireBusinessEndpoint(reference: BusinessNodeReference): IdentityRow {
    const identity = this.requireIdentity(reference);
    const row = this.database.prepare(`
      SELECT 1 AS present
      FROM business_nodes
      WHERE identity_id = ? AND repository_id = ?
    `).get(identity.identity_id, this.#repositoryId);
    if (row === undefined) {
      throw new Error(`Business relation endpoint ${reference.key} is missing`);
    }
    return identity;
  }

  private requireStructuralEndpoint(
    reference: StructuralNodeReference,
    snapshotId: string,
  ): IdentityRow {
    const identity = this.requireIdentity(reference);
    const row = this.database.prepare(`
      SELECT 1 AS present
      FROM structural_nodes
      WHERE identity_id = ? AND repository_id = ? AND snapshot_id = ?
    `).get(identity.identity_id, this.#repositoryId, snapshotId);
    if (row === undefined) {
      throw new Error(`Structural relation endpoint ${reference.id} is missing from ${snapshotId}`);
    }
    return identity;
  }

  private ensureIdentity(reference: GraphNodeReference): number {
    const key = reference.domain === "business" ? reference.key : reference.id;
    this.database.prepare(`
      INSERT INTO graph_node_identities (repository_id, domain, node_key)
      VALUES (?, ?, ?)
      ON CONFLICT (repository_id, domain, node_key) DO NOTHING
    `).run(this.#repositoryId, reference.domain, key);
    return this.requireIdentity(reference).identity_id;
  }

  private requireIdentity(reference: GraphNodeReference): IdentityRow {
    const identity = this.findIdentity(reference);
    if (identity === undefined) {
      const key = reference.domain === "business" ? reference.key : reference.id;
      throw new Error(`Graph node identity ${key} is missing`);
    }
    return identity;
  }

  private findIdentity(reference: GraphNodeReference): IdentityRow | undefined {
    const key = reference.domain === "business" ? reference.key : reference.id;
    return this.database.prepare(`
      SELECT identity_id, domain, node_key
      FROM graph_node_identities
      WHERE repository_id = ? AND domain = ? AND node_key = ?
    `).get(this.#repositoryId, reference.domain, key) as IdentityRow | undefined;
  }

  private insertSearchDocument(document: {
    scope: string;
    domain: "structural" | "business";
    key: string;
    label: string;
    aliases: string;
    summary: string;
    symbols: string;
    paths: string;
  }): void {
    this.database.prepare(`
      INSERT INTO graph_search (
        repository_id,
        scope,
        node_domain,
        node_key,
        label,
        aliases,
        summary,
        symbols,
        paths
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      this.#repositoryId,
      document.scope,
      document.domain,
      document.key,
      document.label,
      document.aliases,
      document.summary,
      document.symbols,
      document.paths,
    );
  }
}

function locationFromRow(row: LocationRow): GraphSourceLocation {
  return {
    file: row.file,
    range: {
      start: { line: row.start_line, column: row.start_column },
      end: { line: row.end_line, column: row.end_column },
    },
    contentHash: row.content_hash,
  };
}

function evidenceFromRow(row: EvidenceRow): Evidence {
  return {
    symbolId: row.symbol_id,
    ...locationFromRow(row),
  };
}

function nodeReference(node: GraphNode): GraphNodeReference {
  return node.domain === "business"
    ? { domain: "business", key: node.key }
    : { domain: "structural", id: node.id };
}

function referenceKey(reference: GraphNodeReference): string {
  return reference.domain === "business"
    ? `business:${reference.key}`
    : `structural:${reference.id}`;
}

function relevanceScoreFromBm25(rank: number): number {
  return 1 / (1 + Math.exp(rank));
}

export { CURRENT_ATLAS_SCHEMA_VERSION };
