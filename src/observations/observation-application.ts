import type { ZodIssue } from "zod";
import {
  reviewObservationInputSchema,
  reviewObservationSchema,
  taskObservationInputSchema,
  taskObservationSchema,
} from "../contracts/observation.js";
import type {
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
