import type { ZodIssue } from "zod";
import {
  maintenanceObservationInputSchema,
  maintenanceObservationSchema,
  reviewObservationInputSchema,
  reviewObservationSchema,
  taskObservationInputSchema,
  taskObservationSchema,
} from "../contracts/observation.js";
import type {
  MaintenanceObservation,
  ReviewObservation,
  TaskObservation,
} from "../contracts/observation.js";
import type { ObservationWriteResult } from "./observation-store.js";
import { ObservationStore } from "./observation-store.js";
import { RepositoryIdentityResolver } from "./repository-identity.js";

export interface ObservationValidationIssue {
  readonly path: string;
  readonly message: string;
}

export class ObservationInputError extends Error {
  public readonly issues: readonly ObservationValidationIssue[];

  public constructor(message: string, issues: readonly ObservationValidationIssue[] = []) {
    super(message);
    this.name = "ObservationInputError";
    this.issues = issues;
  }
}

export class TaskObservationNotFoundError extends Error {
  public constructor(public readonly taskObservationId: string) {
    super(`Task observation '${taskObservationId}' does not exist in this repository`);
    this.name = "TaskObservationNotFoundError";
  }
}

export class MaintenanceCandidateError extends Error {
  public constructor(
    message: string,
    public readonly taskObservationId: string,
    public readonly candidateIndex: number,
  ) {
    super(message);
    this.name = "MaintenanceCandidateError";
  }
}

export class ObservationApplication {
  public constructor(
    private readonly repositoryResolver: RepositoryIdentityResolver,
    private readonly store: ObservationStore,
  ) {}

  public async recordTask(
    repositoryPath: string,
    input: unknown,
  ): Promise<ObservationWriteResult> {
    const parsedInput = taskObservationInputSchema.safeParse(input);
    if (!parsedInput.success) {
      throw inputError("Task observation input is invalid", parsedInput.error.issues);
    }

    const repository = (await this.repositoryResolver.resolve(repositoryPath)).identity;
    const observation = taskObservationSchema.parse({
      ...parsedInput.data,
      repository,
    }) satisfies TaskObservation;
    return this.store.writeTask(observation);
  }

  public async recordReview(
    repositoryPath: string,
    input: unknown,
  ): Promise<ObservationWriteResult> {
    const parsedInput = reviewObservationInputSchema.safeParse(input);
    if (!parsedInput.success) {
      throw inputError("Review observation input is invalid", parsedInput.error.issues);
    }

    const repository = (await this.repositoryResolver.resolve(repositoryPath)).identity;
    const taskObservation = await this.store.readTask(
      repository,
      parsedInput.data.taskObservationId,
    );
    if (!taskObservation) {
      throw new TaskObservationNotFoundError(parsedInput.data.taskObservationId);
    }

    const observation = reviewObservationSchema.parse({
      ...parsedInput.data,
      repository,
    }) satisfies ReviewObservation;
    return this.store.writeReview(observation);
  }

  public async recordMaintenance(
    repositoryPath: string,
    input: unknown,
  ): Promise<ObservationWriteResult> {
    const parsedInput = maintenanceObservationInputSchema.safeParse(input);
    if (!parsedInput.success) {
      throw inputError("Maintenance observation input is invalid", parsedInput.error.issues);
    }

    const repository = (await this.repositoryResolver.resolve(repositoryPath)).identity;
    for (const result of parsedInput.data.results) {
      const { taskObservationId, candidateIndex } = result.candidate;
      const taskObservation = await this.store.readTask(repository, taskObservationId);
      const candidate = taskObservation?.mapUpdateCandidates[candidateIndex];
      if (!candidate) {
        throw new MaintenanceCandidateError(
          `Candidate '${taskObservationId}:${candidateIndex}' does not exist in this repository`,
          taskObservationId,
          candidateIndex,
        );
      }
      if (candidate.businessDomainId !== parsedInput.data.businessDomainId) {
        throw new MaintenanceCandidateError(
          `Candidate '${taskObservationId}:${candidateIndex}' belongs to business domain '${candidate.businessDomainId}'`,
          taskObservationId,
          candidateIndex,
        );
      }
    }

    const observation = maintenanceObservationSchema.parse({
      ...parsedInput.data,
      repository,
    }) satisfies MaintenanceObservation;
    return this.store.writeMaintenance(observation);
  }
}

function inputError(message: string, issues: readonly ZodIssue[]): ObservationInputError {
  return new ObservationInputError(
    message,
    issues.map((issue) => ({
      path: issue.path.map(String).join("."),
      message: issue.message,
    })),
  );
}
