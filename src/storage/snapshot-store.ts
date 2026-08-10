import { homedir } from "node:os";
import { posix, win32 } from "node:path";

import type { GitRepository } from "../repository/types.js";
import type { RepositorySnapshot } from "../snapshots/types.js";
import { AtlasDatabase } from "./atlas-database.js";

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
    const dataDirectory = [environment.LOCALAPPDATA, environment.APPDATA]
      .find((path) => path !== undefined && win32.isAbsolute(path))
      ?? win32.join(homeDirectory, "AppData", "Local");
    return win32.join(dataDirectory, "semantic-atlas");
  }
  if (platform === "darwin") {
    return posix.join(homeDirectory, "Library", "Application Support", "semantic-atlas");
  }
  const xdgDataDirectory = environment.XDG_DATA_HOME;
  const dataDirectory = xdgDataDirectory !== undefined && posix.isAbsolute(xdgDataDirectory)
    ? xdgDataDirectory
    : posix.join(homeDirectory, ".local", "share");
  return posix.join(dataDirectory, "semantic-atlas");
}

export class SnapshotStore implements Disposable {
  readonly databasePath: string;
  readonly #atlasDatabase: AtlasDatabase;
  readonly #repositoryId: string;

  constructor(
    dataDirectory: string,
    repository: GitRepository,
  ) {
    this.#repositoryId = repository.repositoryId;
    this.#atlasDatabase = new AtlasDatabase(dataDirectory, repository);
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
        INSERT INTO repository_snapshots (repository_id, snapshot_id, payload, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (repository_id, snapshot_id) DO NOTHING
      `).run(this.#repositoryId, snapshot.snapshotId, JSON.stringify(snapshot), timestamp);
      database.prepare(`
        UPDATE atlas_repositories
        SET latest_snapshot_id = ?, updated_at = ?
        WHERE repository_id = ?
      `).run(snapshot.snapshotId, timestamp, this.#repositoryId);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  find(snapshotId: string): RepositorySnapshot | undefined {
    const row = this.#atlasDatabase.connection.prepare(`
      SELECT payload
      FROM repository_snapshots
      WHERE repository_id = ? AND snapshot_id = ?
    `).get(this.#repositoryId, snapshotId) as { payload: string } | undefined;
    return row === undefined ? undefined : JSON.parse(row.payload) as RepositorySnapshot;
  }

  latest(): RepositorySnapshot | undefined {
    const row = this.#atlasDatabase.connection.prepare(`
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
    this.#atlasDatabase.close();
  }

  [Symbol.dispose](): void {
    this.close();
  }
}
