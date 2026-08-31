import type {
  CliError,
  CliErrorEnvelope,
  InsightsSummaryEnvelope,
  ObservationRecordedData,
  ObserveMaintenanceEnvelope,
  ObserveReviewEnvelope,
  ObserveTaskEnvelope,
  StandaloneCliSuccessEnvelope,
} from "../contracts/cli.js";
import {
  InsightService,
  InvalidInsightPeriodError,
} from "../insights/insight-service.js";
import {
  MaintenanceCandidateError,
  ObservationApplication,
  ObservationInputError,
  TaskObservationNotFoundError,
} from "../observations/observation-application.js";
import {
  ObservationConflictError,
  ObservationStorageError,
} from "../observations/observation-store.js";
import { RepositoryIdentityError } from "../observations/repository-identity.js";

export interface ObservationCliRuntime {
  readonly observationApplication: ObservationApplication;
  readonly insightService: InsightService;
  readStandardInput(): Promise<string>;
  now(): Date;
}

export async function runObserveTaskCommand(
  runtime: ObservationCliRuntime,
  repositoryPath: string,
): Promise<ObserveTaskEnvelope> {
  try {
    const input = await readObservationInput(runtime);
    const result = await runtime.observationApplication.recordTask(repositoryPath, input);
    return observationSuccess("observe task", result);
  } catch (error) {
    return observationError("observe task", error);
  }
}

export async function runObserveReviewCommand(
  runtime: ObservationCliRuntime,
  repositoryPath: string,
): Promise<ObserveReviewEnvelope> {
  try {
    const input = await readObservationInput(runtime);
    const result = await runtime.observationApplication.recordReview(repositoryPath, input);
    return observationSuccess("observe review", result);
  } catch (error) {
    return observationError("observe review", error);
  }
}

export async function runObserveMaintenanceCommand(
  runtime: ObservationCliRuntime,
  repositoryPath: string,
): Promise<ObserveMaintenanceEnvelope> {
  try {
    const input = await readObservationInput(runtime);
    const result = await runtime.observationApplication.recordMaintenance(
      repositoryPath,
      input,
    );
    return observationSuccess("observe maintenance", result);
  } catch (error) {
    return observationError("observe maintenance", error);
  }
}

export async function runInsightsSummaryCommand(
  runtime: ObservationCliRuntime,
  options: { readonly repo: string; readonly period?: string },
): Promise<InsightsSummaryEnvelope> {
  try {
    const result = await runtime.insightService.summarize(
      options.repo,
      options.period,
      runtime.now(),
    );
    return {
      schemaVersion: 1,
      ok: true,
      command: "insights summary",
      data: result,
    };
  } catch (error) {
    const cliError = error instanceof InvalidInsightPeriodError
      ? {
          code: "INSIGHTS_PERIOD_INVALID" as const,
          message: error.message,
          period: error.period,
        }
      : repositoryOrStorageError(error, "INSIGHTS_READ_FAILED");
    return {
      schemaVersion: 1,
      ok: false,
      command: "insights summary",
      error: cliError,
    };
  }
}

async function readObservationInput(
  runtime: ObservationCliRuntime,
): Promise<unknown> {
  const input = await runtime.readStandardInput();
  try {
    return JSON.parse(input) as unknown;
  } catch {
    throw new ObservationInputError(
      "Observation stdin must contain one complete JSON object",
    );
  }
}

function observationSuccess<
  TCommand extends "observe task" | "observe review" | "observe maintenance",
>(
  command: TCommand,
  data: ObservationRecordedData,
): StandaloneCliSuccessEnvelope<TCommand, ObservationRecordedData> {
  return {
    schemaVersion: 1,
    ok: true,
    command,
    data,
  };
}

function observationError<
  TCommand extends "observe task" | "observe review" | "observe maintenance",
>(
  command: TCommand,
  error: unknown,
): CliErrorEnvelope<TCommand> {
  let cliError: CliError;
  if (error instanceof ObservationInputError) {
    cliError = {
      code: "OBSERVATION_INPUT_INVALID",
      message: error.message,
      issues: error.issues,
    };
  } else if (error instanceof ObservationConflictError) {
    cliError = {
      code: "OBSERVATION_CONFLICT",
      message: error.message,
      observationId: error.id,
    };
  } else if (error instanceof TaskObservationNotFoundError) {
    cliError = {
      code: "TASK_OBSERVATION_NOT_FOUND",
      message: error.message,
      taskObservationId: error.taskObservationId,
    };
  } else if (error instanceof MaintenanceCandidateError) {
    cliError = {
      code: "MAINTENANCE_CANDIDATE_INVALID",
      message: error.message,
      taskObservationId: error.taskObservationId,
      candidateIndex: error.candidateIndex,
    };
  } else {
    cliError = repositoryOrStorageError(error, "OBSERVATION_STORAGE_FAILED");
  }
  return {
    schemaVersion: 1,
    ok: false,
    command,
    error: cliError,
  };
}

function repositoryOrStorageError(
  error: unknown,
  fallbackCode: "OBSERVATION_STORAGE_FAILED" | "INSIGHTS_READ_FAILED",
): Extract<
  CliError,
  { readonly code: "REPOSITORY_INVALID" | typeof fallbackCode }
> {
  if (error instanceof RepositoryIdentityError) {
    return {
      code: "REPOSITORY_INVALID",
      message: error.message,
    };
  }
  return {
    code: fallbackCode,
    message: error instanceof ObservationStorageError
      ? error.message
      : errorMessage(error),
  } as Extract<
    CliError,
    { readonly code: "REPOSITORY_INVALID" | typeof fallbackCode }
  >;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected observation failure";
}
