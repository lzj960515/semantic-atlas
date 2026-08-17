import { randomUUID } from "node:crypto";
import { lstat, rename, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { isSupportedSource, inspectGitRepository } from "../repository/repository-inspector.js";
import type { GitRepository } from "../repository/types.js";
import type { RepositorySnapshot } from "../snapshots/types.js";
import { AtlasDatabase } from "../storage/atlas-database.js";
import { CodeGraphStructuralBackend } from "./codegraph-backend.js";
import { backupSqliteDatabase } from "./structural-publication.js";
import { StructuralWriteLock } from "./structural-write-lock.js";
import { STRUCTURAL_BACKEND_VERSION } from "./types.js";

const ATLAS_DIRECTORY = ".atlas";
const CODEGRAPH_DATABASE = "codegraph.db";
const ATLAS_WRITE_LOCK = "semantic-atlas.lock";
const CODEGRAPH_DIRECTORY_ENVIRONMENT = "CODEGRAPH_DIR";
const require = createRequire(import.meta.url);

interface BootstrapCandidate {
  readonly repository: GitRepository;
  readonly snapshot: RepositorySnapshot;
  readonly backendVersion: string;
  readonly extractionVersion: number;
  readonly publishedAt: string;
}

interface IndexedSourceRow {
  readonly path: string;
  readonly content_hash: string;
  readonly errors: string | null;
}

export class StructuralProjectionBootstrapper {
  readonly #repository: GitRepository;
  readonly #databasePath: string;

  constructor(repository: GitRepository) {
    this.#repository = repository;
    this.#databasePath = join(repository.worktreeRoot, ATLAS_DIRECTORY, CODEGRAPH_DATABASE);
  }

  async bootstrap(currentSnapshot: RepositorySnapshot): Promise<boolean> {
    if (await pathExists(this.#databasePath)) {
      return false;
    }
    const candidates = await this.findCandidates(currentSnapshot.snapshotId);
    for (const candidate of candidates) {
      if (await this.restoreCandidate(candidate)) {
        return true;
      }
    }
    return false;
  }

  private async findCandidates(currentSnapshotId: string): Promise<BootstrapCandidate[]> {
    using atlas = new AtlasDatabase(this.#repository);
    const candidates: BootstrapCandidate[] = [];
    for (const worktreeRoot of this.#repository.worktreeRoots) {
      if (resolve(worktreeRoot) === resolve(this.#repository.worktreeRoot)) {
        continue;
      }
      try {
        const repository = await inspectGitRepository(worktreeRoot);
        if (repository.repositoryId !== this.#repository.repositoryId) {
          continue;
        }
        const row = atlas.connection.prepare(`
          SELECT
            state.current_snapshot_id,
            state.backend_version,
            state.extraction_version,
            state.published_at,
            snapshot.payload
          FROM atlas_worktree_states AS state
          JOIN atlas_repository_snapshots AS snapshot
            ON snapshot.repository_id = state.repository_id
            AND snapshot.snapshot_id = state.current_snapshot_id
          WHERE state.repository_id = ?
            AND state.git_directory = ?
            AND state.status = 'current'
        `).get(this.#repository.repositoryId, repository.gitDirectory) as {
          current_snapshot_id: string;
          backend_version: string | null;
          extraction_version: number | null;
          published_at: string | null;
          payload: string;
        } | undefined;
        if (
          row === undefined
          || row.backend_version !== STRUCTURAL_BACKEND_VERSION
          || row.extraction_version === null
          || row.published_at === null
        ) {
          continue;
        }
        candidates.push({
          repository,
          snapshot: JSON.parse(row.payload) as RepositorySnapshot,
          backendVersion: row.backend_version,
          extractionVersion: row.extraction_version,
          publishedAt: row.published_at,
        });
      } catch {
        continue;
      }
    }
    return candidates.sort((left, right) => (
      Number(right.snapshot.snapshotId === currentSnapshotId)
        - Number(left.snapshot.snapshotId === currentSnapshotId)
      || right.publishedAt.localeCompare(left.publishedAt)
      || normalizePath(left.repository.worktreeRoot)
        .localeCompare(normalizePath(right.repository.worktreeRoot))
    ));
  }

  private async restoreCandidate(candidate: BootstrapCandidate): Promise<boolean> {
    const sourceDatabase = join(candidate.repository.worktreeRoot, ATLAS_DIRECTORY, CODEGRAPH_DATABASE);
    const sourceLockPath = join(candidate.repository.worktreeRoot, ATLAS_DIRECTORY, ATLAS_WRITE_LOCK);
    let sourceLock;
    try {
      sourceLock = StructuralWriteLock.acquire(sourceLockPath);
    } catch {
      return false;
    }
    if (sourceLock === undefined) {
      return false;
    }
    const stagingPath = join(
      this.#repository.worktreeRoot,
      ATLAS_DIRECTORY,
      `.codegraph-bootstrap-${randomUUID()}.db`,
    );
    try {
      await requireOrdinaryDatabase(sourceDatabase);
      if (!projectionMatchesSnapshot(
        sourceDatabase,
        candidate.snapshot,
        candidate.backendVersion,
        candidate.extractionVersion,
      ) || !await usesCurrentExtraction(candidate.repository)) {
        return false;
      }
      await new CodeGraphStructuralBackend(this.#repository).prepareStorageForBootstrap();
      if (await pathExists(this.#databasePath)) {
        return false;
      }
      await backupSqliteDatabase(sourceDatabase, stagingPath);
      if (!projectionMatchesSnapshot(
        stagingPath,
        candidate.snapshot,
        candidate.backendVersion,
        candidate.extractionVersion,
      )) {
        return false;
      }
      await rename(stagingPath, this.#databasePath);
      return true;
    } catch {
      return false;
    } finally {
      sourceLock.release();
      await rm(stagingPath, { force: true }).catch(() => undefined);
    }
  }
}

async function usesCurrentExtraction(repository: GitRepository): Promise<boolean> {
  const sdk = require("@colbymchenry/codegraph") as typeof import("@colbymchenry/codegraph");
  let graph: import("@colbymchenry/codegraph").CodeGraph | undefined;
  const originalDirectory = process.env[CODEGRAPH_DIRECTORY_ENVIRONMENT];
  process.env[CODEGRAPH_DIRECTORY_ENVIRONMENT] = ATLAS_DIRECTORY;
  try {
    graph = await sdk.CodeGraph.open(repository.worktreeRoot, {
      sync: false,
      readOnly: true,
    });
    return !graph.isIndexStale();
  } catch {
    return false;
  } finally {
    graph?.close();
    if (originalDirectory === undefined) {
      delete process.env[CODEGRAPH_DIRECTORY_ENVIRONMENT];
    } else {
      process.env[CODEGRAPH_DIRECTORY_ENVIRONMENT] = originalDirectory;
    }
  }
}

function projectionMatchesSnapshot(
  databasePath: string,
  snapshot: RepositorySnapshot,
  backendVersion: string,
  extractionVersion: number,
): boolean {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const integrity = database.prepare("PRAGMA integrity_check").get() as {
      integrity_check?: unknown;
    } | undefined;
    if (integrity?.integrity_check !== "ok") {
      return false;
    }
    const atlasObjects = database.prepare(`
      SELECT COUNT(*) AS count
      FROM sqlite_schema
      WHERE name LIKE 'atlas\\_%' ESCAPE '\\'
    `).get() as { count: number };
    if (atlasObjects.count !== 0) {
      return false;
    }
    const metadata = new Map((database.prepare(`
      SELECT key, value
      FROM project_metadata
      WHERE key IN (
        'index_state',
        'indexed_with_version',
        'indexed_with_extraction_version',
        'index_files_discovered',
        'index_files_accounted'
      )
    `).all() as unknown as { key: string; value: string }[])
      .map(({ key, value }) => [key, value]));
    if (
      metadata.get("index_state") !== "complete"
      || metadata.get("indexed_with_version") !== backendVersion
      || Number(metadata.get("indexed_with_extraction_version")) !== extractionVersion
      || metadata.get("index_files_discovered") !== metadata.get("index_files_accounted")
    ) {
      return false;
    }

    const indexedSources = database.prepare(`
      SELECT path, content_hash, errors
      FROM files
      ORDER BY path
    `).all() as unknown as IndexedSourceRow[];
    if (indexedSources.some(({ errors }) => errors !== null && errors !== "[]")) {
      return false;
    }
    const indexedHashes = new Map(indexedSources.map((source) => [
      normalizeRepositoryPath(source.path),
      source.content_hash,
    ]));
    const snapshotHashes = new Map(snapshot.files.flatMap((file) => (
      isSupportedSource(file.path) && file.worktree !== null
        ? [[normalizeRepositoryPath(file.path), file.worktree.contentHash] as const]
        : []
    )));
    return [...snapshotHashes].every(([path, hash]) => indexedHashes.get(path) === hash)
      && [...indexedHashes.keys()].every((path) => (
        !isSupportedSource(path) || snapshotHashes.has(path)
      ));
  } catch {
    return false;
  } finally {
    database.close();
  }
}

async function requireOrdinaryDatabase(databasePath: string): Promise<void> {
  const metadata = await lstat(databasePath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error("A bootstrap source must be a regular CodeGraph database");
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function normalizeRepositoryPath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//u, "");
}

function normalizePath(path: string): string {
  const normalized = resolve(path).replaceAll("\\", "/");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}
