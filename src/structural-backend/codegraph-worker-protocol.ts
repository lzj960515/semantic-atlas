import type { GRAPH_PATCH_BASE_SNAPSHOT_MISMATCH } from "../knowledge/graph-patch-conflict-error.js";
import type { GitRepository } from "../repository/types.js";
import type {
  StructuralReference,
  StructuralSearchQuery,
  StructuralTraversalQuery,
} from "./types.js";

export type CodeGraphWorkerRequest =
  | WorkerRequest<"inspect">
  | WorkerRequest<"build">
  | WorkerRequest<"sync">
  | WorkerRequest<"search", StructuralSearchQuery>
  | WorkerRequest<"getNode", StructuralReference>
  | WorkerRequest<"traverse", StructuralTraversalQuery>
  | WorkerRequest<"getCallers", StructuralReference>
  | WorkerRequest<"getCallees", StructuralReference>
  | WorkerRequest<"getFileDependencies", string>
  | WorkerRequest<"worldBuild">
  | WorkerRequest<"worldSync">
  | WorkerRequest<"learn", unknown>;

type WorkerRequest<Operation extends string, Input = undefined> = {
  readonly operation: Operation;
  readonly repository: GitRepository;
} & (Input extends undefined ? { readonly input?: never } : { readonly input: Input });

export type CodeGraphWorkerResponse =
  | { readonly ok: true; readonly value: unknown }
  | {
    readonly ok: false;
    readonly error: CodeGraphWorkerError;
  };

export type CodeGraphWorkerError = {
  readonly name: string;
  readonly message: string;
  readonly code?: string;
  readonly stack?: string;
  readonly baseSnapshotId?: string;
  readonly currentSnapshotId?: string;
};

export type GraphPatchConflictWorkerError = CodeGraphWorkerError & {
  readonly name: "GraphPatchConflictError";
  readonly code: typeof GRAPH_PATCH_BASE_SNAPSHOT_MISMATCH;
  readonly baseSnapshotId: string;
  readonly currentSnapshotId: string;
};
