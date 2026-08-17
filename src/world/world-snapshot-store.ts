import type { DatabaseSync } from "node:sqlite";

import { contentIdentifierSchema } from "../contracts/identifiers.js";
import { isSupportedSource } from "../repository/repository-inspector.js";
import type { GitRepository } from "../repository/types.js";
import type { RepositorySnapshot } from "../snapshots/types.js";
import { AtlasDatabase } from "../storage/atlas-database.js";
import type {
  CurrentWorldSnapshot,
  EvidenceLocator,
  SemanticGraphChangeOptions,
  SemanticGraphChanges,
  StructuralEvidenceResolver,
  StructuralTargetLocator,
  WorldPublicationMetadata,
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

interface WorldPublicationRow {
  readonly publication_id: number;
  readonly previous_publication_id: number | null;
  readonly snapshot_id: string;
  readonly stale_assertions: string;
}

export class WorldSnapshotStore implements Disposable {
  readonly #database: AtlasDatabase;
  readonly #repositoryId: string;
  readonly #gitDirectory: string;

  constructor(repository: GitRepository) {
    this.#database = new AtlasDatabase(repository);
    this.#repositoryId = repository.repositoryId;
    this.#gitDirectory = repository.gitDirectory;
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
      FROM atlas_worktree_states
      WHERE repository_id = ? AND git_directory = ?
    `).get(this.#repositoryId, this.#gitDirectory) as {
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
      UPDATE atlas_worktree_states
      SET
        status = 'building',
        target_snapshot_id = ?,
        failure_message = NULL,
        started_at = ?,
        published_at = NULL,
        updated_at = ?
      WHERE repository_id = ? AND git_directory = ?
    `).run(targetSnapshotId, timestamp, timestamp, this.#repositoryId, this.#gitDirectory);
  }

  publish(
    snapshot: RepositorySnapshot,
    backendVersion: string,
    extractionVersion: number | null,
    resolver: StructuralEvidenceResolver,
    changes: Omit<WorldPublicationMetadata, "staleAssertions">,
  ): ReconciliationResult {
    let result: ReconciliationResult | undefined;
    this.transaction(() => {
      this.requireBuildingSnapshot(snapshot.snapshotId);
      const previousPublication = this.readCurrentPublication();
      const previousSnapshotId = previousPublication?.snapshot_id ?? null;
      if (changes.fromSnapshotId !== previousSnapshotId) {
        throw new Error(
          `World publication starts at ${changes.fromSnapshotId ?? "no snapshot"}, ` +
          `but the current publication is ${previousSnapshotId ?? "missing"}`,
        );
      }
      if (changes.toSnapshotId !== snapshot.snapshotId) {
        throw new Error(
          `World publication target ${changes.toSnapshotId} does not match ` +
          `the active snapshot ${snapshot.snapshotId}`,
        );
      }
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
      const timestamp = new Date().toISOString();
      const publicationId = this.saveWorldPublication(
        previousPublication?.publication_id ?? null,
        { ...changes, staleAssertions: uniqueStaleAssertions },
        timestamp,
      );
      this.connection.prepare(`
        UPDATE atlas_worktree_states
        SET
          status = 'current',
          current_snapshot_id = ?,
          current_publication_id = ?,
          target_snapshot_id = NULL,
          backend_version = ?,
          extraction_version = ?,
          failure_message = NULL,
          published_at = ?,
          updated_at = ?
        WHERE repository_id = ? AND git_directory = ?
      `).run(
        snapshot.snapshotId,
        publicationId,
        backendVersion,
        extractionVersion,
        timestamp,
        timestamp,
        this.#repositoryId,
        this.#gitDirectory,
      );
      result = { staleAssertions: uniqueStaleAssertions };
    });
    return result!;
  }

  fail(targetSnapshotId: string, error: unknown): void {
    const timestamp = new Date().toISOString();
    this.connection.prepare(`
      UPDATE atlas_worktree_states
      SET
        status = 'failed',
        target_snapshot_id = ?,
        failure_message = ?,
        published_at = NULL,
        updated_at = ?
      WHERE repository_id = ? AND git_directory = ?
    `).run(
      targetSnapshotId,
      error instanceof Error ? error.message : String(error),
      timestamp,
      this.#repositoryId,
      this.#gitDirectory,
    );
  }

  requireCurrentSnapshot(): RepositorySnapshot {
    return this.requireCurrentWorld().snapshot;
  }

  requireCurrentWorld(): CurrentWorldSnapshot {
    const state = this.readState();
    if (state.status !== "current" || state.currentSnapshotId === null) {
      throw new Error(`World snapshot is ${state.status} and cannot serve map queries`);
    }
    const publication = this.readCurrentPublication();
    if (publication === undefined || publication.snapshot_id !== state.currentSnapshotId) {
      throw new Error("The current world publication is inconsistent with its snapshot");
    }
    const row = this.connection.prepare(`
      SELECT payload
      FROM atlas_repository_snapshots
      WHERE repository_id = ? AND snapshot_id = ?
    `).get(this.#repositoryId, state.currentSnapshotId) as { payload: string } | undefined;
    if (row === undefined) {
      throw new Error("The current world snapshot record is missing");
    }
    return {
      publicationId: publication.publication_id,
      snapshot: JSON.parse(row.payload) as RepositorySnapshot,
    };
  }

  readSemanticChanges(options: SemanticGraphChangeOptions = {}): SemanticGraphChanges | undefined {
    const requestedStart = options.fromSnapshotId === undefined
      ? undefined
      : contentIdentifierSchema.parse(options.fromSnapshotId);
    const requestedTarget = options.toSnapshotId === undefined
      ? undefined
      : contentIdentifierSchema.parse(options.toSnapshotId);
    const currentPublication = this.readCurrentPublication();
    if (currentPublication === undefined) {
      return undefined;
    }
    const targetPublication = requestedTarget === undefined
      ? currentPublication
      : this.findPublication(currentPublication, requestedTarget);
    if (targetPublication === undefined) {
      return undefined;
    }
    const target = targetPublication.snapshot_id;
    const previousPublication = this.readPreviousPublication(targetPublication);
    const startPublication = requestedStart === undefined
      ? previousPublication
      : requestedStart === target
        ? targetPublication
        : previousPublication === undefined
          ? undefined
          : this.findPublication(previousPublication, requestedStart);
    if (startPublication === undefined) {
      if (requestedStart !== undefined) {
        throw new Error(
          `No persisted semantic transition connects ${requestedStart} to ${target}`,
        );
      }
      return undefined;
    }
    const start = startPublication.snapshot_id;
    const nodes = compareSnapshotContents(
      this.readSnapshot(start),
      this.readSnapshot(target),
    );
    return {
      fromSnapshotId: start,
      toSnapshotId: target,
      nodes,
      relations: { added: [], changed: [], removed: [] },
      staleAssertions: parseStringArray(targetPublication.stale_assertions),
    };
  }

  private readCurrentPublication(): WorldPublicationRow | undefined {
    const row = this.connection.prepare(`
      SELECT current_publication_id
      FROM atlas_worktree_states
      WHERE repository_id = ? AND git_directory = ?
    `).get(this.#repositoryId, this.#gitDirectory) as { current_publication_id: number | null };
    return row.current_publication_id === null
      ? undefined
      : this.requirePublication(row.current_publication_id);
  }

  private readPublication(publicationId: number): WorldPublicationRow | undefined {
    return this.connection.prepare(`
      SELECT
        publication_id,
        previous_publication_id,
        snapshot_id,
        stale_assertions
      FROM atlas_world_publications
      WHERE repository_id = ? AND git_directory = ? AND publication_id = ?
    `).get(this.#repositoryId, this.#gitDirectory, publicationId) as WorldPublicationRow | undefined;
  }

  private requirePublication(publicationId: number): WorldPublicationRow {
    const publication = this.readPublication(publicationId);
    if (publication === undefined) {
      throw new Error(`World publication ${publicationId} is not stored`);
    }
    return publication;
  }

  private readPreviousPublication(
    publication: WorldPublicationRow,
  ): WorldPublicationRow | undefined {
    const previousPublicationId = publication.previous_publication_id;
    if (previousPublicationId === null) {
      return undefined;
    }
    if (previousPublicationId === publication.publication_id) {
      throw new Error(
        `Persisted world publication chain contains a cycle at ${publication.publication_id}`,
      );
    }
    return this.requirePublication(previousPublicationId);
  }

  private findPublication(
    target: WorldPublicationRow,
    snapshotId: string,
  ): WorldPublicationRow | undefined {
    const visitedPublications = new Set<number>();
    let publication: WorldPublicationRow | undefined = target;
    while (publication !== undefined) {
      if (visitedPublications.has(publication.publication_id)) {
        throw new Error(
          `Persisted world publication chain contains a cycle at ${publication.publication_id}`,
        );
      }
      visitedPublications.add(publication.publication_id);
      if (publication.snapshot_id === snapshotId) {
        return publication;
      }
      publication = this.readPreviousPublication(publication);
    }
    return undefined;
  }

  private readSnapshot(snapshotId: string): RepositorySnapshot {
    const row = this.connection.prepare(`
      SELECT payload
      FROM atlas_repository_snapshots
      WHERE repository_id = ? AND snapshot_id = ?
    `).get(this.#repositoryId, snapshotId) as { payload: string } | undefined;
    if (row === undefined) {
      throw new Error(`Repository snapshot ${snapshotId} is not stored`);
    }
    return JSON.parse(row.payload) as RepositorySnapshot;
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
    const bindingTable = ownerColumn === "node_id"
      ? "atlas_business_node_evidence_bindings"
      : "atlas_business_relation_evidence_bindings";

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
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (${ownerColumn}, position, snapshot_id) DO UPDATE SET
          resolved_structural_reference = excluded.resolved_structural_reference,
          resolved_qualified_symbol = excluded.resolved_qualified_symbol,
          resolved_structural_kind = excluded.resolved_structural_kind,
          backend_version = excluded.backend_version,
          backend_locator = excluded.backend_locator,
          binding_status = excluded.binding_status
      `).run(
        row.owner_id,
        row.position,
        this.#repositoryId,
        snapshot.snapshotId,
        match.node?.reference.id ?? null,
        match.node?.qualifiedName ?? null,
        match.node?.kind ?? null,
        backendVersion,
        match.node === undefined ? null : resolver.backendLocator(match.node) ?? null,
        status,
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
        row.relation_id,
        this.#repositoryId,
        snapshot.snapshotId,
        match.node?.reference.id ?? null,
        match.node?.path ?? null,
        match.node?.qualifiedName ?? null,
        match.node?.kind ?? null,
        match.node?.range.start.line ?? null,
        match.node?.range.start.column ?? null,
        match.node?.range.end.line ?? null,
        match.node?.range.end.column ?? null,
        backendVersion,
        match.node === undefined ? null : resolver.backendLocator(match.node) ?? null,
        match.status,
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
      "atlas_business_node_evidence_bindings",
      "atlas_business_node_validity",
      "node_id",
      snapshotId,
    );
    this.refreshValidityTable(
      "atlas_business_relations",
      "atlas_business_relation_evidence",
      "atlas_business_relation_evidence_bindings",
      "atlas_business_relation_validity",
      "relation_id",
      snapshotId,
    );
  }

  private refreshValidityTable(
    ownerTable: "atlas_business_nodes" | "atlas_business_relations",
    evidenceTable: "atlas_business_node_evidence" | "atlas_business_relation_evidence",
    bindingTable: "atlas_business_node_evidence_bindings" | "atlas_business_relation_evidence_bindings",
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
          SUM(CASE WHEN binding.binding_status = 'bound' THEN 1 ELSE 0 END) AS bound_count
        FROM ${evidenceTable} AS evidence
        LEFT JOIN ${bindingTable} AS binding
          ON binding.${ownerColumn} = evidence.${ownerColumn}
          AND binding.position = evidence.position
          AND binding.snapshot_id = ?
        WHERE evidence.${ownerColumn} = ?
      `).get(snapshotId, owner_id) as { evidence_count: number; bound_count: number };
      const validity = row.evidence_count > 0 && row.evidence_count === row.bound_count
        ? "valid"
        : "stale";
      const targetBindingStatus = ownerColumn === "relation_id"
        ? (this.connection.prepare(`
            SELECT relation.to_domain, binding.binding_status AS target_binding_status
            FROM atlas_business_relations AS relation
            LEFT JOIN atlas_structural_relation_target_bindings AS binding
              ON binding.relation_id = relation.relation_id
              AND binding.snapshot_id = ?
            WHERE relation.relation_id = ?
          `).get(snapshotId, owner_id) as {
            to_domain: "structural" | "business";
            target_binding_status: EvidenceBindingStatus | null;
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

  private saveWorldPublication(
    previousPublicationId: number | null,
    changes: WorldPublicationMetadata,
    timestamp: string,
  ): number {
    const result = this.connection.prepare(`
      INSERT INTO atlas_world_publications (
        repository_id,
        git_directory,
        previous_publication_id,
        snapshot_id,
        added_paths,
        modified_paths,
        removed_paths,
        stale_assertions,
        published_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      this.#repositoryId,
      this.#gitDirectory,
      previousPublicationId,
      changes.toSnapshotId,
      JSON.stringify(changes.structural.added),
      JSON.stringify(changes.structural.modified),
      JSON.stringify(changes.structural.removed),
      JSON.stringify(changes.staleAssertions),
      timestamp,
    );
    return Number(result.lastInsertRowid);
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

function compareSnapshotContents(
  from: RepositorySnapshot,
  to: RepositorySnapshot,
): SemanticGraphChanges["nodes"] {
  const fromFiles = snapshotContents(from);
  const toFiles = snapshotContents(to);
  const added: string[] = [];
  const changed: string[] = [];
  const removed: string[] = [];
  const paths = new Set([...fromFiles.keys(), ...toFiles.keys()]);
  for (const path of [...paths].sort()) {
    const before = fromFiles.get(path);
    const after = toFiles.get(path);
    const reference = `file:${path}`;
    if (before === undefined && after !== undefined) {
      added.push(reference);
    } else if (before !== undefined && after === undefined) {
      removed.push(reference);
    } else if (before !== undefined && after !== undefined && before !== after) {
      changed.push(reference);
    }
  }
  return { added, changed, removed };
}

function snapshotContents(snapshot: RepositorySnapshot): ReadonlyMap<string, string> {
  return new Map(snapshot.files.flatMap((file) => (
    file.worktree === null || !isSupportedSource(file.path)
      ? []
      : [[file.path, file.worktree.contentHash] as const]
  )));
}

function parseStringArray(value: string): string[] {
  return JSON.parse(value) as string[];
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
