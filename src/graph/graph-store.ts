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
  type AtlasDatabaseOptions,
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
import {
  readStructuralTargetBinding,
  type StructuralTargetBinding,
} from "../knowledge/structural-target-binding.js";

interface BusinessNodeRow {
  readonly node_id: number;
  readonly base_snapshot_id: string;
  readonly kind: BusinessGraphNode["kind"];
  readonly label: string;
  readonly summary: string;
  readonly certainty: AssertionCertainty;
  readonly validity: KnowledgeValidity;
}

interface StoredEvidence extends Evidence {
  readonly qualifiedSymbol?: string;
  readonly structuralKind?: Exclude<import("./types.js").StructuralNodeKind, "UnknownBoundary">;
  readonly atlasSnapshotId?: string;
  readonly backendVersion?: string;
  readonly backendLocator?: string;
}

interface EvidenceRow {
  readonly structural_reference: string;
  readonly file: string;
  readonly start_line: number;
  readonly start_column: number;
  readonly end_line: number;
  readonly end_column: number;
  readonly content_hash: string;
  readonly qualified_symbol: string | null;
  readonly structural_kind: StoredEvidence["structuralKind"] | null;
  readonly atlas_snapshot_id: string | null;
  readonly backend_version: string | null;
  readonly backend_locator: string | null;
  readonly binding_status: "bound" | "missing" | "ambiguous" | "unresolved";
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
  readonly #gitDirectory: string;

  constructor(repository: GitRepository, options: AtlasDatabaseOptions = {}) {
    this.#atlasDatabase = new AtlasDatabase(repository, options);
    this.databasePath = this.#atlasDatabase.databasePath;
    this.#repositoryId = repository.repositoryId;
    this.#gitDirectory = repository.gitDirectory;
  }

  get schemaVersion(): number {
    return this.#atlasDatabase.schemaVersion;
  }

  reconcileSnapshot(snapshotId: string): void {
    contentIdentifierSchema.parse(snapshotId);
    this.transaction(() => {
      const snapshot = this.requireSnapshot(snapshotId);
      this.reconcileEvidenceBindings(snapshot);
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
      this.validateBusinessHierarchy(mutation.upsertRelations);
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
    const snapshotId = this.currentSnapshotId();
    if (owner.type === "node") {
      const nodeId = this.findBusinessNodeId(owner.node.key);
      return nodeId === undefined ? [] : this.readNodeEvidence(nodeId, snapshotId);
    }

    const relation = this.findBusinessRelation(owner.relation);
    return relation === undefined ? [] : this.readRelationEvidence(relation.relation_id, snapshotId);
  }

  listBusinessRelations(snapshotId: string): readonly BusinessGraphRelation[] {
    contentIdentifierSchema.parse(snapshotId);
    return this.readBusinessRelations(snapshotId).map((row) => this.relationFromRow(row, snapshotId));
  }

  listBusinessNodes(snapshotId: string): readonly BusinessGraphNode[] {
    contentIdentifierSchema.parse(snapshotId);
    const rows = this.database.prepare(`
      SELECT node_key
      FROM atlas_business_nodes
      WHERE repository_id = ?
      ORDER BY node_key ASC
    `).all(this.#repositoryId) as unknown as { readonly node_key: string }[];
    return rows.map(({ node_key }) => this.readBusinessNode(node_key, snapshotId))
      .filter((node): node is BusinessGraphNode => node !== undefined);
  }

  listBusinessRoots(snapshotId: string): readonly BusinessGraphNode[] {
    contentIdentifierSchema.parse(snapshotId);
    const rows = this.database.prepare(`
      SELECT node.node_key
      FROM atlas_business_nodes AS node
      WHERE node.repository_id = ?
        AND NOT EXISTS (
          SELECT 1
          FROM atlas_business_relations AS parent
          WHERE parent.repository_id = node.repository_id
            AND parent.from_key = node.node_key
            AND parent.relation_type = 'part_of'
            AND parent.to_domain = 'business'
        )
      ORDER BY node.node_key ASC
    `).all(this.#repositoryId) as unknown as { node_key: string }[];
    return rows.map(({ node_key }) => this.readBusinessNode(node_key, snapshotId))
      .filter((node): node is BusinessGraphNode => node !== undefined);
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
      node.evidence.forEach((evidence) => evidenceSchema.parse(publicEvidence(evidence)));
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
      relation.evidence.forEach((evidence) => evidenceSchema.parse(publicEvidence(evidence)));
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

  private validateBusinessHierarchy(
    upsertRelations: readonly BusinessRelationInput[],
  ): void {
    const storedParents = this.database.prepare(`
      SELECT from_key, to_key
      FROM atlas_business_relations
      WHERE repository_id = ?
        AND relation_type = 'part_of'
        AND to_domain = 'business'
      ORDER BY from_key, to_key
    `).all(this.#repositoryId) as unknown as {
      readonly from_key: string;
      readonly to_key: string;
    }[];
    const parents = new Map<string, string>();

    const registerParent = (child: string, parent: string): void => {
      const existingParent = parents.get(child);
      if (existingParent !== undefined && existingParent !== parent) {
        throw new Error(`Business node ${child} may have only one outgoing part_of parent`);
      }
      parents.set(child, parent);
    };

    storedParents.forEach(({ from_key, to_key }) => registerParent(from_key, to_key));
    upsertRelations.forEach((relation) => {
      if (relation.type === "part_of" && relation.to.domain === "business") {
        registerParent(relation.from.key, relation.to.key);
      }
    });

    for (const child of parents.keys()) {
      const path = new Set<string>();
      let current: string | undefined = child;
      while (current !== undefined) {
        if (path.has(current)) {
          throw new Error(`Business part_of hierarchy contains a cycle involving ${current}`);
        }
        path.add(current);
        current = parents.get(current);
      }
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
      this.insertNodeEvidence(nodeId, position, evidence as StoredEvidence, baseSnapshotId);
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
    const target = relation.to.domain === "structural"
      ? readStructuralTargetBinding(relation) ?? inferredStructuralTarget(relation, baseSnapshotId)
      : undefined;
    const relationId = this.storeBusinessRelation(baseSnapshotId, relation, targetKey, target);
    this.database.prepare(`
      DELETE FROM atlas_business_relation_evidence
      WHERE relation_id = ?
    `).run(relationId);
    relation.evidence.forEach((evidence, position) => {
      this.insertRelationEvidence(
        relationId,
        position,
        evidence as StoredEvidence,
        baseSnapshotId,
      );
    });
    if (relation.to.domain === "structural") {
      this.insertStructuralTargetBinding(relationId, baseSnapshotId, target);
    }
  }

  private storeBusinessRelation(
    baseSnapshotId: string,
    relation: BusinessRelationInput,
    targetKey: string,
    target: StructuralTargetBinding | undefined,
  ): number {
    const existing = this.findBusinessRelation(relation);
    if (existing === undefined) {
      const result = this.database.prepare(`
        INSERT INTO atlas_business_relations (
          repository_id,
          base_snapshot_id,
          from_key,
          relation_type,
          to_domain,
          to_key,
          certainty,
          target_file,
          target_qualified_symbol,
          target_structural_kind,
          target_start_line,
          target_start_column,
          target_end_line,
          target_end_column,
          target_backend_locator
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        this.#repositoryId,
        baseSnapshotId,
        relation.from.key,
        relation.type,
        relation.to.domain,
        targetKey,
        relation.certainty,
        target?.file ?? null,
        target?.qualifiedSymbol ?? null,
        target?.structuralKind ?? null,
        target?.range.start.line ?? null,
        target?.range.start.column ?? null,
        target?.range.end.line ?? null,
        target?.range.end.column ?? null,
        target?.backendLocator ?? null,
      );
      return Number(result.lastInsertRowid);
    }

    this.database.prepare(`
      UPDATE atlas_business_relations
      SET
        base_snapshot_id = ?,
        to_key = ?,
        certainty = ?,
        target_file = ?,
        target_qualified_symbol = ?,
        target_structural_kind = ?,
        target_start_line = ?,
        target_start_column = ?,
        target_end_line = ?,
        target_end_column = ?,
        target_backend_locator = ?
      WHERE relation_id = ?
    `).run(
      baseSnapshotId,
      targetKey,
      relation.certainty,
      target?.file ?? null,
      target?.qualifiedSymbol ?? null,
      target?.structuralKind ?? null,
      target?.range.start.line ?? null,
      target?.range.start.column ?? null,
      target?.range.end.line ?? null,
      target?.range.end.column ?? null,
      target?.backendLocator ?? null,
      existing.relation_id,
    );
    return existing.relation_id;
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

  private insertNodeEvidence(
    nodeId: number,
    position: number,
    evidence: StoredEvidence,
    snapshotId: string,
  ): void {
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
        content_hash,
        qualified_symbol,
        structural_kind,
        backend_locator
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      evidence.qualifiedSymbol ?? null,
      evidence.structuralKind ?? null,
      evidence.backendLocator ?? null,
    );
    this.insertEvidenceBinding(
      "atlas_business_node_evidence_bindings",
      "node_id",
      nodeId,
      position,
      snapshotId,
      evidence,
    );
  }

  private insertRelationEvidence(
    relationId: number,
    position: number,
    evidence: StoredEvidence,
    snapshotId: string,
  ): void {
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
        content_hash,
        qualified_symbol,
        structural_kind,
        backend_locator
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      evidence.qualifiedSymbol ?? null,
      evidence.structuralKind ?? null,
      evidence.backendLocator ?? null,
    );
    this.insertEvidenceBinding(
      "atlas_business_relation_evidence_bindings",
      "relation_id",
      relationId,
      position,
      snapshotId,
      evidence,
    );
  }

  private insertEvidenceBinding(
    table: "atlas_business_node_evidence_bindings" | "atlas_business_relation_evidence_bindings",
    ownerColumn: "node_id" | "relation_id",
    ownerId: number,
    position: number,
    snapshotId: string,
    evidence: StoredEvidence,
  ): void {
    this.database.prepare(`
      INSERT INTO ${table} (
        ${ownerColumn},
        position,
        repository_id,
        snapshot_id,
        resolved_structural_reference,
        resolved_qualified_symbol,
        resolved_structural_kind,
        backend_version,
        backend_locator,
        binding_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'bound')
    `).run(
      ownerId,
      position,
      this.#repositoryId,
      snapshotId,
      evidence.symbolId,
      evidence.qualifiedSymbol ?? null,
      evidence.structuralKind ?? null,
      evidence.backendVersion ?? null,
      evidence.backendLocator ?? null,
    );
  }

  private insertStructuralTargetBinding(
    relationId: number,
    snapshotId: string,
    target: StructuralTargetBinding | undefined,
  ): void {
    this.database.prepare(`
      INSERT INTO atlas_structural_relation_target_bindings (
        relation_id,
        repository_id,
        snapshot_id,
        resolved_structural_reference,
        resolved_file,
        resolved_qualified_symbol,
        resolved_structural_kind,
        resolved_start_line,
        resolved_start_column,
        resolved_end_line,
        resolved_end_column,
        backend_version,
        backend_locator,
        binding_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (relation_id, snapshot_id) DO UPDATE SET
        resolved_structural_reference = excluded.resolved_structural_reference,
        resolved_file = excluded.resolved_file,
        resolved_qualified_symbol = excluded.resolved_qualified_symbol,
        resolved_structural_kind = excluded.resolved_structural_kind,
        resolved_start_line = excluded.resolved_start_line,
        resolved_start_column = excluded.resolved_start_column,
        resolved_end_line = excluded.resolved_end_line,
        resolved_end_column = excluded.resolved_end_column,
        backend_version = excluded.backend_version,
        backend_locator = excluded.backend_locator,
        binding_status = excluded.binding_status
    `).run(
      relationId,
      this.#repositoryId,
      snapshotId,
      target?.structuralReference ?? null,
      target?.file ?? null,
      target?.qualifiedSymbol ?? null,
      target?.structuralKind ?? null,
      target?.range.start.line ?? null,
      target?.range.start.column ?? null,
      target?.range.end.line ?? null,
      target?.range.end.column ?? null,
      target?.backendVersion ?? null,
      target?.backendLocator ?? null,
      target === undefined ? "unresolved" : "bound",
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

  private currentSnapshotId(): string {
    const row = this.database.prepare(`
      SELECT current_snapshot_id
      FROM atlas_worktree_states
      WHERE repository_id = ? AND git_directory = ?
    `).get(this.#repositoryId, this.#gitDirectory) as { current_snapshot_id: string | null };
    if (row.current_snapshot_id === null) {
      throw new Error("The current worktree has no published Atlas snapshot");
    }
    return row.current_snapshot_id;
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

  private reconcileEvidenceBindings(snapshot: RepositorySnapshot): void {
    this.reconcileEvidenceBindingTable(
      "atlas_business_node_evidence",
      "atlas_business_node_evidence_bindings",
      "node_id",
      snapshot,
    );
    this.reconcileEvidenceBindingTable(
      "atlas_business_relation_evidence",
      "atlas_business_relation_evidence_bindings",
      "relation_id",
      snapshot,
    );
  }

  private reconcileEvidenceBindingTable(
    evidenceTable: "atlas_business_node_evidence" | "atlas_business_relation_evidence",
    bindingTable: "atlas_business_node_evidence_bindings" | "atlas_business_relation_evidence_bindings",
    ownerColumn: "node_id" | "relation_id",
    snapshot: RepositorySnapshot,
  ): void {
    const contentHashes = new Map(snapshot.files.flatMap((file) => (
      file.worktree === null ? [] : [[file.path, file.worktree.contentHash] as const]
    )));
    const evidenceRows = this.database.prepare(`
      SELECT ${ownerColumn} AS owner_id, position, file, content_hash
      FROM ${evidenceTable}
      ORDER BY ${ownerColumn}, position
    `).all() as unknown as {
      owner_id: number;
      position: number;
      file: string;
      content_hash: string;
    }[];
    for (const evidence of evidenceRows) {
      if (contentHashes.get(evidence.file) !== evidence.content_hash) {
        continue;
      }
      this.database.prepare(`
        INSERT INTO ${bindingTable} (
          ${ownerColumn},
          position,
          repository_id,
          snapshot_id,
          resolved_structural_reference,
          resolved_qualified_symbol,
          resolved_structural_kind,
          backend_version,
          backend_locator,
          binding_status
        )
        SELECT
          ${ownerColumn},
          position,
          repository_id,
          ?,
          resolved_structural_reference,
          resolved_qualified_symbol,
          resolved_structural_kind,
          backend_version,
          backend_locator,
          'bound'
        FROM ${bindingTable}
        WHERE ${ownerColumn} = ?
          AND position = ?
          AND binding_status = 'bound'
        ORDER BY rowid DESC
        LIMIT 1
        ON CONFLICT (${ownerColumn}, position, snapshot_id) DO NOTHING
      `).run(snapshot.snapshotId, evidence.owner_id, evidence.position);
    }
  }

  private refreshBusinessValidity(snapshot: RepositorySnapshot): void {
    const nodeRows = this.database.prepare(`
      SELECT node_id
      FROM atlas_business_nodes
      WHERE repository_id = ?
    `).all(this.#repositoryId) as unknown as { node_id: number }[];
    for (const { node_id } of nodeRows) {
      const validity = allEvidenceMatches(
        this.readNodeEvidenceRows(node_id, snapshot.snapshotId),
        snapshot,
      )
        ? "valid"
        : "stale";
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
      SELECT
        relation.relation_id,
        relation.to_domain,
        target.binding_status AS target_binding_status
      FROM atlas_business_relations AS relation
      LEFT JOIN atlas_structural_relation_target_bindings AS target
        ON target.relation_id = relation.relation_id
        AND target.snapshot_id = ?
      WHERE relation.repository_id = ?
    `).all(snapshot.snapshotId, this.#repositoryId) as unknown as {
      relation_id: number;
      to_domain: "structural" | "business";
      target_binding_status: EvidenceRow["binding_status"] | null;
    }[];
    for (const relation of relationRows) {
      const targetIsBound = relation.to_domain === "business"
        || relation.target_binding_status === "bound";
      const validity = targetIsBound
        && allEvidenceMatches(
          this.readRelationEvidenceRows(relation.relation_id, snapshot.snapshotId),
          snapshot,
        )
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
      `).run(relation.relation_id, this.#repositoryId, snapshot.snapshotId, validity);
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
      evidence: this.readNodeEvidence(row.node_id, snapshotId),
      baseSnapshotId: row.base_snapshot_id,
    };
  }

  private readNodeEvidence(nodeId: number, snapshotId: string): readonly Evidence[] {
    return this.readNodeEvidenceRows(nodeId, snapshotId).map(evidenceFromRow);
  }

  private readNodeEvidenceRows(nodeId: number, snapshotId: string): readonly EvidenceRow[] {
    return this.database.prepare(`
      SELECT
        COALESCE(binding.resolved_structural_reference, evidence.structural_reference)
          AS structural_reference,
        evidence.file,
        evidence.start_line,
        evidence.start_column,
        evidence.end_line,
        evidence.end_column,
        evidence.content_hash,
        COALESCE(binding.resolved_qualified_symbol, evidence.qualified_symbol) AS qualified_symbol,
        COALESCE(binding.resolved_structural_kind, evidence.structural_kind) AS structural_kind,
        binding.snapshot_id AS atlas_snapshot_id,
        binding.backend_version,
        COALESCE(binding.backend_locator, evidence.backend_locator) AS backend_locator,
        COALESCE(binding.binding_status, 'unresolved') AS binding_status
      FROM atlas_business_node_evidence AS evidence
      LEFT JOIN atlas_business_node_evidence_bindings AS binding
        ON binding.node_id = evidence.node_id
        AND binding.position = evidence.position
        AND binding.snapshot_id = ?
      WHERE evidence.node_id = ?
      ORDER BY evidence.position ASC
    `).all(snapshotId, nodeId) as unknown as EvidenceRow[];
  }

  private readRelationEvidence(relationId: number, snapshotId: string): readonly Evidence[] {
    return this.readRelationEvidenceRows(relationId, snapshotId).map(evidenceFromRow);
  }

  private readRelationEvidenceRows(relationId: number, snapshotId: string): readonly EvidenceRow[] {
    return this.database.prepare(`
      SELECT
        COALESCE(binding.resolved_structural_reference, evidence.structural_reference)
          AS structural_reference,
        evidence.file,
        evidence.start_line,
        evidence.start_column,
        evidence.end_line,
        evidence.end_column,
        evidence.content_hash,
        COALESCE(binding.resolved_qualified_symbol, evidence.qualified_symbol) AS qualified_symbol,
        COALESCE(binding.resolved_structural_kind, evidence.structural_kind) AS structural_kind,
        binding.snapshot_id AS atlas_snapshot_id,
        binding.backend_version,
        COALESCE(binding.backend_locator, evidence.backend_locator) AS backend_locator,
        COALESCE(binding.binding_status, 'unresolved') AS binding_status
      FROM atlas_business_relation_evidence AS evidence
      LEFT JOIN atlas_business_relation_evidence_bindings AS binding
        ON binding.relation_id = evidence.relation_id
        AND binding.position = evidence.position
        AND binding.snapshot_id = ?
      WHERE evidence.relation_id = ?
      ORDER BY evidence.position ASC
    `).all(snapshotId, relationId) as unknown as EvidenceRow[];
  }

  private readBusinessRelations(snapshotId: string): readonly BusinessRelationRow[] {
    return this.database.prepare(`
      SELECT
        relation.relation_id,
        relation.base_snapshot_id,
        relation.from_key,
        relation.relation_type,
        relation.to_domain,
        CASE
          WHEN relation.to_domain = 'structural'
            THEN COALESCE(target.resolved_structural_reference, relation.to_key)
          ELSE relation.to_key
        END AS to_key,
        relation.certainty,
        COALESCE(validity.validity, 'stale') AS validity
      FROM atlas_business_relations AS relation
      LEFT JOIN atlas_business_relation_validity AS validity
        ON validity.relation_id = relation.relation_id
        AND validity.snapshot_id = ?
      LEFT JOIN atlas_structural_relation_target_bindings AS target
        ON target.relation_id = relation.relation_id
        AND target.snapshot_id = ?
      WHERE relation.repository_id = ?
      ORDER BY relation.from_key, relation.relation_type, relation.to_domain, relation.to_key
    `).all(snapshotId, snapshotId, this.#repositoryId) as unknown as BusinessRelationRow[];
  }

  private relationFromRow(row: BusinessRelationRow, snapshotId: string): BusinessGraphRelation {
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
      evidence: this.readRelationEvidence(row.relation_id, snapshotId),
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
          relation: this.relationFromRow(row, snapshotId),
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
        AND (
          to_key = ?
          OR (
            to_domain = 'structural'
            AND EXISTS (
              SELECT 1
              FROM atlas_structural_relation_target_bindings AS binding
              WHERE binding.relation_id = atlas_business_relations.relation_id
                AND binding.resolved_structural_reference = ?
            )
          )
        )
    `).get(
      this.#repositoryId,
      selector.from.key,
      selector.type,
      selector.to.domain,
      targetKey,
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

function publicEvidence(evidence: Evidence): Evidence {
  return {
    symbolId: evidence.symbolId,
    file: evidence.file,
    range: evidence.range,
    contentHash: evidence.contentHash,
  };
}

function evidenceMatchesSnapshot(evidence: Evidence, snapshot: RepositorySnapshot): boolean {
  return snapshot.files.some((file) => (
    file.path === evidence.file
    && file.worktree?.contentHash === evidence.contentHash
  ));
}

function allEvidenceMatches(rows: readonly EvidenceRow[], snapshot: RepositorySnapshot): boolean {
  return rows.length > 0 && rows.every((row) => (
    row.binding_status === "bound"
    && evidenceMatchesSnapshot(evidenceFromRow(row), snapshot)
  ));
}

function inferredStructuralTarget(
  relation: BusinessRelationInput,
  snapshotId: string,
): StructuralTargetBinding | undefined {
  if (relation.to.domain !== "structural") {
    return undefined;
  }
  const targetReference = relation.to.id;
  const matchingEvidence = relation.evidence.find((item) => item.symbolId === targetReference);
  if (matchingEvidence === undefined) {
    return undefined;
  }
  const storedEvidence = matchingEvidence as StoredEvidence;
  return {
    structuralReference: targetReference,
    file: matchingEvidence.file,
    qualifiedSymbol: storedEvidence.qualifiedSymbol ?? null,
    structuralKind: storedEvidence.structuralKind ?? null,
    range: matchingEvidence.range,
    atlasSnapshotId: storedEvidence.atlasSnapshotId ?? snapshotId,
    backendVersion: storedEvidence.backendVersion ?? null,
    backendLocator: storedEvidence.backendLocator ?? null,
  };
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
