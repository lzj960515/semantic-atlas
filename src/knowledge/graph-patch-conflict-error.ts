export const GRAPH_PATCH_BASE_SNAPSHOT_MISMATCH = "BASE_SNAPSHOT_MISMATCH";

export class GraphPatchConflictError extends Error {
  readonly code = GRAPH_PATCH_BASE_SNAPSHOT_MISMATCH;

  constructor(
    readonly baseSnapshotId: string,
    readonly currentSnapshotId: string,
  ) {
    super(
      `GraphPatch base snapshot ${baseSnapshotId} does not match current snapshot ${currentSnapshotId}`,
    );
    this.name = "GraphPatchConflictError";
  }
}
