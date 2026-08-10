import { existsSync, mkdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, posix, relative, resolve, win32 } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { GitRepository } from "../repository/types.js";
import type { RepositorySnapshot } from "../snapshots/types.js";

export interface UserDataEnvironment {
  readonly platform: NodeJS.Platform;
  readonly homeDirectory: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
}

function defaultUserDataEnvironment(): UserDataEnvironment {
  return {
    platform: process.platform,
    homeDirectory: homedir(),
    environment: process.env,
  };
}

export function resolveAtlasDataDirectory(
  options: UserDataEnvironment = defaultUserDataEnvironment(),
): string {
  const { environment, homeDirectory, platform } = options;
  if (platform === "win32") {
    const dataDirectory = environment.LOCALAPPDATA
      || environment.APPDATA
      || win32.join(homeDirectory, "AppData", "Local");
    return win32.join(dataDirectory, "semantic-atlas");
  }
  if (platform === "darwin") {
    return posix.join(homeDirectory, "Library", "Application Support", "semantic-atlas");
  }
  return posix.join(environment.XDG_DATA_HOME || posix.join(homeDirectory, ".local", "share"), "semantic-atlas");
}

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

export class SnapshotStore implements Disposable {
  readonly databasePath: string;
  readonly #database: DatabaseSync;
  readonly #repositoryId: string;

  constructor(
    dataDirectory: string,
    repository: GitRepository,
  ) {
    if (isWithinDirectory(repository.worktreeRoot, dataDirectory)) {
      throw new Error("Atlas data directory must be outside the target repository");
    }

    this.#repositoryId = repository.repositoryId;
    this.databasePath = join(dataDirectory, "repositories", repository.repositoryId, "atlas.sqlite");
    mkdirSync(dirname(this.databasePath), { recursive: true });
    this.#database = new DatabaseSync(this.databasePath);
    this.#database.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;

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
    `);
    this.#database.prepare(`
      INSERT INTO atlas_repositories (repository_id, common_git_directory, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT (repository_id) DO UPDATE SET
        common_git_directory = excluded.common_git_directory,
        updated_at = excluded.updated_at
    `).run(repository.repositoryId, repository.commonGitDirectory, new Date().toISOString());
  }

  save(snapshot: RepositorySnapshot): void {
    if (snapshot.repositoryId !== this.#repositoryId) {
      throw new Error("Cannot store a snapshot from another repository");
    }

    const timestamp = new Date().toISOString();
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      this.#database.prepare(`
        INSERT INTO repository_snapshots (repository_id, snapshot_id, payload, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (repository_id, snapshot_id) DO NOTHING
      `).run(this.#repositoryId, snapshot.snapshotId, JSON.stringify(snapshot), timestamp);
      this.#database.prepare(`
        UPDATE atlas_repositories
        SET latest_snapshot_id = ?, updated_at = ?
        WHERE repository_id = ?
      `).run(snapshot.snapshotId, timestamp, this.#repositoryId);
      this.#database.exec("COMMIT");
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  find(snapshotId: string): RepositorySnapshot | undefined {
    const row = this.#database.prepare(`
      SELECT payload
      FROM repository_snapshots
      WHERE repository_id = ? AND snapshot_id = ?
    `).get(this.#repositoryId, snapshotId) as { payload: string } | undefined;
    return row === undefined ? undefined : JSON.parse(row.payload) as RepositorySnapshot;
  }

  latest(): RepositorySnapshot | undefined {
    const row = this.#database.prepare(`
      SELECT snapshot.payload
      FROM atlas_repositories AS repository
      JOIN repository_snapshots AS snapshot
        ON snapshot.repository_id = repository.repository_id
        AND snapshot.snapshot_id = repository.latest_snapshot_id
      WHERE repository.repository_id = ?
    `).get(this.#repositoryId) as { payload: string } | undefined;
    return row === undefined ? undefined : JSON.parse(row.payload) as RepositorySnapshot;
  }

  close(): void {
    this.#database.close();
  }

  [Symbol.dispose](): void {
    this.close();
  }
}
