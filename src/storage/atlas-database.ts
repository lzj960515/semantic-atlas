import { existsSync, mkdirSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { DatabaseSync as NodeDatabaseSync } from "node:sqlite";

import type { GitRepository } from "../repository/types.js";

export const CURRENT_ATLAS_SCHEMA_VERSION = 2;

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
      CREATE TABLE IF NOT EXISTS atlas_repositories (
        repository_id TEXT PRIMARY KEY,
        common_git_directory TEXT NOT NULL,
        latest_snapshot_id TEXT,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS repository_snapshots (
        repository_id TEXT NOT NULL,
        snapshot_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (repository_id, snapshot_id),
        FOREIGN KEY (repository_id) REFERENCES atlas_repositories(repository_id) ON DELETE CASCADE
      ) STRICT;

      CREATE TABLE IF NOT EXISTS graph_node_identities (
        identity_id INTEGER PRIMARY KEY,
        repository_id TEXT NOT NULL,
        domain TEXT NOT NULL CHECK (domain IN ('structural', 'business')),
        node_key TEXT NOT NULL,
        UNIQUE (repository_id, domain, node_key),
        FOREIGN KEY (repository_id) REFERENCES atlas_repositories(repository_id) ON DELETE CASCADE
      ) STRICT;

      CREATE TABLE IF NOT EXISTS structural_nodes (
        identity_id INTEGER NOT NULL,
        repository_id TEXT NOT NULL,
        snapshot_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN (
          'Repository', 'Module', 'File', 'Symbol', 'Test', 'UnknownBoundary'
        )),
        label TEXT NOT NULL,
        PRIMARY KEY (identity_id, snapshot_id),
        FOREIGN KEY (identity_id) REFERENCES graph_node_identities(identity_id) ON DELETE CASCADE,
        FOREIGN KEY (repository_id, snapshot_id)
          REFERENCES repository_snapshots(repository_id, snapshot_id) ON DELETE CASCADE
      ) STRICT;

      CREATE TABLE IF NOT EXISTS structural_node_locations (
        identity_id INTEGER NOT NULL,
        snapshot_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        file TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        start_column INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        end_column INTEGER NOT NULL,
        content_hash TEXT NOT NULL,
        PRIMARY KEY (identity_id, snapshot_id, position),
        FOREIGN KEY (identity_id, snapshot_id)
          REFERENCES structural_nodes(identity_id, snapshot_id) ON DELETE CASCADE
      ) STRICT;

      CREATE TABLE IF NOT EXISTS unknown_boundaries (
        identity_id INTEGER NOT NULL,
        snapshot_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        PRIMARY KEY (identity_id, snapshot_id),
        FOREIGN KEY (identity_id, snapshot_id)
          REFERENCES structural_nodes(identity_id, snapshot_id) ON DELETE CASCADE
      ) STRICT;

      CREATE TABLE IF NOT EXISTS unknown_boundary_candidates (
        identity_id INTEGER NOT NULL,
        snapshot_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        candidate TEXT NOT NULL,
        PRIMARY KEY (identity_id, snapshot_id, position),
        FOREIGN KEY (identity_id, snapshot_id)
          REFERENCES unknown_boundaries(identity_id, snapshot_id) ON DELETE CASCADE
      ) STRICT;

      CREATE TABLE IF NOT EXISTS structural_relations (
        relation_id INTEGER PRIMARY KEY,
        repository_id TEXT NOT NULL,
        snapshot_id TEXT NOT NULL,
        from_identity_id INTEGER NOT NULL,
        relation_type TEXT NOT NULL CHECK (relation_type IN (
          'contains', 'declares', 'imports', 'exports', 'references', 'calls',
          'extends', 'implements', 'decorated_by'
        )),
        to_identity_id INTEGER NOT NULL,
        UNIQUE (
          repository_id,
          snapshot_id,
          from_identity_id,
          relation_type,
          to_identity_id
        ),
        FOREIGN KEY (repository_id, snapshot_id)
          REFERENCES repository_snapshots(repository_id, snapshot_id) ON DELETE CASCADE,
        FOREIGN KEY (from_identity_id, snapshot_id)
          REFERENCES structural_nodes(identity_id, snapshot_id) ON DELETE CASCADE,
        FOREIGN KEY (to_identity_id, snapshot_id)
          REFERENCES structural_nodes(identity_id, snapshot_id) ON DELETE CASCADE
      ) STRICT;

      CREATE INDEX IF NOT EXISTS structural_relations_from_index
        ON structural_relations (repository_id, snapshot_id, from_identity_id);
      CREATE INDEX IF NOT EXISTS structural_relations_to_index
        ON structural_relations (repository_id, snapshot_id, to_identity_id);

      CREATE TABLE IF NOT EXISTS business_nodes (
        identity_id INTEGER PRIMARY KEY,
        repository_id TEXT NOT NULL,
        base_snapshot_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN (
          'Capability', 'Scenario', 'Operation', 'Invariant', 'Interface', 'Data'
        )),
        label TEXT NOT NULL,
        summary TEXT NOT NULL,
        certainty TEXT NOT NULL CHECK (certainty IN ('exact', 'inferred', 'hypothesis')),
        validity TEXT NOT NULL CHECK (validity IN ('valid', 'stale')),
        FOREIGN KEY (identity_id) REFERENCES graph_node_identities(identity_id) ON DELETE CASCADE,
        FOREIGN KEY (repository_id, base_snapshot_id)
          REFERENCES repository_snapshots(repository_id, snapshot_id)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS business_node_aliases (
        identity_id INTEGER NOT NULL,
        position INTEGER NOT NULL,
        alias TEXT NOT NULL,
        PRIMARY KEY (identity_id, position),
        FOREIGN KEY (identity_id) REFERENCES business_nodes(identity_id) ON DELETE CASCADE
      ) STRICT;

      CREATE TABLE IF NOT EXISTS business_node_evidence (
        identity_id INTEGER NOT NULL,
        position INTEGER NOT NULL,
        symbol_identity_id INTEGER NOT NULL,
        file TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        start_column INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        end_column INTEGER NOT NULL,
        content_hash TEXT NOT NULL,
        PRIMARY KEY (identity_id, position),
        FOREIGN KEY (identity_id) REFERENCES business_nodes(identity_id) ON DELETE CASCADE,
        FOREIGN KEY (symbol_identity_id) REFERENCES graph_node_identities(identity_id)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS business_relations (
        relation_id INTEGER PRIMARY KEY,
        repository_id TEXT NOT NULL,
        base_snapshot_id TEXT NOT NULL,
        from_identity_id INTEGER NOT NULL,
        relation_type TEXT NOT NULL CHECK (relation_type IN (
          'part_of', 'realized_by', 'reads', 'writes', 'publishes', 'consumes',
          'constrained_by', 'verified_by'
        )),
        to_identity_id INTEGER NOT NULL,
        certainty TEXT NOT NULL CHECK (certainty IN ('exact', 'inferred', 'hypothesis')),
        validity TEXT NOT NULL CHECK (validity IN ('valid', 'stale')),
        UNIQUE (repository_id, from_identity_id, relation_type, to_identity_id),
        FOREIGN KEY (repository_id, base_snapshot_id)
          REFERENCES repository_snapshots(repository_id, snapshot_id),
        FOREIGN KEY (from_identity_id) REFERENCES graph_node_identities(identity_id),
        FOREIGN KEY (to_identity_id) REFERENCES graph_node_identities(identity_id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS business_relations_from_index
        ON business_relations (repository_id, from_identity_id);
      CREATE INDEX IF NOT EXISTS business_relations_to_index
        ON business_relations (repository_id, to_identity_id);

      CREATE TABLE IF NOT EXISTS business_relation_evidence (
        relation_id INTEGER NOT NULL,
        position INTEGER NOT NULL,
        symbol_identity_id INTEGER NOT NULL,
        file TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        start_column INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        end_column INTEGER NOT NULL,
        content_hash TEXT NOT NULL,
        PRIMARY KEY (relation_id, position),
        FOREIGN KEY (relation_id) REFERENCES business_relations(relation_id) ON DELETE CASCADE,
        FOREIGN KEY (symbol_identity_id) REFERENCES graph_node_identities(identity_id)
      ) STRICT;

      CREATE VIRTUAL TABLE IF NOT EXISTS graph_search USING fts5(
        repository_id UNINDEXED,
        scope UNINDEXED,
        node_domain UNINDEXED,
        node_key UNINDEXED,
        label,
        aliases,
        summary,
        symbols,
        paths,
        tokenize = 'unicode61 remove_diacritics 2'
      );
    `,
  },
  {
    version: 2,
    sql: `
      CREATE TABLE IF NOT EXISTS structural_graph_snapshots (
        repository_id TEXT NOT NULL,
        snapshot_id TEXT NOT NULL,
        PRIMARY KEY (repository_id, snapshot_id),
        FOREIGN KEY (repository_id, snapshot_id)
          REFERENCES repository_snapshots(repository_id, snapshot_id) ON DELETE CASCADE
      ) STRICT;

      INSERT OR IGNORE INTO structural_graph_snapshots (repository_id, snapshot_id)
      SELECT DISTINCT repository_id, snapshot_id
      FROM structural_nodes;

      CREATE TABLE IF NOT EXISTS business_node_validity (
        identity_id INTEGER NOT NULL,
        repository_id TEXT NOT NULL,
        snapshot_id TEXT NOT NULL,
        validity TEXT NOT NULL CHECK (validity IN ('valid', 'stale')),
        PRIMARY KEY (identity_id, snapshot_id),
        FOREIGN KEY (identity_id) REFERENCES business_nodes(identity_id) ON DELETE CASCADE,
        FOREIGN KEY (repository_id, snapshot_id)
          REFERENCES repository_snapshots(repository_id, snapshot_id) ON DELETE CASCADE
      ) STRICT;

      CREATE TABLE IF NOT EXISTS business_relation_validity (
        relation_id INTEGER NOT NULL,
        repository_id TEXT NOT NULL,
        snapshot_id TEXT NOT NULL,
        validity TEXT NOT NULL CHECK (validity IN ('valid', 'stale')),
        PRIMARY KEY (relation_id, snapshot_id),
        FOREIGN KEY (relation_id) REFERENCES business_relations(relation_id) ON DELETE CASCADE,
        FOREIGN KEY (repository_id, snapshot_id)
          REFERENCES repository_snapshots(repository_id, snapshot_id) ON DELETE CASCADE
      ) STRICT;

      INSERT INTO business_node_validity (
        identity_id,
        repository_id,
        snapshot_id,
        validity
      )
      SELECT
        assertion.identity_id,
        assertion.repository_id,
        graph_snapshot.snapshot_id,
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
                AND symbol.snapshot_id = graph_snapshot.snapshot_id
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
      JOIN structural_graph_snapshots AS graph_snapshot
        ON graph_snapshot.repository_id = assertion.repository_id;

      INSERT INTO business_relation_validity (
        relation_id,
        repository_id,
        snapshot_id,
        validity
      )
      SELECT
        assertion.relation_id,
        assertion.repository_id,
        graph_snapshot.snapshot_id,
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
                AND symbol.snapshot_id = graph_snapshot.snapshot_id
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
              AND target_node.snapshot_id = graph_snapshot.snapshot_id
          )
        ) THEN 'stale' ELSE 'valid' END
      FROM business_relations AS assertion
      JOIN structural_graph_snapshots AS graph_snapshot
        ON graph_snapshot.repository_id = assertion.repository_id;

      ALTER TABLE business_nodes DROP COLUMN validity;
      ALTER TABLE business_relations DROP COLUMN validity;
    `,
  },
];

function canonicalizePath(path: string): string {
  let existingAncestor = resolve(path);
  const missingSegments: string[] = [];

  while (!existsSync(existingAncestor)) {
    missingSegments.unshift(basename(existingAncestor));
    const parent = dirname(existingAncestor);
    if (parent === existingAncestor) {
      break;
    }
    existingAncestor = parent;
  }

  return resolve(realpathSync(existingAncestor), ...missingSegments);
}

function isWithinDirectory(parent: string, candidate: string): boolean {
  const pathFromParent = relative(canonicalizePath(parent), canonicalizePath(candidate));
  return pathFromParent === "" || (!pathFromParent.startsWith("..") && !isAbsolute(pathFromParent));
}

export class AtlasDatabase implements Disposable {
  readonly databasePath: string;
  readonly connection: NodeDatabaseSync;

  constructor(
    dataDirectory: string,
    repository: GitRepository,
  ) {
    if (!isAbsolute(dataDirectory)) {
      throw new Error("Atlas data directory must be absolute");
    }

    const protectedRepositoryDirectories = [
      repository.commonGitDirectory,
      repository.worktreeRoot,
      ...repository.worktreeRoots,
    ];
    if (protectedRepositoryDirectories.some((directory) => isWithinDirectory(directory, dataDirectory))) {
      throw new Error("Atlas data directory must be outside the target repository");
    }

    this.databasePath = join(dataDirectory, "repositories", repository.repositoryId, "atlas.sqlite");
    mkdirSync(dirname(this.databasePath), { recursive: true });
    const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: DatabaseSyncConstructor };
    this.connection = new DatabaseSync(this.databasePath);
    try {
      this.connection.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
      this.applyMigrations();
      this.connection.prepare(`
        INSERT INTO atlas_repositories (repository_id, common_git_directory, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT (repository_id) DO UPDATE SET
          common_git_directory = excluded.common_git_directory,
          updated_at = excluded.updated_at
      `).run(repository.repositoryId, repository.commonGitDirectory, new Date().toISOString());
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
    this.connection.close();
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
          this.connection.exec(`PRAGMA user_version = ${migration.version}`);
        }
        this.connection.exec("COMMIT");
      } catch (error) {
        this.connection.exec("ROLLBACK");
        throw error;
      }
    }
  }
}
