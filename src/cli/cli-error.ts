import { GraphPatchConflictError } from "../knowledge/graph-patch-conflict-error.js";
import { StructuralBackendError } from "../structural-backend/types.js";
import type { CliCommandName } from "./types.js";

export class CliError extends Error {
  constructor(
    readonly exitCode: number,
    readonly code: string,
    message: string,
    readonly command: CliCommandName | null,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "CliError";
  }
}

export function invalidInput(
  message: string,
  command: CliCommandName | null,
  details?: unknown,
): CliError {
  return new CliError(2, "INVALID_INPUT", message, command, details);
}

export function classifyCliError(
  error: unknown,
  command: CliCommandName | null,
): CliError {
  if (error instanceof CliError) {
    return error;
  }
  if (error instanceof GraphPatchConflictError) {
    return new CliError(5, error.code, error.message, command, {
      baseSnapshotId: error.baseSnapshotId,
      currentSnapshotId: error.currentSnapshotId,
    });
  }
  if (error instanceof StructuralBackendError) {
    if (command === "learn" && error.code === "STRUCTURAL_QUERY_FAILED") {
      return new CliError(5, "GRAPH_PATCH_REJECTED", error.message, command);
    }
    const missing = error.code === "STRUCTURAL_INDEX_MISSING";
    return new CliError(
      4,
      missing ? "ATLAS_STATE_MISSING" : "ATLAS_STATE_STALE",
      error.message,
      command,
    );
  }
  if (command === "learn") {
    return new CliError(
      5,
      "GRAPH_PATCH_REJECTED",
      errorMessage(error),
      command,
    );
  }
  return new CliError(1, "INTERNAL_ERROR", "Semantic Atlas failed unexpectedly.", command);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
