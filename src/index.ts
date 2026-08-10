export {
  CURRENT_ATLAS_SCHEMA_VERSION,
  GraphStore,
} from "./graph/graph-store.js";
export type * from "./graph/types.js";
export {
  BusinessKnowledgeService,
  GraphPatchConflictError,
} from "./knowledge/business-knowledge-service.js";
export type { AppliedGraphPatch } from "./knowledge/business-knowledge-service.js";
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
