import { lstatSync, mkdirSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { DatabaseSync as NodeDatabaseSync } from "node:sqlite";

import type { GitRepository } from "../repository/types.js";

export const CURRENT_ATLAS_SCHEMA_VERSION = 1;
export const SEMANTIC_ATLAS_HOME_ENVIRONMENT_VARIABLE = "SEMANTIC_ATLAS_HOME";

const require = createRequire(import.meta.url);

type DatabaseSyncConstructor = new (path: string) => NodeDatabaseSync;

export class AtlasDatabase implements Disposable {
  readonly databasePath: string;
  readonly connection: NodeDatabaseSync;
  #closed = false;

  constructor(repository: GitRepository) {
    this.databasePath = resolveAtlasDatabasePath(repository);
    const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: DatabaseSyncConstructor };
    this.connection = new DatabaseSync(this.databasePath);
    try {
      this.connection.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
      this.initializeSchema();
      this.registerRepository(repository);
    } catch (error) {
      this.connection.close();
      throw error;
    }
  }

  get schemaVersion(): number {
    const row = this.connection.prepare(`
      SELECT version
      FROM atlas_schema
      WHERE singleton = 1
    `).get() as { version: number };
    return row.version;
  }

  close(): void {
    if (this.#closed) {
      return;
    }
    this.connection.close();
    this.#closed = true;
  }

  [Symbol.dispose](): void {
    this.close();
  }

  private initializeSchema(): void {
    const atlasSchema = this.connection.prepare(`
      SELECT name
      FROM sqlite_schema
      WHERE type = 'table' AND name = 'atlas_schema'
    `).get();
    if (atlasSchema !== undefined) {
      const version = this.schemaVersion;
      if (version !== CURRENT_ATLAS_SCHEMA_VERSION) {
        throw new Error(
          `Atlas database schema ${version} is not supported; expected schema ${CURRENT_ATLAS_SCHEMA_VERSION}`,
        );
      }
      return;
    }

    const existingTables = this.connection.prepare(`
      SELECT COUNT(*) AS count
      FROM sqlite_schema
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    `).get() as { count: number };
    if (existingTables.count > 0) {
      throw new Error("The Atlas database is not a fresh schema v1 store");
    }

    this.connection.exec("BEGIN IMMEDIATE");
    try {
      this.connection.exec(ATLAS_SCHEMA_V1);
      this.connection.prepare(`
        INSERT INTO atlas_schema (singleton, version, created_at)
        VALUES (1, ?, ?)
      `).run(CURRENT_ATLAS_SCHEMA_VERSION, new Date().toISOString());
      this.connection.exec("COMMIT");
    } catch (error) {
      this.connection.exec("ROLLBACK");
      throw error;
    }
  }

  private registerRepository(repository: GitRepository): void {
    const timestamp = new Date().toISOString();
    this.connection.exec("BEGIN IMMEDIATE");
    try {
      this.connection.prepare(`
        INSERT INTO atlas_repositories (
          repository_id,
          common_git_directory,
          updated_at
        ) VALUES (?, ?, ?)
        ON CONFLICT (repository_id) DO UPDATE SET
          common_git_directory = excluded.common_git_directory,
          updated_at = excluded.updated_at
      `).run(repository.repositoryId, repository.commonGitDirectory, timestamp);
      this.connection.prepare(`
        INSERT INTO atlas_worktree_states (
          repository_id,
          git_directory,
          worktree_root,
          status,
          updated_at
        ) VALUES (?, ?, ?, 'missing', ?)
        ON CONFLICT (repository_id, git_directory) DO UPDATE SET
          worktree_root = excluded.worktree_root,
          updated_at = excluded.updated_at
      `).run(
        repository.repositoryId,
        repository.gitDirectory,
        repository.worktreeRoot,
        timestamp,
      );
      this.connection.exec("COMMIT");
    } catch (error) {
      this.connection.exec("ROLLBACK");
      throw error;
    }
  }
}

export function resolveAtlasHome(repository: GitRepository): string {
  const configuredHome = process.env[SEMANTIC_ATLAS_HOME_ENVIRONMENT_VARIABLE];
  if (configuredHome !== undefined && !isAbsolute(configuredHome)) {
    throw new Error(`${SEMANTIC_ATLAS_HOME_ENVIRONMENT_VARIABLE} must be an absolute path`);
  }
  const atlasHome = resolve(configuredHome ?? join(homedir(), ".semantic-atlas"));
  mkdirSync(atlasHome, { recursive: true, mode: 0o700 });
  requireRealDirectory(atlasHome, "The Semantic Atlas home");

  const realAtlasHome = realpathSync(atlasHome);
  for (const worktreeRoot of repository.worktreeRoots) {
    const realWorktreeRoot = realpathExistingPath(worktreeRoot);
    if (realWorktreeRoot !== null && isPathInside(realAtlasHome, realWorktreeRoot)) {
      throw new Error("The Semantic Atlas home must be outside every repository worktree");
    }
  }
  return realAtlasHome;
}

export function resolveAtlasDatabasePath(repository: GitRepository): string {
  const atlasHome = resolveAtlasHome(repository);
  const repositoriesDirectory = join(atlasHome, "repositories");
  const repositoryDirectory = join(repositoriesDirectory, repository.repositoryId);
  mkdirSync(repositoryDirectory, { recursive: true, mode: 0o700 });
  requireRealDirectory(repositoriesDirectory, "The Semantic Atlas repositories directory");
  requireRealDirectory(repositoryDirectory, "The repository Atlas directory");
  return join(repositoryDirectory, "atlas.db");
}

function requireRealDirectory(path: string, label: string): void {
  const metadata = lstatSync(path);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error(`${label} must be a real directory`);
  }
}

function realpathExistingPath(path: string): string | null {
  try {
    return realpathSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function isPathInside(candidate: string, parent: string): boolean {
  const pathFromParent = relative(parent, candidate);
  return pathFromParent === "" || (
    pathFromParent !== ".."
    && !pathFromParent.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
    && !isAbsolute(pathFromParent)
  );
}

const ATLAS_SCHEMA_V1 = `
  CREATE TABLE atlas_schema (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    version INTEGER NOT NULL CHECK (version = 1),
    created_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE atlas_repositories (
    repository_id TEXT PRIMARY KEY,
    common_git_directory TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE atlas_repository_snapshots (
    repository_id TEXT NOT NULL,
    snapshot_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (repository_id, snapshot_id),
    FOREIGN KEY (repository_id)
      REFERENCES atlas_repositories(repository_id) ON DELETE CASCADE
  ) STRICT;

  CREATE TABLE atlas_world_publications (
    publication_id INTEGER PRIMARY KEY,
    repository_id TEXT NOT NULL,
    git_directory TEXT NOT NULL,
    previous_publication_id INTEGER CHECK (
      previous_publication_id IS NULL OR previous_publication_id < publication_id
    ),
    snapshot_id TEXT NOT NULL,
    added_paths TEXT NOT NULL,
    modified_paths TEXT NOT NULL,
    removed_paths TEXT NOT NULL,
    stale_assertions TEXT NOT NULL,
    published_at TEXT NOT NULL,
    UNIQUE (repository_id, git_directory, publication_id),
    FOREIGN KEY (repository_id)
      REFERENCES atlas_repositories(repository_id) ON DELETE CASCADE,
    FOREIGN KEY (repository_id, snapshot_id)
      REFERENCES atlas_repository_snapshots(repository_id, snapshot_id) ON DELETE CASCADE,
    FOREIGN KEY (repository_id, git_directory, previous_publication_id)
      REFERENCES atlas_world_publications(repository_id, git_directory, publication_id)
  ) STRICT;

  CREATE TABLE atlas_worktree_states (
    repository_id TEXT NOT NULL,
    git_directory TEXT NOT NULL,
    worktree_root TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('missing', 'building', 'current', 'failed')),
    current_snapshot_id TEXT,
    target_snapshot_id TEXT,
    backend_version TEXT,
    extraction_version INTEGER,
    current_publication_id INTEGER,
    failure_message TEXT,
    started_at TEXT,
    published_at TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (repository_id, git_directory),
    FOREIGN KEY (repository_id)
      REFERENCES atlas_repositories(repository_id) ON DELETE CASCADE,
    FOREIGN KEY (repository_id, current_snapshot_id)
      REFERENCES atlas_repository_snapshots(repository_id, snapshot_id),
    FOREIGN KEY (repository_id, git_directory, current_publication_id)
      REFERENCES atlas_world_publications(repository_id, git_directory, publication_id)
  ) STRICT;

  CREATE INDEX atlas_worktree_states_current_index
    ON atlas_worktree_states (repository_id, status, published_at DESC, worktree_root);
  CREATE INDEX atlas_world_publications_worktree_order_index
    ON atlas_world_publications (repository_id, git_directory, publication_id DESC);
  CREATE INDEX atlas_world_publications_snapshot_index
    ON atlas_world_publications (repository_id, git_directory, snapshot_id, publication_id DESC);

  CREATE TABLE atlas_business_nodes (
    node_id INTEGER PRIMARY KEY,
    repository_id TEXT NOT NULL,
    node_key TEXT NOT NULL,
    base_snapshot_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN (
      'Capability', 'Scenario', 'Operation', 'Invariant', 'Interface', 'Data'
    )),
    label TEXT NOT NULL,
    summary TEXT NOT NULL,
    certainty TEXT NOT NULL CHECK (certainty IN ('exact', 'inferred', 'hypothesis')),
    UNIQUE (repository_id, node_key),
    FOREIGN KEY (repository_id, base_snapshot_id)
      REFERENCES atlas_repository_snapshots(repository_id, snapshot_id)
  ) STRICT;

  CREATE TABLE atlas_business_node_aliases (
    node_id INTEGER NOT NULL,
    position INTEGER NOT NULL,
    alias TEXT NOT NULL,
    PRIMARY KEY (node_id, position),
    FOREIGN KEY (node_id) REFERENCES atlas_business_nodes(node_id) ON DELETE CASCADE
  ) STRICT;

  CREATE TABLE atlas_business_node_evidence (
    node_id INTEGER NOT NULL,
    position INTEGER NOT NULL,
    structural_reference TEXT NOT NULL,
    file TEXT NOT NULL,
    qualified_symbol TEXT,
    structural_kind TEXT,
    start_line INTEGER NOT NULL,
    start_column INTEGER NOT NULL,
    end_line INTEGER NOT NULL,
    end_column INTEGER NOT NULL,
    content_hash TEXT NOT NULL,
    backend_locator TEXT,
    PRIMARY KEY (node_id, position),
    FOREIGN KEY (node_id) REFERENCES atlas_business_nodes(node_id) ON DELETE CASCADE
  ) STRICT;

  CREATE TABLE atlas_business_node_evidence_bindings (
    node_id INTEGER NOT NULL,
    position INTEGER NOT NULL,
    repository_id TEXT NOT NULL,
    snapshot_id TEXT NOT NULL,
    resolved_structural_reference TEXT,
    resolved_qualified_symbol TEXT,
    resolved_structural_kind TEXT,
    backend_version TEXT,
    backend_locator TEXT,
    binding_status TEXT NOT NULL CHECK (
      binding_status IN ('bound', 'missing', 'ambiguous', 'unresolved')
    ),
    PRIMARY KEY (node_id, position, snapshot_id),
    FOREIGN KEY (node_id, position)
      REFERENCES atlas_business_node_evidence(node_id, position) ON DELETE CASCADE,
    FOREIGN KEY (repository_id, snapshot_id)
      REFERENCES atlas_repository_snapshots(repository_id, snapshot_id) ON DELETE CASCADE
  ) STRICT;

  CREATE TABLE atlas_business_relations (
    relation_id INTEGER PRIMARY KEY,
    repository_id TEXT NOT NULL,
    base_snapshot_id TEXT NOT NULL,
    from_key TEXT NOT NULL,
    relation_type TEXT NOT NULL CHECK (relation_type IN (
      'part_of', 'invokes', 'realized_by', 'reads', 'writes', 'publishes',
      'consumes', 'constrained_by', 'verified_by'
    )),
    to_domain TEXT NOT NULL CHECK (to_domain IN ('structural', 'business')),
    to_key TEXT NOT NULL,
    certainty TEXT NOT NULL CHECK (certainty IN ('exact', 'inferred', 'hypothesis')),
    target_file TEXT,
    target_qualified_symbol TEXT,
    target_structural_kind TEXT,
    target_start_line INTEGER,
    target_start_column INTEGER,
    target_end_line INTEGER,
    target_end_column INTEGER,
    target_backend_locator TEXT,
    UNIQUE (repository_id, from_key, relation_type, to_domain, to_key),
    FOREIGN KEY (repository_id, base_snapshot_id)
      REFERENCES atlas_repository_snapshots(repository_id, snapshot_id),
    FOREIGN KEY (repository_id, from_key)
      REFERENCES atlas_business_nodes(repository_id, node_key)
  ) STRICT;

  CREATE INDEX atlas_business_relations_from_index
    ON atlas_business_relations (repository_id, from_key);
  CREATE INDEX atlas_business_relations_to_index
    ON atlas_business_relations (repository_id, to_domain, to_key);

  CREATE TABLE atlas_business_relation_evidence (
    relation_id INTEGER NOT NULL,
    position INTEGER NOT NULL,
    structural_reference TEXT NOT NULL,
    file TEXT NOT NULL,
    qualified_symbol TEXT,
    structural_kind TEXT,
    start_line INTEGER NOT NULL,
    start_column INTEGER NOT NULL,
    end_line INTEGER NOT NULL,
    end_column INTEGER NOT NULL,
    content_hash TEXT NOT NULL,
    backend_locator TEXT,
    PRIMARY KEY (relation_id, position),
    FOREIGN KEY (relation_id)
      REFERENCES atlas_business_relations(relation_id) ON DELETE CASCADE
  ) STRICT;

  CREATE TABLE atlas_business_relation_evidence_bindings (
    relation_id INTEGER NOT NULL,
    position INTEGER NOT NULL,
    repository_id TEXT NOT NULL,
    snapshot_id TEXT NOT NULL,
    resolved_structural_reference TEXT,
    resolved_qualified_symbol TEXT,
    resolved_structural_kind TEXT,
    backend_version TEXT,
    backend_locator TEXT,
    binding_status TEXT NOT NULL CHECK (
      binding_status IN ('bound', 'missing', 'ambiguous', 'unresolved')
    ),
    PRIMARY KEY (relation_id, position, snapshot_id),
    FOREIGN KEY (relation_id, position)
      REFERENCES atlas_business_relation_evidence(relation_id, position) ON DELETE CASCADE,
    FOREIGN KEY (repository_id, snapshot_id)
      REFERENCES atlas_repository_snapshots(repository_id, snapshot_id) ON DELETE CASCADE
  ) STRICT;

  CREATE TABLE atlas_structural_relation_target_bindings (
    relation_id INTEGER NOT NULL,
    repository_id TEXT NOT NULL,
    snapshot_id TEXT NOT NULL,
    resolved_structural_reference TEXT,
    resolved_file TEXT,
    resolved_qualified_symbol TEXT,
    resolved_structural_kind TEXT,
    resolved_start_line INTEGER,
    resolved_start_column INTEGER,
    resolved_end_line INTEGER,
    resolved_end_column INTEGER,
    backend_version TEXT,
    backend_locator TEXT,
    binding_status TEXT NOT NULL CHECK (
      binding_status IN ('bound', 'missing', 'ambiguous', 'unresolved')
    ),
    PRIMARY KEY (relation_id, snapshot_id),
    FOREIGN KEY (relation_id)
      REFERENCES atlas_business_relations(relation_id) ON DELETE CASCADE,
    FOREIGN KEY (repository_id, snapshot_id)
      REFERENCES atlas_repository_snapshots(repository_id, snapshot_id) ON DELETE CASCADE
  ) STRICT;

  CREATE TABLE atlas_business_node_validity (
    node_id INTEGER NOT NULL,
    repository_id TEXT NOT NULL,
    snapshot_id TEXT NOT NULL,
    validity TEXT NOT NULL CHECK (validity IN ('valid', 'stale')),
    PRIMARY KEY (node_id, snapshot_id),
    FOREIGN KEY (node_id) REFERENCES atlas_business_nodes(node_id) ON DELETE CASCADE,
    FOREIGN KEY (repository_id, snapshot_id)
      REFERENCES atlas_repository_snapshots(repository_id, snapshot_id) ON DELETE CASCADE
  ) STRICT;

  CREATE TABLE atlas_business_relation_validity (
    relation_id INTEGER NOT NULL,
    repository_id TEXT NOT NULL,
    snapshot_id TEXT NOT NULL,
    validity TEXT NOT NULL CHECK (validity IN ('valid', 'stale')),
    PRIMARY KEY (relation_id, snapshot_id),
    FOREIGN KEY (relation_id) REFERENCES atlas_business_relations(relation_id) ON DELETE CASCADE,
    FOREIGN KEY (repository_id, snapshot_id)
      REFERENCES atlas_repository_snapshots(repository_id, snapshot_id) ON DELETE CASCADE
  ) STRICT;

  CREATE TABLE atlas_graph_search (
    repository_id TEXT NOT NULL,
    node_key TEXT NOT NULL,
    label TEXT NOT NULL,
    aliases TEXT NOT NULL,
    summary TEXT NOT NULL,
    symbols TEXT NOT NULL,
    paths TEXT NOT NULL,
    PRIMARY KEY (repository_id, node_key),
    FOREIGN KEY (repository_id, node_key)
      REFERENCES atlas_business_nodes(repository_id, node_key) ON DELETE CASCADE
  ) STRICT;
`;
