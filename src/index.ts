export {
  discoverTargetSources,
  inspectGitRepository,
  isTargetSource,
  readCurrentHead,
} from "./repository/repository-inspector.js";
export type { GitRepository } from "./repository/types.js";
export { createRepositorySnapshot } from "./snapshots/repository-snapshot.js";
export type {
  RepositoryChanges,
  RepositorySnapshot,
  SnapshotFile,
} from "./snapshots/types.js";
export { resolveAtlasDataDirectory, SnapshotStore } from "./storage/snapshot-store.js";
