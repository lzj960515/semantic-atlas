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
} from "../contracts/graph.js";
import { contentIdentifierSchema } from "../contracts/identifiers.js";
import type { GitRepository } from "../repository/types.js";
import type { RepositorySnapshot } from "../snapshots/types.js";
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
  GraphSearchOptions,
  GraphSearchResult,
  GraphSourceLocation,
  GraphTraversalOptions,
  KnowledgeValidity,
  TraversalDirection,
} from "./types.js";

interface BusinessNodeRow {
  readonly node_id: number;
  readonly base_snapshot_id: string;
  readonly kind: BusinessGraphNode["kind"];
  readonly label: string;
  readonly summary: string;
  readonly certainty: AssertionCertainty;
  readonly validity: KnowledgeValidity;
}

interface EvidenceRow {
  readonly structural_reference: string;
  readonly file: string;
  readonly start_line: number;
  readonly start_column: number;
  readonly end_line: number;
  readonly end_column: number;
  readonly content_hash: string;
}

interface BusinessRelationRow {
  readonly relation_id: number;
  readonly base_snapshot_id: string;
  readonly from_key: string;
  readonly relation_type: BusinessGraphRelation["type"];
  readonly to_domain: "structural" | "business";
  readonly to_key: string;
  readonly certainty: AssertionCertainty;
  readonly validity: KnowledgeValidity;
}

interface InternalAdjacency {
  readonly relationKey: string;
  readonly direction: "incoming" | "outgoing";
  readonly relation: BusinessGraphRelation;
  readonly node: BusinessGraphNode;
}

export class GraphStore implements Disposable {
  readonly databasePath: string;
  readonly #atlasDatabase: AtlasDatabase;
  readonly #repositoryId: string;

  constructor(repository: GitRepository) {
    this.#atlasDatabase = new AtlasDatabase(repository);
    this.databasePath = this.#atlasDatabase.databasePath;
    this.#repositoryId = repository.repositoryId;
  }

  get schemaVersion(): number {
    return this.#atlasDatabase.schemaVersion;
  }

  reconcileSnapshot(snapshotId: string): void {
    contentIdentifierSchema.parse(snapshotId);
    this.transaction(() => {
      const snapshot = this.requireSnapshot(snapshotId);
      this.refreshBusinessValidity(snapshot);
    });
  }

  mutateBusinessGraph(mutation: BusinessGraphMutation): void {
    this.validateBusinessMutation(mutation);

    this.transaction(() => {
      this.requireSnapshot(mutation.baseSnapshotId);
      for (const selector of mutation.removeRelations) {
        this.removeBusinessRelation(selector);
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
      : undefined;
  }

  getEvidence(owner: EvidenceOwner): readonly Evidence[] {
    if (owner.type === "node") {
      const nodeId = this.findBusinessNodeId(owner.node.key);
      return nodeId === undefined ? [] : this.readNodeEvidence(nodeId);
    }

    const relation = this.findBusinessRelation(owner.relation);
    return relation === undefined ? [] : this.readRelationEvidence(relation.relation_id);
  }

  listBusinessRelations(snapshotId: string): readonly BusinessGraphRelation[] {
    contentIdentifierSchema.parse(snapshotId);
    return this.readBusinessRelations(snapshotId).map((row) => this.relationFromRow(row));
  }

  traverse(
    start: GraphNodeReference,
    options: GraphTraversalOptions,
  ): readonly GraphNeighbor[] {
    const maxDepth = options.maxDepth ?? 1;
    if (!Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > 3) {
      throw new Error("Graph traversal depth must be an integer from 1 through 3");
    }
    if (start.domain === "structural" || this.getNode(start, options.snapshotId) === undefined) {
      return [];
    }

    const direction = options.direction ?? "both";
    const relationTypes = options.relationTypes === undefined
      ? undefined
      : new Set(options.relationTypes);
    const queue: { reference: BusinessNodeReference; depth: number }[] = [
      { reference: start, depth: 0 },
    ];
    const queuedNodes = new Set([start.key]);
    const emittedRelations = new Set<string>();
    const result: GraphNeighbor[] = [];

    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index]!;
      if (current.depth >= maxDepth) {
        continue;
      }

      for (const adjacent of this.readBusinessAdjacency(
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
        if (!queuedNodes.has(adjacent.node.key)) {
          queuedNodes.add(adjacent.node.key);
          queue.push({
            reference: { domain: "business", key: adjacent.node.key },
            depth,
          });
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
    const terms = query.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [];
    if (terms.length === 0) {
      return [];
    }

    const rows = this.database.prepare(`
      SELECT node_key, label, aliases, summary, symbols, paths
      FROM atlas_graph_search
      WHERE repository_id = ?
      ORDER BY node_key ASC
    `).all(this.#repositoryId) as unknown as {
      node_key: string;
      label: string;
      aliases: string;
      summary: string;
      symbols: string;
      paths: string;
    }[];

    return rows.flatMap((row): GraphSearchResult[] => {
      const fields = [row.label, row.aliases, row.summary, row.symbols, row.paths]
        .map((value) => value.toLowerCase());
      if (!terms.every((term) => fields.some((field) => field.includes(term)))) {
        return [];
      }
      const node = this.readBusinessNode(row.node_key, options.snapshotId);
      if (node === undefined) {
        return [];
      }
      return [{ score: lexicalScore(terms, fields), node }];
    }).sort((left, right) => (
      right.score - left.score
      || businessKeyOf(left.node).localeCompare(businessKeyOf(right.node))
    )).slice(0, limit);
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

  private requireSnapshot(snapshotId: string): RepositorySnapshot {
    const row = this.database.prepare(`
      SELECT payload
      FROM atlas_repository_snapshots
      WHERE repository_id = ? AND snapshot_id = ?
    `).get(this.#repositoryId, snapshotId) as { payload: string } | undefined;
    if (row === undefined) {
      throw new Error(`Repository snapshot ${snapshotId} is not stored`);
    }
    return JSON.parse(row.payload) as RepositorySnapshot;
  }

  private upsertBusinessNode(baseSnapshotId: string, node: BusinessNodeInput): void {
    const snapshot = this.requireSnapshot(baseSnapshotId);
    node.evidence.forEach((evidence) => this.requireEvidence(snapshot, evidence));
    this.database.prepare(`
      INSERT INTO atlas_business_nodes (
        repository_id,
        node_key,
        base_snapshot_id,
        kind,
        label,
        summary,
        certainty
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (repository_id, node_key) DO UPDATE SET
        base_snapshot_id = excluded.base_snapshot_id,
        kind = excluded.kind,
        label = excluded.label,
        summary = excluded.summary,
        certainty = excluded.certainty
    `).run(
      this.#repositoryId,
      node.key,
      baseSnapshotId,
      node.kind,
      node.label,
      node.summary,
      node.certainty,
    );
    const nodeId = this.requireBusinessNodeId(node.key);
    this.database.prepare("DELETE FROM atlas_business_node_aliases WHERE node_id = ?").run(nodeId);
    this.database.prepare("DELETE FROM atlas_business_node_evidence WHERE node_id = ?").run(nodeId);
    node.aliases.forEach((alias, position) => {
      this.database.prepare(`
        INSERT INTO atlas_business_node_aliases (node_id, position, alias)
        VALUES (?, ?, ?)
      `).run(nodeId, position, alias);
    });
    node.evidence.forEach((evidence, position) => {
      this.insertNodeEvidence(nodeId, position, evidence);
    });
    this.database.prepare(`
      INSERT INTO atlas_graph_search (
        repository_id,
        node_key,
        label,
        aliases,
        summary,
        symbols,
        paths
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (repository_id, node_key) DO UPDATE SET
        label = excluded.label,
        aliases = excluded.aliases,
        summary = excluded.summary,
        symbols = excluded.symbols,
        paths = excluded.paths
    `).run(
      this.#repositoryId,
      node.key,
      node.label,
      node.aliases.join(" "),
      node.summary,
      node.evidence.map((evidence) => evidence.symbolId).join(" "),
      node.evidence.map((evidence) => evidence.file).join(" "),
    );
  }

  private upsertBusinessRelation(
    baseSnapshotId: string,
    relation: BusinessRelationInput,
  ): void {
    const snapshot = this.requireSnapshot(baseSnapshotId);
    relation.evidence.forEach((evidence) => this.requireEvidence(snapshot, evidence));
    this.requireBusinessNodeId(relation.from.key);
    if (relation.to.domain === "business") {
      this.requireBusinessNodeId(relation.to.key);
    }
    const targetKey = relation.to.domain === "business" ? relation.to.key : relation.to.id;
    this.database.prepare(`
      INSERT INTO atlas_business_relations (
        repository_id,
        base_snapshot_id,
        from_key,
        relation_type,
        to_domain,
        to_key,
        certainty
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (repository_id, from_key, relation_type, to_domain, to_key)
      DO UPDATE SET
        base_snapshot_id = excluded.base_snapshot_id,
        certainty = excluded.certainty
    `).run(
      this.#repositoryId,
      baseSnapshotId,
      relation.from.key,
      relation.type,
      relation.to.domain,
      targetKey,
      relation.certainty,
    );
    const stored = this.findBusinessRelation(relation);
    if (stored === undefined) {
      throw new Error("Business relation was not stored");
    }
    this.database.prepare(`
      DELETE FROM atlas_business_relation_evidence
      WHERE relation_id = ?
    `).run(stored.relation_id);
    relation.evidence.forEach((evidence, position) => {
      this.insertRelationEvidence(stored.relation_id, position, evidence);
    });
  }

  private removeBusinessNode(key: string): void {
    this.requireBusinessNodeId(key);
    const relation = this.database.prepare(`
      SELECT relation_id
      FROM atlas_business_relations
      WHERE repository_id = ?
        AND (from_key = ? OR (to_domain = 'business' AND to_key = ?))
      LIMIT 1
    `).get(this.#repositoryId, key, key);
    if (relation !== undefined) {
      throw new Error(`Business node ${key} is still referenced by a relation`);
    }
    this.database.prepare(`
      DELETE FROM atlas_business_nodes
      WHERE repository_id = ? AND node_key = ?
    `).run(this.#repositoryId, key);
  }

  private removeBusinessRelation(selector: BusinessRelationSelector): void {
    this.requireBusinessNodeId(selector.from.key);
    if (selector.to.domain === "business") {
      this.requireBusinessNodeId(selector.to.key);
    }
    const relation = this.findBusinessRelation(selector);
    if (relation !== undefined) {
      this.database.prepare("DELETE FROM atlas_business_relations WHERE relation_id = ?")
        .run(relation.relation_id);
    }
  }

  private insertNodeEvidence(nodeId: number, position: number, evidence: Evidence): void {
    this.database.prepare(`
      INSERT INTO atlas_business_node_evidence (
        node_id,
        position,
        structural_reference,
        file,
        start_line,
        start_column,
        end_line,
        end_column,
        content_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      nodeId,
      position,
      evidence.symbolId,
      evidence.file,
      evidence.range.start.line,
      evidence.range.start.column,
      evidence.range.end.line,
      evidence.range.end.column,
      evidence.contentHash,
    );
  }

  private insertRelationEvidence(relationId: number, position: number, evidence: Evidence): void {
    this.database.prepare(`
      INSERT INTO atlas_business_relation_evidence (
        relation_id,
        position,
        structural_reference,
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
      evidence.symbolId,
      evidence.file,
      evidence.range.start.line,
      evidence.range.start.column,
      evidence.range.end.line,
      evidence.range.end.column,
      evidence.contentHash,
    );
  }

  private requireEvidence(snapshot: RepositorySnapshot, evidence: Evidence): void {
    this.validateLocation(evidence);
    if (!evidenceMatchesSnapshot(evidence, snapshot)) {
      throw new Error(
        `Evidence ${evidence.symbolId} at ${evidence.file} does not match snapshot ${snapshot.snapshotId}`,
      );
    }
  }

  private refreshAllBusinessValidity(): void {
    const snapshots = this.database.prepare(`
      SELECT payload
      FROM atlas_repository_snapshots
      WHERE repository_id = ?
      ORDER BY snapshot_id ASC
    `).all(this.#repositoryId) as unknown as { payload: string }[];
    for (const { payload } of snapshots) {
      this.refreshBusinessValidity(JSON.parse(payload) as RepositorySnapshot);
    }
  }

  private refreshBusinessValidity(snapshot: RepositorySnapshot): void {
    const nodeRows = this.database.prepare(`
      SELECT node_id
      FROM atlas_business_nodes
      WHERE repository_id = ?
    `).all(this.#repositoryId) as unknown as { node_id: number }[];
    for (const { node_id } of nodeRows) {
      const validity = allEvidenceMatches(this.readNodeEvidence(node_id), snapshot) ? "valid" : "stale";
      this.database.prepare(`
        INSERT INTO atlas_business_node_validity (
          node_id,
          repository_id,
          snapshot_id,
          validity
        ) VALUES (?, ?, ?, ?)
        ON CONFLICT (node_id, snapshot_id) DO UPDATE SET
          validity = excluded.validity
      `).run(node_id, this.#repositoryId, snapshot.snapshotId, validity);
    }

    const relationRows = this.database.prepare(`
      SELECT relation_id
      FROM atlas_business_relations
      WHERE repository_id = ?
    `).all(this.#repositoryId) as unknown as { relation_id: number }[];
    for (const { relation_id } of relationRows) {
      const validity = allEvidenceMatches(this.readRelationEvidence(relation_id), snapshot)
        ? "valid"
        : "stale";
      this.database.prepare(`
        INSERT INTO atlas_business_relation_validity (
          relation_id,
          repository_id,
          snapshot_id,
          validity
        ) VALUES (?, ?, ?, ?)
        ON CONFLICT (relation_id, snapshot_id) DO UPDATE SET
          validity = excluded.validity
      `).run(relation_id, this.#repositoryId, snapshot.snapshotId, validity);
    }
  }

  private readBusinessNode(key: string, snapshotId: string): BusinessGraphNode | undefined {
    const row = this.database.prepare(`
      SELECT
        node.node_id,
        node.base_snapshot_id,
        node.kind,
        node.label,
        node.summary,
        node.certainty,
        COALESCE(validity.validity, 'stale') AS validity
      FROM atlas_business_nodes AS node
      LEFT JOIN atlas_business_node_validity AS validity
        ON validity.node_id = node.node_id
        AND validity.snapshot_id = ?
      WHERE node.repository_id = ? AND node.node_key = ?
    `).get(snapshotId, this.#repositoryId, key) as BusinessNodeRow | undefined;
    if (row === undefined) {
      return undefined;
    }
    const aliases = this.database.prepare(`
      SELECT alias
      FROM atlas_business_node_aliases
      WHERE node_id = ?
      ORDER BY position ASC
    `).all(row.node_id) as unknown as { alias: string }[];
    return {
      domain: "business",
      key,
      kind: row.kind,
      label: row.label,
      summary: row.summary,
      aliases: aliases.map(({ alias }) => alias),
      certainty: row.certainty,
      validity: row.validity,
      evidence: this.readNodeEvidence(row.node_id),
      baseSnapshotId: row.base_snapshot_id,
    };
  }

  private readNodeEvidence(nodeId: number): readonly Evidence[] {
    const rows = this.database.prepare(`
      SELECT
        structural_reference,
        file,
        start_line,
        start_column,
        end_line,
        end_column,
        content_hash
      FROM atlas_business_node_evidence
      WHERE node_id = ?
      ORDER BY position ASC
    `).all(nodeId) as unknown as EvidenceRow[];
    return rows.map(evidenceFromRow);
  }

  private readRelationEvidence(relationId: number): readonly Evidence[] {
    const rows = this.database.prepare(`
      SELECT
        structural_reference,
        file,
        start_line,
        start_column,
        end_line,
        end_column,
        content_hash
      FROM atlas_business_relation_evidence
      WHERE relation_id = ?
      ORDER BY position ASC
    `).all(relationId) as unknown as EvidenceRow[];
    return rows.map(evidenceFromRow);
  }

  private readBusinessRelations(snapshotId: string): readonly BusinessRelationRow[] {
    return this.database.prepare(`
      SELECT
        relation.relation_id,
        relation.base_snapshot_id,
        relation.from_key,
        relation.relation_type,
        relation.to_domain,
        relation.to_key,
        relation.certainty,
        COALESCE(validity.validity, 'stale') AS validity
      FROM atlas_business_relations AS relation
      LEFT JOIN atlas_business_relation_validity AS validity
        ON validity.relation_id = relation.relation_id
        AND validity.snapshot_id = ?
      WHERE relation.repository_id = ?
      ORDER BY relation.from_key, relation.relation_type, relation.to_domain, relation.to_key
    `).all(snapshotId, this.#repositoryId) as unknown as BusinessRelationRow[];
  }

  private relationFromRow(row: BusinessRelationRow): BusinessGraphRelation {
    return {
      domain: "business",
      from: { domain: "business", key: row.from_key },
      type: row.relation_type,
      to: row.to_domain === "business"
        ? { domain: "business", key: row.to_key }
        : { domain: "structural", id: row.to_key },
      baseSnapshotId: row.base_snapshot_id,
      certainty: row.certainty,
      validity: row.validity,
      evidence: this.readRelationEvidence(row.relation_id),
    } as BusinessGraphRelation;
  }

  private readBusinessAdjacency(
    reference: BusinessNodeReference,
    snapshotId: string,
    direction: TraversalDirection,
  ): readonly InternalAdjacency[] {
    const directions = direction === "both" ? ["outgoing", "incoming"] as const : [direction];
    const adjacency: InternalAdjacency[] = [];
    for (const currentDirection of directions) {
      for (const row of this.readBusinessRelations(snapshotId)) {
        const isAdjacent = currentDirection === "outgoing"
          ? row.from_key === reference.key && row.to_domain === "business"
          : row.to_domain === "business" && row.to_key === reference.key;
        if (!isAdjacent) {
          continue;
        }
        const otherKey = currentDirection === "outgoing" ? row.to_key : row.from_key;
        const node = this.readBusinessNode(otherKey, snapshotId);
        if (node === undefined) {
          continue;
        }
        adjacency.push({
          relationKey: `business:${row.relation_id}`,
          direction: currentDirection,
          relation: this.relationFromRow(row),
          node,
        });
      }
    }
    return adjacency.sort((left, right) => (
      left.relation.type.localeCompare(right.relation.type)
      || left.node.key.localeCompare(right.node.key)
    ));
  }

  private findBusinessRelation(
    selector: BusinessRelationSelector,
  ): { relation_id: number } | undefined {
    const targetKey = selector.to.domain === "business" ? selector.to.key : selector.to.id;
    return this.database.prepare(`
      SELECT relation_id
      FROM atlas_business_relations
      WHERE repository_id = ?
        AND from_key = ?
        AND relation_type = ?
        AND to_domain = ?
        AND to_key = ?
    `).get(
      this.#repositoryId,
      selector.from.key,
      selector.type,
      selector.to.domain,
      targetKey,
    ) as { relation_id: number } | undefined;
  }

  private findBusinessNodeId(key: string): number | undefined {
    const row = this.database.prepare(`
      SELECT node_id
      FROM atlas_business_nodes
      WHERE repository_id = ? AND node_key = ?
    `).get(this.#repositoryId, key) as { node_id: number } | undefined;
    return row?.node_id;
  }

  private requireBusinessNodeId(key: string): number {
    const nodeId = this.findBusinessNodeId(key);
    if (nodeId === undefined) {
      throw new Error(`Business relation endpoint ${key} is missing`);
    }
    return nodeId;
  }
}

function evidenceFromRow(row: EvidenceRow): Evidence {
  return {
    symbolId: row.structural_reference,
    file: row.file,
    range: {
      start: { line: row.start_line, column: row.start_column },
      end: { line: row.end_line, column: row.end_column },
    },
    contentHash: row.content_hash,
  };
}

function evidenceMatchesSnapshot(evidence: Evidence, snapshot: RepositorySnapshot): boolean {
  return snapshot.files.some((file) => (
    file.path === evidence.file
    && file.worktree?.contentHash === evidence.contentHash
  ));
}

function allEvidenceMatches(evidence: readonly Evidence[], snapshot: RepositorySnapshot): boolean {
  return evidence.length > 0 && evidence.every((item) => evidenceMatchesSnapshot(item, snapshot));
}

function lexicalScore(terms: readonly string[], fields: readonly string[]): number {
  const weights = [10, 8, 4, 6, 5];
  const score = terms.reduce((total, term) => total + fields.reduce(
    (fieldTotal, field, index) => fieldTotal + (field.includes(term) ? weights[index]! : 0),
    0,
  ), 0);
  return score / (score + 1);
}

function businessKeyOf(node: GraphNode): string {
  return node.domain === "business" ? node.key : node.id;
}

export { CURRENT_ATLAS_SCHEMA_VERSION };
