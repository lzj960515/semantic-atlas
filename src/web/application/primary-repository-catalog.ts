import { createRequire } from "node:module";
import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import type { DatabaseSync as NodeDatabaseSync } from "node:sqlite";

import {
  inspectGitRepository,
  readCurrentBranch,
} from "../../repository/repository-inspector.js";
import type { GitRepository } from "../../repository/types.js";
import { createRepositorySnapshot } from "../../snapshots/repository-snapshot.js";
import type { RepositorySnapshot } from "../../snapshots/types.js";
import {
  CURRENT_ATLAS_SCHEMA_VERSION,
  resolveExistingAtlasHome,
} from "../../storage/atlas-database.js";
import type {
  WebProjectBranch,
  WebProjectFreshness,
  WebProjectSummary,
} from "./types.js";

const REPOSITORY_ID_PATTERN = /^[0-9a-f]{64}$/u;
const require = createRequire(import.meta.url);
type DatabaseSyncConstructor = new (
  path: string,
  options?: { readonly readOnly?: boolean },
) => NodeDatabaseSync;

interface PrimaryStateRow {
  readonly repository_id: string;
  readonly common_git_directory: string;
  readonly git_directory: string;
  readonly worktree_root: string;
  readonly status: WebProjectSummary["status"];
  readonly current_snapshot_id: string | null;
  readonly snapshot_payload: string | null;
}

export interface PrimaryRepositoryProject {
  readonly repository: GitRepository;
  readonly currentSnapshot: RepositorySnapshot;
  readonly summary: WebProjectSummary;
}

export class PrimaryRepositoryCatalog {
  async listProjects(): Promise<readonly WebProjectSummary[]> {
    return (await this.discoverProjects()).map(({ summary }) => summary);
  }

  async findProject(repositoryId: string): Promise<PrimaryRepositoryProject | undefined> {
    if (!REPOSITORY_ID_PATTERN.test(repositoryId)) {
      return undefined;
    }
    return (await this.discoverProjects(repositoryId))[0];
  }

  private async discoverProjects(
    requestedRepositoryId?: string,
  ): Promise<PrimaryRepositoryProject[]> {
    const atlasHome = resolveExistingAtlasHome();
    if (atlasHome === null) {
      return [];
    }
    const repositoriesDirectory = join(atlasHome, "repositories");
    let entries;
    try {
      entries = await readdir(repositoriesDirectory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }

    const repositoryIds = entries
      .filter((entry) => entry.isDirectory() && REPOSITORY_ID_PATTERN.test(entry.name))
      .map((entry) => entry.name)
      .filter((repositoryId) => (
        requestedRepositoryId === undefined || repositoryId === requestedRepositoryId
      ))
      .sort();
    const projects = (await Promise.all(repositoryIds.map(async (repositoryId) => (
      this.inspectStoredRepository(repositoriesDirectory, repositoryId)
    )))).filter((project): project is PrimaryRepositoryProject => project !== undefined);

    return projects.sort((left, right) => (
      left.summary.name.localeCompare(right.summary.name)
      || left.summary.root.localeCompare(right.summary.root)
    ));
  }

  private async inspectStoredRepository(
    repositoriesDirectory: string,
    repositoryId: string,
  ): Promise<PrimaryRepositoryProject | undefined> {
    const databasePath = join(repositoriesDirectory, repositoryId, "atlas.db");
    let storedState: PrimaryStateRow | undefined;
    try {
      const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: DatabaseSyncConstructor };
      using database = new DatabaseSync(databasePath, { readOnly: true });
      const schema = database.prepare(`
        SELECT version
        FROM atlas_schema
        WHERE singleton = 1
      `).get() as { readonly version: number } | undefined;
      if (schema?.version !== CURRENT_ATLAS_SCHEMA_VERSION) {
        return undefined;
      }
      storedState = database.prepare(`
        SELECT
          repository.repository_id,
          repository.common_git_directory,
          worktree.git_directory,
          worktree.worktree_root,
          worktree.status,
          worktree.current_snapshot_id,
          snapshot.payload AS snapshot_payload
        FROM atlas_repositories AS repository
        JOIN atlas_worktree_states AS worktree
          ON worktree.repository_id = repository.repository_id
          AND worktree.git_directory = repository.common_git_directory
        LEFT JOIN atlas_repository_snapshots AS snapshot
          ON snapshot.repository_id = worktree.repository_id
          AND snapshot.snapshot_id = worktree.current_snapshot_id
        WHERE repository.repository_id = ?
      `).get(repositoryId) as PrimaryStateRow | undefined;
    } catch {
      return undefined;
    }
    if (storedState === undefined) {
      return undefined;
    }

    try {
      const repository = await inspectGitRepository(storedState.worktree_root);
      if (
        repository.repositoryId !== storedState.repository_id
        || repository.gitDirectory !== repository.commonGitDirectory
        || repository.gitDirectory !== storedState.git_directory
        || repository.commonGitDirectory !== storedState.common_git_directory
      ) {
        return undefined;
      }
      const branch = await readCurrentBranch(repository);
      if (!isPrimaryBranch(branch)) {
        return undefined;
      }
      const currentSnapshot = await createRepositorySnapshot(repository);
      const publishedSnapshot = parsePublishedSnapshot(storedState.snapshot_payload);
      const freshness = projectFreshness(storedState, currentSnapshot, publishedSnapshot);
      return {
        repository,
        currentSnapshot,
        summary: {
          id: repository.repositoryId,
          name: basename(repository.worktreeRoot),
          root: repository.worktreeRoot,
          branch,
          headCommit: currentSnapshot.headCommit,
          snapshotId: storedState.current_snapshot_id,
          freshness,
          status: storedState.status,
        },
      };
    } catch {
      return undefined;
    }
  }
}

function isPrimaryBranch(branch: string | null): branch is WebProjectBranch {
  return branch === "main" || branch === "master";
}

function parsePublishedSnapshot(payload: string | null): RepositorySnapshot | null {
  if (payload === null) {
    return null;
  }
  try {
    return JSON.parse(payload) as RepositorySnapshot;
  } catch {
    return null;
  }
}

function projectFreshness(
  storedState: PrimaryStateRow,
  currentSnapshot: RepositorySnapshot,
  publishedSnapshot: RepositorySnapshot | null,
): WebProjectFreshness {
  if (storedState.current_snapshot_id === null) {
    return "missing";
  }
  if (storedState.status !== "current" || publishedSnapshot === null) {
    return "stale";
  }
  return publishedSnapshot.snapshotId === currentSnapshot.snapshotId ? "current" : "stale";
}
