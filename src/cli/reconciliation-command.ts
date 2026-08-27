import type { ReconciliationCandidatesEnvelope } from "../contracts/cli.js";
import { ObservationStorageError } from "../observations/observation-store.js";
import { RepositoryIdentityError } from "../observations/repository-identity.js";
import { ReconciliationService } from "../reconciliation/reconciliation-service.js";

export interface ReconciliationCliRuntime {
  readonly reconciliationService: ReconciliationService;
}

export async function runReconciliationCandidatesCommand(
  runtime: ReconciliationCliRuntime,
  repositoryPath: string,
): Promise<ReconciliationCandidatesEnvelope> {
  try {
    return {
      schemaVersion: 1,
      ok: true,
      command: "reconcile candidates",
      data: await runtime.reconciliationService.listCandidates(repositoryPath),
    };
  } catch (error) {
    const cliError = error instanceof RepositoryIdentityError
      ? { code: "REPOSITORY_INVALID" as const, message: error.message }
      : {
          code: "RECONCILIATION_READ_FAILED" as const,
          message: error instanceof ObservationStorageError
            ? error.message
            : errorMessage(error),
        };
    return {
      schemaVersion: 1,
      ok: false,
      command: "reconcile candidates",
      error: cliError,
    };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected reconciliation failure";
}
