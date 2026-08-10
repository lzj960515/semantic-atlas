export interface IndexEntry {
  readonly mode: string;
  readonly objectId: string;
  readonly stage: number;
}

export interface WorktreeContent {
  readonly contentHash: string;
  readonly executable: boolean;
  readonly symbolicLink: boolean;
}

export interface SnapshotFile {
  readonly path: string;
  readonly indexEntries: readonly IndexEntry[];
  readonly worktree: WorktreeContent | null;
}

export interface RepositoryChanges {
  readonly staged: readonly string[];
  readonly unstaged: readonly string[];
  readonly untracked: readonly string[];
}

export interface RepositorySnapshot {
  readonly schemaVersion: 1;
  readonly snapshotId: string;
  readonly repositoryId: string;
  readonly headCommit: string;
  readonly indexVersion: number;
  readonly files: readonly SnapshotFile[];
  readonly changes: RepositoryChanges;
}
