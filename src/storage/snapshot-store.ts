import type { GitRepository } from "../repository/types.js";
import type { RepositorySnapshot } from "../snapshots/types.js";
import { AtlasDatabase } from "./atlas-database.js";

export interface StoredRepositorySnapshot {
  readonly snapshot: RepositorySnapshot;
  readonly createdAt: string;
}

export class SnapshotStore implements Disposable {
  readonly databasePath: string;
  readonly #atlasDatabase: AtlasDatabase;
  readonly #repositoryId: string;
  readonly #gitDirectory: string;

  constructor(repository: GitRepository) {
    this.#repositoryId = repository.repositoryId;
    this.#gitDirectory = repository.gitDirectory;
    this.#atlasDatabase = new AtlasDatabase(repository);
    this.databasePath = this.#atlasDatabase.databasePath;
  }

  save(snapshot: RepositorySnapshot): void {
    if (snapshot.repositoryId !== this.#repositoryId) {
      throw new Error("Cannot store a snapshot from another repository");
    }

    const timestamp = new Date().toISOString();
    const database = this.#atlasDatabase.connection;
    database.exec("BEGIN IMMEDIATE");
    try {
      database.prepare(`
        INSERT INTO atlas_repository_snapshots (
          repository_id,
          snapshot_id,
          payload,
          created_at
        ) VALUES (?, ?, ?, ?)
        ON CONFLICT (repository_id, snapshot_id) DO NOTHING
      `).run(this.#repositoryId, snapshot.snapshotId, JSON.stringify(snapshot), timestamp);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  find(snapshotId: string): RepositorySnapshot | undefined {
    return this.findStored(snapshotId)?.snapshot;
  }

  findStored(snapshotId: string): StoredRepositorySnapshot | undefined {
    const row = this.#atlasDatabase.connection.prepare(`
      SELECT payload, created_at
      FROM atlas_repository_snapshots
      WHERE repository_id = ? AND snapshot_id = ?
    `).get(this.#repositoryId, snapshotId) as {
      payload: string;
      created_at: string;
    } | undefined;
    return row === undefined ? undefined : {
      snapshot: JSON.parse(row.payload) as RepositorySnapshot,
      createdAt: row.created_at,
    };
  }

  latest(): RepositorySnapshot | undefined {
    return this.latestStored()?.snapshot;
  }

  latestStored(): StoredRepositorySnapshot | undefined {
    const row = this.#atlasDatabase.connection.prepare(`
      SELECT snapshot.payload, snapshot.created_at
      FROM atlas_worktree_states AS worktree
      JOIN atlas_repository_snapshots AS snapshot
        ON snapshot.repository_id = worktree.repository_id
        AND snapshot.snapshot_id = worktree.current_snapshot_id
      WHERE worktree.repository_id = ? AND worktree.git_directory = ?
    `).get(this.#repositoryId, this.#gitDirectory) as {
      payload: string;
      created_at: string;
    } | undefined;
    return row === undefined ? undefined : {
      snapshot: JSON.parse(row.payload) as RepositorySnapshot,
      createdAt: row.created_at,
    };
  }

  close(): void {
    this.#atlasDatabase.close();
  }

  [Symbol.dispose](): void {
    this.close();
  }
}
