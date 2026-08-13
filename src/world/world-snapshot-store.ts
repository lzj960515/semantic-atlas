import type { DatabaseSync } from "node:sqlite";

import type { GitRepository } from "../repository/types.js";
import type { RepositorySnapshot } from "../snapshots/types.js";
import { AtlasDatabase } from "../storage/atlas-database.js";
import type {
  EvidenceLocator,
  SemanticGraphChanges,
  SemanticChangeMetadata,
  StructuralEvidenceResolver,
  StructuralTargetLocator,
  WorldSnapshotState,
} from "./types.js";

type EvidenceBindingStatus = "bound" | "missing" | "ambiguous" | "unresolved";

interface EvidenceRow {
  readonly owner_id: number;
  readonly position: number;
  readonly structural_reference: string;
  readonly file: string;
  readonly qualified_symbol: string | null;
  readonly structural_kind: string | null;
  readonly start_line: number;
  readonly start_column: number;
  readonly end_line: number;
  readonly end_column: number;
  readonly content_hash: string;
  readonly backend_locator: string | null;
}

interface ReconciliationResult {
  readonly staleAssertions: readonly string[];
}

interface StructuralTargetRow {
  readonly relation_id: number;
  readonly from_key: string;
  readonly relation_type: string;
  readonly to_key: string;
  readonly target_file: string | null;
  readonly target_qualified_symbol: string | null;
  readonly target_structural_kind: string | null;
  readonly target_start_line: number | null;
  readonly target_start_column: number | null;
  readonly target_end_line: number | null;
  readonly target_end_column: number | null;
  readonly target_backend_locator: string | null;
}

export class WorldSnapshotStore implements Disposable {
  readonly #database: AtlasDatabase;
  readonly #repositoryId: string;

  constructor(repository: GitRepository) {
    this.#database = new AtlasDatabase(repository);
    this.#repositoryId = repository.repositoryId;
  }

  readState(): WorldSnapshotState {
    const row = this.connection.prepare(`
      SELECT
        status,
        current_snapshot_id,
        target_snapshot_id,
        backend_version,
        extraction_version,
        failure_message,
        started_at,
        published_at,
        updated_at
      FROM atlas_world_state
      WHERE repository_id = ?
    `).get(this.#repositoryId) as {
      status: WorldSnapshotState["status"];
      current_snapshot_id: string | null;
      target_snapshot_id: string | null;
      backend_version: string | null;
      extraction_version: number | null;
      failure_message: string | null;
      started_at: string | null;
      published_at: string | null;
      updated_at: string;
    };
    return {
      status: row.status,
      currentSnapshotId: row.current_snapshot_id,
      targetSnapshotId: row.target_snapshot_id,
      backendVersion: row.backend_version,
      extractionVersion: row.extraction_version,
      failureMessage: row.failure_message,
      startedAt: row.started_at,
      publishedAt: row.published_at,
      updatedAt: row.updated_at,
    };
  }

  begin(targetSnapshotId: string): void {
    const timestamp = new Date().toISOString();
    const state = this.readState();
    if (state.status === "building" && state.targetSnapshotId === targetSnapshotId) {
      return;
    }
    this.connection.prepare(`
      UPDATE atlas_world_state
      SET
        status = 'building',
        target_snapshot_id = ?,
        failure_message = NULL,
        started_at = ?,
        published_at = NULL,
        updated_at = ?
      WHERE repository_id = ?
    `).run(targetSnapshotId, timestamp, timestamp, this.#repositoryId);
  }

  publish(
    snapshot: RepositorySnapshot,
    backendVersion: string,
    extractionVersion: number | null,
    resolver: StructuralEvidenceResolver,
    changes: Omit<SemanticChangeMetadata, "staleAssertions">,
  ): ReconciliationResult {
    let result: ReconciliationResult | undefined;
    this.transaction(() => {
      this.requireBuildingSnapshot(snapshot.snapshotId);
      this.saveSnapshot(snapshot);
      const staleAssertions = this.rebindEvidence(
        snapshot,
        backendVersion,
        resolver,
      );
      staleAssertions.push(...this.rebindStructuralRelationTargets(
        snapshot,
        backendVersion,
        resolver,
      ));
      const uniqueStaleAssertions = [...new Set(staleAssertions)].sort();
      this.refreshValidity(snapshot.snapshotId);
      this.saveSemanticChanges({ ...changes, staleAssertions: uniqueStaleAssertions });
      const timestamp = new Date().toISOString();
      this.connection.prepare(`
        UPDATE atlas_world_state
        SET
          status = 'current',
          current_snapshot_id = ?,
          target_snapshot_id = NULL,
          backend_version = ?,
          extraction_version = ?,
          failure_message = NULL,
          published_at = ?,
          updated_at = ?
        WHERE repository_id = ?
      `).run(
        snapshot.snapshotId,
        backendVersion,
        extractionVersion,
        timestamp,
        timestamp,
        this.#repositoryId,
      );
      result = { staleAssertions: uniqueStaleAssertions };
    });
    return result!;
  }

  fail(targetSnapshotId: string, error: unknown): void {
    const timestamp = new Date().toISOString();
    this.connection.prepare(`
      UPDATE atlas_world_state
      SET
        status = 'failed',
        target_snapshot_id = ?,
        failure_message = ?,
        published_at = NULL,
        updated_at = ?
      WHERE repository_id = ?
    `).run(
      targetSnapshotId,
      error instanceof Error ? error.message : String(error),
      timestamp,
      this.#repositoryId,
    );
  }

  requireCurrentSnapshot(): RepositorySnapshot {
    const state = this.readState();
    if (state.status !== "current" || state.currentSnapshotId === null) {
      throw new Error(`World snapshot is ${state.status} and cannot serve map queries`);
    }
    const row = this.connection.prepare(`
      SELECT payload
      FROM atlas_repository_snapshots
      WHERE repository_id = ? AND snapshot_id = ?
    `).get(this.#repositoryId, state.currentSnapshotId) as { payload: string } | undefined;
    if (row === undefined) {
      throw new Error("The current world snapshot record is missing");
    }
    return JSON.parse(row.payload) as RepositorySnapshot;
  }

  readSemanticChanges(toSnapshotId?: string): SemanticGraphChanges | undefined {
    const target = toSnapshotId ?? this.readState().currentSnapshotId;
    if (target === null) {
      return undefined;
    }
    const row = this.connection.prepare(`
      SELECT
        from_snapshot_id,
        to_snapshot_id,
        added_paths,
        modified_paths,
        removed_paths,
        stale_assertions
      FROM atlas_semantic_changes
      WHERE repository_id = ? AND to_snapshot_id = ?
    `).get(this.#repositoryId, target) as {
      from_snapshot_id: string | null;
      to_snapshot_id: string;
      added_paths: string;
      modified_paths: string;
      removed_paths: string;
      stale_assertions: string;
    } | undefined;
    if (row === undefined || row.from_snapshot_id === null) {
      return undefined;
    }
    const fileReferences = (paths: string): string[] => (
      (JSON.parse(paths) as string[]).map((path) => `file:${path}`)
    );
    return {
      fromSnapshotId: row.from_snapshot_id,
      toSnapshotId: row.to_snapshot_id,
      nodes: {
        added: fileReferences(row.added_paths),
        changed: fileReferences(row.modified_paths),
        removed: fileReferences(row.removed_paths),
      },
      relations: { added: [], changed: [], removed: [] },
      staleAssertions: JSON.parse(row.stale_assertions) as string[],
    };
  }

  close(): void {
    this.#database.close();
  }

  [Symbol.dispose](): void {
    this.close();
  }

  private get connection(): DatabaseSync {
    return this.#database.connection;
  }

  private transaction(operation: () => void): void {
    this.connection.exec("BEGIN IMMEDIATE");
    try {
      operation();
      this.connection.exec("COMMIT");
    } catch (error) {
      this.connection.exec("ROLLBACK");
      throw error;
    }
  }

  private requireBuildingSnapshot(snapshotId: string): void {
    const state = this.readState();
    if (state.status !== "building" || state.targetSnapshotId !== snapshotId) {
      throw new Error(`World snapshot ${snapshotId} is not the active build target`);
    }
  }

  private saveSnapshot(snapshot: RepositorySnapshot): void {
    const timestamp = new Date().toISOString();
    this.connection.prepare(`
      INSERT INTO atlas_repository_snapshots (
        repository_id,
        snapshot_id,
        payload,
        created_at
      ) VALUES (?, ?, ?, ?)
      ON CONFLICT (repository_id, snapshot_id) DO UPDATE SET
        payload = excluded.payload
    `).run(this.#repositoryId, snapshot.snapshotId, JSON.stringify(snapshot), timestamp);
    this.connection.prepare(`
      UPDATE atlas_repositories
      SET latest_snapshot_id = ?, updated_at = ?
      WHERE repository_id = ?
    `).run(snapshot.snapshotId, timestamp, this.#repositoryId);
  }

  private rebindEvidence(
    snapshot: RepositorySnapshot,
    backendVersion: string,
    resolver: StructuralEvidenceResolver,
  ): string[] {
    const staleAssertions: string[] = [];
    const bindings = [
      ...this.rebindEvidenceTable(
        "atlas_business_node_evidence",
        "node_id",
        snapshot,
        backendVersion,
        resolver,
      ),
      ...this.rebindEvidenceTable(
        "atlas_business_relation_evidence",
        "relation_id",
        snapshot,
        backendVersion,
        resolver,
      ),
    ];
    for (const binding of bindings) {
      if (binding.status !== "bound") {
        staleAssertions.push(this.assertionIdentity(binding.ownerType, binding.ownerId));
      }
    }
    return [...new Set(staleAssertions)].sort();
  }

  private assertionIdentity(ownerType: "node" | "relation", ownerId: number): string {
    if (ownerType === "node") {
      const row = this.connection.prepare(`
        SELECT node_key
        FROM atlas_business_nodes
        WHERE node_id = ?
      `).get(ownerId) as { node_key: string };
      return row.node_key;
    }
    const row = this.connection.prepare(`
      SELECT from_key, relation_type, to_domain, to_key
      FROM atlas_business_relations
      WHERE relation_id = ?
    `).get(ownerId) as {
      from_key: string;
      relation_type: string;
      to_domain: string;
      to_key: string;
    };
    return `${row.from_key}:${row.relation_type}:${row.to_domain}:${row.to_key}`;
  }

  private rebindEvidenceTable(
    table: "atlas_business_node_evidence" | "atlas_business_relation_evidence",
    ownerColumn: "node_id" | "relation_id",
    snapshot: RepositorySnapshot,
    backendVersion: string,
    resolver: StructuralEvidenceResolver,
  ): readonly {
    ownerType: "node" | "relation";
    ownerId: number;
    status: EvidenceBindingStatus;
  }[] {
    const rows = this.connection.prepare(`
      SELECT
        ${ownerColumn} AS owner_id,
        position,
        structural_reference,
        file,
        qualified_symbol,
        structural_kind,
        start_line,
        start_column,
        end_line,
        end_column,
        content_hash,
        backend_locator
      FROM ${table}
      ORDER BY ${ownerColumn}, position
    `).all() as unknown as EvidenceRow[];
    const ownerType = ownerColumn === "node_id" ? "node" : "relation";

    return rows.map((row) => {
      const locator = locatorFromRow(row);
      const match = this.resolveEvidence(locator, resolver);
      const source = snapshot.files.find((file) => file.path === row.file)?.worktree;
      const hashMatches = source !== null && source !== undefined && source.contentHash === row.content_hash;
      const status: EvidenceBindingStatus = match.status === "bound" && hashMatches
        ? "bound"
        : match.status === "bound"
          ? "missing"
          : match.status;
      this.connection.prepare(`
        UPDATE ${table}
        SET
          structural_reference = ?,
          qualified_symbol = ?,
          structural_kind = ?,
          atlas_snapshot_id = ?,
          backend_version = ?,
          backend_locator = ?,
          binding_status = ?
        WHERE ${ownerColumn} = ? AND position = ?
      `).run(
        match.node?.reference.id ?? row.structural_reference,
        match.node?.qualifiedName ?? row.qualified_symbol,
        match.node?.kind ?? row.structural_kind,
        snapshot.snapshotId,
        backendVersion,
        match.node === undefined
          ? row.backend_locator
          : resolver.backendLocator(match.node) ?? null,
        status,
        row.owner_id,
        row.position,
      );
      return { ownerType, ownerId: row.owner_id, status };
    });
  }

  private rebindStructuralRelationTargets(
    snapshot: RepositorySnapshot,
    backendVersion: string,
    resolver: StructuralEvidenceResolver,
  ): readonly string[] {
    const rows = this.connection.prepare(`
      SELECT
        relation_id,
        from_key,
        relation_type,
        to_key,
        target_file,
        target_qualified_symbol,
        target_structural_kind,
        target_start_line,
        target_start_column,
        target_end_line,
        target_end_column,
        target_backend_locator
      FROM atlas_business_relations
      WHERE repository_id = ? AND to_domain = 'structural'
      ORDER BY relation_id
    `).all(this.#repositoryId) as unknown as StructuralTargetRow[];
    const staleAssertions: string[] = [];

    for (const row of rows) {
      const locator = structuralTargetLocatorFromRow(row);
      const match = locator === undefined
        ? { status: "unresolved" as const }
        : this.resolveStructuralLocator(locator, resolver);
      const identity = `${row.from_key}:${row.relation_type}:structural:${row.to_key}`;
      if (match.status !== "bound") {
        staleAssertions.push(identity);
      }
      this.connection.prepare(`
        UPDATE atlas_business_relations
        SET
          to_key = ?,
          target_file = ?,
          target_qualified_symbol = ?,
          target_structural_kind = ?,
          target_start_line = ?,
          target_start_column = ?,
          target_end_line = ?,
          target_end_column = ?,
          target_atlas_snapshot_id = ?,
          target_backend_version = ?,
          target_backend_locator = ?,
          target_binding_status = ?
        WHERE relation_id = ?
      `).run(
        match.node?.reference.id ?? row.to_key,
        match.node?.path ?? row.target_file,
        match.node?.qualifiedName ?? row.target_qualified_symbol,
        match.node?.kind ?? row.target_structural_kind,
        match.node?.range.start.line ?? row.target_start_line,
        match.node?.range.start.column ?? row.target_start_column,
        match.node?.range.end.line ?? row.target_end_line,
        match.node?.range.end.column ?? row.target_end_column,
        snapshot.snapshotId,
        backendVersion,
        match.node === undefined
          ? row.target_backend_locator
          : resolver.backendLocator(match.node) ?? null,
        match.status,
        row.relation_id,
      );
    }
    return staleAssertions;
  }

  private resolveEvidence(
    locator: EvidenceLocator,
    resolver: StructuralEvidenceResolver,
  ): { status: EvidenceBindingStatus; node?: ReturnType<StructuralEvidenceResolver["getNode"]> } {
    return this.resolveStructuralLocator(locator, resolver);
  }

  private resolveStructuralLocator(
    locator: StructuralTargetLocator,
    resolver: StructuralEvidenceResolver,
  ): { status: EvidenceBindingStatus; node?: ReturnType<StructuralEvidenceResolver["getNode"]> } {
    const directlyLocated = resolver.getNode(locator.structuralReference);
    if (directlyLocated !== undefined && nodeMatchesLocator(directlyLocated, locator)) {
      return { status: "bound", node: directlyLocated };
    }
    const candidates = resolver.findCandidates(locator).filter((node) => nodeMatchesLocator(node, locator));
    if (candidates.length === 1) {
      return { status: "bound", node: candidates[0] };
    }
    return { status: candidates.length === 0 ? "missing" : "ambiguous" };
  }

  private refreshValidity(snapshotId: string): void {
    this.refreshValidityTable(
      "atlas_business_nodes",
      "atlas_business_node_evidence",
      "atlas_business_node_validity",
      "node_id",
      snapshotId,
    );
    this.refreshValidityTable(
      "atlas_business_relations",
      "atlas_business_relation_evidence",
      "atlas_business_relation_validity",
      "relation_id",
      snapshotId,
    );
  }

  private refreshValidityTable(
    ownerTable: "atlas_business_nodes" | "atlas_business_relations",
    evidenceTable: "atlas_business_node_evidence" | "atlas_business_relation_evidence",
    validityTable: "atlas_business_node_validity" | "atlas_business_relation_validity",
    ownerColumn: "node_id" | "relation_id",
    snapshotId: string,
  ): void {
    const owners = this.connection.prepare(`
      SELECT ${ownerColumn} AS owner_id
      FROM ${ownerTable}
      WHERE repository_id = ?
    `).all(this.#repositoryId) as unknown as { owner_id: number }[];
    for (const { owner_id } of owners) {
      const row = this.connection.prepare(`
        SELECT
          COUNT(*) AS evidence_count,
          SUM(CASE WHEN binding_status = 'bound' THEN 1 ELSE 0 END) AS bound_count
        FROM ${evidenceTable}
        WHERE ${ownerColumn} = ?
      `).get(owner_id) as { evidence_count: number; bound_count: number };
      const validity = row.evidence_count > 0 && row.evidence_count === row.bound_count
        ? "valid"
        : "stale";
      const targetBindingStatus = ownerColumn === "relation_id"
        ? (this.connection.prepare(`
            SELECT to_domain, target_binding_status
            FROM atlas_business_relations
            WHERE relation_id = ?
          `).get(owner_id) as {
            to_domain: "structural" | "business";
            target_binding_status: EvidenceBindingStatus;
          })
        : undefined;
      const targetIsBound = targetBindingStatus === undefined
        || targetBindingStatus.to_domain === "business"
        || targetBindingStatus.target_binding_status === "bound";
      const derivedValidity = targetIsBound
        ? validity
        : "stale";
      this.connection.prepare(`
        INSERT INTO ${validityTable} (${ownerColumn}, repository_id, snapshot_id, validity)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (${ownerColumn}, snapshot_id) DO UPDATE SET validity = excluded.validity
      `).run(owner_id, this.#repositoryId, snapshotId, derivedValidity);
    }
  }

  private saveSemanticChanges(changes: SemanticChangeMetadata): void {
    this.connection.prepare(`
      INSERT INTO atlas_semantic_changes (
        repository_id,
        from_snapshot_id,
        to_snapshot_id,
        added_paths,
        modified_paths,
        removed_paths,
        stale_assertions,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (repository_id, to_snapshot_id) DO NOTHING
    `).run(
      this.#repositoryId,
      changes.fromSnapshotId,
      changes.toSnapshotId,
      JSON.stringify(changes.structural.added),
      JSON.stringify(changes.structural.modified),
      JSON.stringify(changes.structural.removed),
      JSON.stringify(changes.staleAssertions),
      new Date().toISOString(),
    );
  }
}

function locatorFromRow(row: EvidenceRow): EvidenceLocator {
  return {
    structuralReference: row.structural_reference,
    file: row.file,
    qualifiedSymbol: row.qualified_symbol,
    structuralKind: row.structural_kind,
    range: {
      start: { line: row.start_line, column: row.start_column },
      end: { line: row.end_line, column: row.end_column },
    },
    contentHash: row.content_hash,
    ...(row.backend_locator === null ? {} : { backendLocator: row.backend_locator }),
  };
}

function structuralTargetLocatorFromRow(
  row: StructuralTargetRow,
): StructuralTargetLocator | undefined {
  if (
    row.target_file === null
    || row.target_start_line === null
    || row.target_start_column === null
    || row.target_end_line === null
    || row.target_end_column === null
  ) {
    return undefined;
  }
  return {
    structuralReference: row.to_key,
    file: row.target_file,
    qualifiedSymbol: row.target_qualified_symbol,
    structuralKind: row.target_structural_kind,
    range: {
      start: { line: row.target_start_line, column: row.target_start_column },
      end: { line: row.target_end_line, column: row.target_end_column },
    },
    ...(row.target_backend_locator === null
      ? {}
      : { backendLocator: row.target_backend_locator }),
  };
}

function nodeMatchesLocator(
  node: NonNullable<ReturnType<StructuralEvidenceResolver["getNode"]>>,
  locator: StructuralTargetLocator,
): boolean {
  return node.path === locator.file
    && (locator.qualifiedSymbol === null || node.qualifiedName === locator.qualifiedSymbol)
    && (locator.structuralKind === null || node.kind === locator.structuralKind)
    && node.range.start.line === locator.range.start.line
    && node.range.start.column === locator.range.start.column
    && node.range.end.line === locator.range.end.line
    && node.range.end.column === locator.range.end.column;
}
