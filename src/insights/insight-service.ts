import { t } from "../i18n/index.js";
import type {
  EvidenceDisposition,
  ReviewObservation,
  TaskObservation,
} from "../contracts/observation.js";
import type {
  AccuracyDimensionCounts,
  ImpactCompletenessCounts,
  InsightPeriod,
  InsightSummary,
  InsightSummaryResult,
  TaskInsight,
  TaskInsightReport,
  TaskInsightSummary,
  TaskReviewInsight,
  UpstreamCauseCounts,
} from "../contracts/insights.js";
import { ObservationStore } from "../observations/observation-store.js";
import { RepositoryIdentityResolver } from "../observations/repository-identity.js";

const durationMilliseconds = {
  h: 60 * 60 * 1_000,
  d: 24 * 60 * 60 * 1_000,
  w: 7 * 24 * 60 * 60 * 1_000,
} as const;

export class InvalidInsightPeriodError extends Error {
  public constructor(public readonly period: string) {
    super(t("errors.insightPeriod", { period }));
    this.name = "InvalidInsightPeriodError";
  }
}

export class InsightService {
  public constructor(
    private readonly repositoryResolver: RepositoryIdentityResolver,
    private readonly store: ObservationStore,
  ) {}

  public async summarize(
    repositoryPath: string,
    duration?: string,
    now = new Date(),
  ): Promise<InsightSummaryResult> {
    const repository = (await this.repositoryResolver.resolve(repositoryPath)).identity;
    const period = duration ? resolvePeriod(duration, now) : undefined;
    const observations = await this.store.readAll(repository);
    const tasks = filterByPeriod(observations.tasks, period);
    const reviews = filterByPeriod(observations.reviews, period);

    return {
      repository,
      ...(period ? { period } : {}),
      summary: summarizeObservations(tasks, reviews, observations.tasks),
    };
  }

  public async reportTasks(
    repositoryPath: string,
    duration?: string,
    now = new Date(),
  ): Promise<TaskInsightReport> {
    const repository = (await this.repositoryResolver.resolve(repositoryPath)).identity;
    const period = duration ? resolvePeriod(duration, now) : undefined;
    const observations = await this.store.readAll(repository);
    const selectedTaskIds = new Set(
      filterByPeriod(observations.tasks, period).map(({ task }) => task.taskId),
    );
    const tasks = buildTaskInsights(
      observations.tasks.filter(({ task }) => selectedTaskIds.has(task.taskId)),
      observations.reviews,
    );

    return {
      repository,
      ...(period ? { period } : {}),
      summary: summarizeTasks(tasks),
      tasks,
    };
  }
}

function buildTaskInsights(
  observations: readonly TaskObservation[],
  reviews: readonly ReviewObservation[],
): readonly TaskInsight[] {
  const reviewsByTaskObservation = new Map<string, ReviewObservation[]>();
  for (const review of reviews) {
    const linkedReviews = reviewsByTaskObservation.get(review.taskObservationId) ?? [];
    linkedReviews.push(review);
    reviewsByTaskObservation.set(review.taskObservationId, linkedReviews);
  }

  const observationsByTask = new Map<string, TaskObservation[]>();
  for (const observation of observations) {
    const runs = observationsByTask.get(observation.task.taskId) ?? [];
    runs.push(observation);
    observationsByTask.set(observation.task.taskId, runs);
  }

  return [...observationsByTask.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([taskId, runs]) => ({
      taskId,
      runs: runs.sort(compareObservations).map((run) => {
        const linkedReviews = (reviewsByTaskObservation.get(run.id) ?? []).sort(
          compareObservations,
        );
        return {
          observationId: run.id,
          runId: run.task.runId,
          recordedAt: run.recordedAt,
          queries: run.map.queries,
          dispositions: run.map.dispositions,
          humanCorrections: [
            ...(run.humanCorrection ? [{ observationId: run.id, ...run.humanCorrection }] : []),
            ...linkedReviews.flatMap((review) =>
              review.humanCorrection
                ? [{ observationId: review.id, ...review.humanCorrection }]
                : [],
            ),
          ],
          reviews: linkedReviews.map(toReviewInsight),
        };
      }),
    }));
}

function toReviewInsight(observation: ReviewObservation): TaskReviewInsight {
  return {
    observationId: observation.id,
    recordedAt: observation.recordedAt,
    verdict: observation.review.verdict,
    requiredRework: observation.review.requiredRework,
    mapCausedRegression: observation.review.mapCausedRegression,
    ...(observation.schemaVersion === 2
      ? { mapContribution: observation.review.mapContribution }
      : {}),
  };
}

function summarizeTasks(tasks: readonly TaskInsight[]): TaskInsightSummary {
  return {
    tasks: tasks.length,
    tasksWithContext: tasks.filter((task) => task.runs.some(hasContext)).length,
    tasksWithReviewedContext: tasks.filter((task) =>
      task.runs.some((run) => hasContext(run) && run.reviews.length > 0),
    ).length,
    tasksWithAssessedContext: tasks.filter((task) =>
      task.runs.some(
        (run) =>
          hasContext(run) &&
          run.reviews.some(
            (review) => review.mapContribution && review.mapContribution.status !== "not_assessed",
          ),
      ),
    ).length,
    tasksWithReview: tasks.filter((task) => task.runs.some((run) => run.reviews.length > 0)).length,
    tasksWithRework: tasks.filter((task) =>
      task.runs.some((run) => run.reviews.some((review) => review.requiredRework)),
    ).length,
    tasksWithConfirmedLead: tasks.filter((task) =>
      task.runs.some(
        (run) =>
          hasContext(run) &&
          run.reviews.some((review) => review.mapContribution?.status === "confirmed_lead"),
      ),
    ).length,
    tasksWithMapRegression: tasks.filter((task) =>
      task.runs.some((run) => run.reviews.some((review) => review.mapCausedRegression)),
    ).length,
    tasksWithHumanCorrection: tasks.filter((task) =>
      task.runs.some((run) => run.humanCorrections.length > 0),
    ).length,
  };
}

function hasContext(run: TaskInsight["runs"][number]): boolean {
  return run.queries.some((query) => query.outcome === "context");
}

function compareObservations(
  left: { readonly recordedAt: string; readonly id: string },
  right: { readonly recordedAt: string; readonly id: string },
): number {
  return (
    Date.parse(left.recordedAt) - Date.parse(right.recordedAt) || left.id.localeCompare(right.id)
  );
}

function resolvePeriod(duration: string, now: Date): InsightPeriod {
  const match = /^([1-9][0-9]*)([hdw])$/u.exec(duration);
  const count = Number(match?.[1]);
  const unit = match?.[2] as keyof typeof durationMilliseconds | undefined;
  if (!unit || !Number.isSafeInteger(count)) {
    throw new InvalidInsightPeriodError(duration);
  }
  const since = new Date(now.getTime() - count * durationMilliseconds[unit]);
  return { duration, since: since.toISOString() };
}

function filterByPeriod<TObservation extends { readonly recordedAt: string }>(
  observations: readonly TObservation[],
  period: InsightPeriod | undefined,
): readonly TObservation[] {
  if (!period) return observations;
  const since = Date.parse(period.since);
  return observations.filter(({ recordedAt }) => Date.parse(recordedAt) >= since);
}

function summarizeObservations(
  tasks: readonly TaskObservation[],
  reviews: readonly ReviewObservation[],
  allTasks: readonly TaskObservation[],
): InsightSummary {
  const taskById = new Map(allTasks.map((task) => [task.id, task]));
  const approvedReviews = reviews.filter(({ review }) => review.verdict === "approved");
  const correctedTaskIds = new Set<string>();
  for (const task of tasks) {
    if (task.humanCorrection) correctedTaskIds.add(task.id);
  }
  for (const review of reviews) {
    if (review.humanCorrection) correctedTaskIds.add(review.taskObservationId);
  }

  return {
    taskObservations: tasks.length,
    reviewObservations: reviews.length,
    approvedReviews: approvedReviews.length,
    businessBoundary: countAccuracyDimension(reviews.map(({ review }) => review.businessBoundary)),
    upstreamCause: countUpstreamCause(reviews.map(({ review }) => review.upstreamCause)),
    impactCompleteness: countImpactCompleteness(
      reviews.map(({ review }) => review.impactCompleteness),
    ),
    requiredRework: reviews.filter(({ review }) => review.requiredRework).length,
    mapCausedRegressions: reviews.filter(({ review }) => review.mapCausedRegression).length,
    humanCorrections: correctedTaskIds.size,
    recoveries: countRecoveries(approvedReviews, taskById),
  };
}

function countAccuracyDimension(
  values: readonly ("correct" | "incorrect" | "not_assessed")[],
): AccuracyDimensionCounts {
  return {
    correct: count(values, "correct"),
    incorrect: count(values, "incorrect"),
    notAssessed: count(values, "not_assessed"),
  };
}

function countUpstreamCause(
  values: readonly ("correct" | "incorrect" | "not_applicable" | "not_assessed")[],
): UpstreamCauseCounts {
  return {
    correct: count(values, "correct"),
    incorrect: count(values, "incorrect"),
    notAssessed: count(values, "not_assessed"),
    notApplicable: count(values, "not_applicable"),
  };
}

function countImpactCompleteness(
  values: readonly ("complete" | "incomplete" | "not_assessed")[],
): ImpactCompletenessCounts {
  return {
    complete: count(values, "complete"),
    incomplete: count(values, "incomplete"),
    notAssessed: count(values, "not_assessed"),
  };
}

function countRecoveries(
  approvedReviews: readonly ReviewObservation[],
  taskById: ReadonlyMap<string, TaskObservation>,
): InsightSummary["recoveries"] {
  const recovered = {
    stale: new Set<string>(),
    missing: new Set<string>(),
    contradicted: new Set<string>(),
  };
  for (const review of approvedReviews) {
    const task = taskById.get(review.taskObservationId);
    if (!task) continue;
    for (const disposition of task.map.dispositions) {
      addRecovery(recovered, disposition, task.id);
    }
  }
  return {
    stale: recovered.stale.size,
    missing: recovered.missing.size,
    contradicted: recovered.contradicted.size,
  };
}

function addRecovery(
  recovered: {
    readonly stale: Set<string>;
    readonly missing: Set<string>;
    readonly contradicted: Set<string>;
  },
  disposition: EvidenceDisposition,
  taskObservationId: string,
): void {
  if (
    disposition.status === "stale" ||
    disposition.status === "missing" ||
    disposition.status === "contradicted"
  ) {
    recovered[disposition.status].add(taskObservationId);
  }
}

function count<T>(values: readonly T[], expected: T): number {
  return values.filter((value) => value === expected).length;
}
