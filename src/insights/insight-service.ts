import type {
  EvidenceDisposition,
  ReviewObservation,
  StoredTaskObservation,
} from "../contracts/observation.js";
import type {
  AccuracyDimensionCounts,
  ImpactCompletenessCounts,
  InsightPeriod,
  InsightSummary,
  InsightSummaryResult,
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
    super(`Insights period '${period}' must use a positive number followed by h, d, or w`);
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
  tasks: readonly StoredTaskObservation[],
  reviews: readonly ReviewObservation[],
  allTasks: readonly StoredTaskObservation[],
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
    businessBoundary: countAccuracyDimension(
      reviews.map(({ review }) => review.businessBoundary),
    ),
    upstreamCause: countUpstreamCause(
      reviews.map(({ review }) => review.upstreamCause),
    ),
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
  taskById: ReadonlyMap<string, StoredTaskObservation>,
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
    disposition.status === "stale"
    || disposition.status === "missing"
    || disposition.status === "contradicted"
  ) {
    recovered[disposition.status].add(taskObservationId);
  }
}

function count<T>(values: readonly T[], expected: T): number {
  return values.filter((value) => value === expected).length;
}
