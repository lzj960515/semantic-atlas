import { lstatSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import type { DatabaseSync as NodeDatabaseSync } from "node:sqlite";

import type { GitRepository } from "../repository/types.js";

export const CURRENT_ATLAS_SCHEMA_VERSION = 1;

const require = createRequire(import.meta.url);

type DatabaseSyncConstructor = new (path: string) => NodeDatabaseSync;

interface SchemaMigration {
  readonly version: number;
  readonly sql: string;
}

const migrations: readonly SchemaMigration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE atlas_repositories (
        repository_id TEXT PRIMARY KEY,
        common_git_directory TEXT NOT NULL,
        worktree_root TEXT NOT NULL,
        latest_snapshot_id TEXT,
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
        start_line INTEGER NOT NULL,
        start_column INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        end_column INTEGER NOT NULL,
        content_hash TEXT NOT NULL,
        PRIMARY KEY (node_id, position),
        FOREIGN KEY (node_id) REFERENCES atlas_business_nodes(node_id) ON DELETE CASCADE
      ) STRICT;

      CREATE TABLE atlas_business_relations (
        relation_id INTEGER PRIMARY KEY,
        repository_id TEXT NOT NULL,
        base_snapshot_id TEXT NOT NULL,
        from_key TEXT NOT NULL,
        relation_type TEXT NOT NULL CHECK (relation_type IN (
          'part_of', 'realized_by', 'reads', 'writes', 'publishes', 'consumes',
          'constrained_by', 'verified_by'
        )),
        to_domain TEXT NOT NULL CHECK (to_domain IN ('structural', 'business')),
        to_key TEXT NOT NULL,
        certainty TEXT NOT NULL CHECK (certainty IN ('exact', 'inferred', 'hypothesis')),
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
        start_line INTEGER NOT NULL,
        start_column INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        end_column INTEGER NOT NULL,
        content_hash TEXT NOT NULL,
        PRIMARY KEY (relation_id, position),
        FOREIGN KEY (relation_id)
          REFERENCES atlas_business_relations(relation_id) ON DELETE CASCADE
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
        FOREIGN KEY (relation_id)
          REFERENCES atlas_business_relations(relation_id) ON DELETE CASCADE,
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
    `,
  },
];

export class AtlasDatabase implements Disposable {
  readonly databasePath: string;
  readonly connection: NodeDatabaseSync;
  #closed = false;

  constructor(repository: GitRepository) {
    const atlasDirectory = join(repository.worktreeRoot, ".atlas");
    const databasePath = join(atlasDirectory, "codegraph.db");
    requireExistingSharedDatabase(atlasDirectory, databasePath);

    this.databasePath = databasePath;
    const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: DatabaseSyncConstructor };
    this.connection = new DatabaseSync(databasePath);
    try {
      this.connection.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
      this.applyMigrations();
      this.connection.prepare(`
        INSERT INTO atlas_repositories (
          repository_id,
          common_git_directory,
          worktree_root,
          updated_at
        ) VALUES (?, ?, ?, ?)
        ON CONFLICT (repository_id) DO UPDATE SET
          common_git_directory = excluded.common_git_directory,
          worktree_root = excluded.worktree_root,
          updated_at = excluded.updated_at
      `).run(
        repository.repositoryId,
        repository.commonGitDirectory,
        repository.worktreeRoot,
        new Date().toISOString(),
      );
    } catch (error) {
      this.connection.close();
      throw error;
    }
  }

  get schemaVersion(): number {
    const row = this.connection.prepare(`
      SELECT COALESCE(MAX(version), 0) AS version
      FROM atlas_schema_migrations
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

  private applyMigrations(): void {
    this.connection.exec(`
      CREATE TABLE IF NOT EXISTS atlas_schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      ) STRICT;
    `);
    const currentVersion = this.schemaVersion;
    if (currentVersion > CURRENT_ATLAS_SCHEMA_VERSION) {
      throw new Error(
        `Atlas database schema ${currentVersion} is newer than supported schema ${CURRENT_ATLAS_SCHEMA_VERSION}`,
      );
    }

    for (const migration of migrations) {
      this.connection.exec("BEGIN IMMEDIATE");
      try {
        const applied = this.connection.prepare(`
          SELECT 1 AS applied
          FROM atlas_schema_migrations
          WHERE version = ?
        `).get(migration.version);
        if (applied === undefined) {
          this.connection.exec(migration.sql);
          this.connection.prepare(`
            INSERT INTO atlas_schema_migrations (version, applied_at)
            VALUES (?, ?)
          `).run(migration.version, new Date().toISOString());
        }
        this.connection.exec("COMMIT");
      } catch (error) {
        this.connection.exec("ROLLBACK");
        throw error;
      }
    }
  }
}

function requireExistingSharedDatabase(atlasDirectory: string, databasePath: string): void {
  const directory = lstatSync(atlasDirectory);
  if (!directory.isDirectory() || directory.isSymbolicLink()) {
    throw new Error("The Atlas store must be a real directory inside the target worktree");
  }
  if (resolve(realpathSync(atlasDirectory)) !== resolve(atlasDirectory)) {
    throw new Error("The Atlas store resolves outside the target worktree");
  }

  const database = lstatSync(databasePath);
  if (!database.isFile() || database.isSymbolicLink()) {
    throw new Error("The shared Atlas database must be initialized by the structural backend");
  }
}
