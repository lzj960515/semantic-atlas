import type {
  EvidenceDisposition,
  HumanCorrection,
  MapContribution,
  MapQueryObservation,
  RepositoryIdentity,
} from "./observation.js";

export interface AccuracyDimensionCounts {
  readonly correct: number;
  readonly incorrect: number;
  readonly notAssessed: number;
}

export interface UpstreamCauseCounts extends AccuracyDimensionCounts {
  readonly notApplicable: number;
}

export interface ImpactCompletenessCounts {
  readonly complete: number;
  readonly incomplete: number;
  readonly notAssessed: number;
}

export interface InsightSummary {
  readonly taskObservations: number;
  readonly reviewObservations: number;
  readonly approvedReviews: number;
  readonly businessBoundary: AccuracyDimensionCounts;
  readonly upstreamCause: UpstreamCauseCounts;
  readonly impactCompleteness: ImpactCompletenessCounts;
  readonly requiredRework: number;
  readonly mapCausedRegressions: number;
  readonly humanCorrections: number;
  readonly recoveries: {
    readonly stale: number;
    readonly missing: number;
    readonly contradicted: number;
  };
}

export interface InsightPeriod {
  readonly duration: string;
  readonly since: string;
}

export interface InsightSummaryResult {
  readonly repository: RepositoryIdentity;
  readonly period?: InsightPeriod;
  readonly summary: InsightSummary;
}

export interface TaskReviewInsight {
  readonly observationId: string;
  readonly recordedAt: string;
  readonly verdict: "approved" | "changes_requested";
  readonly requiredRework: boolean;
  readonly mapCausedRegression: boolean;
  readonly mapContribution?: MapContribution;
}

export interface TaskHumanCorrectionInsight extends HumanCorrection {
  readonly observationId: string;
}

export interface TaskRunInsight {
  readonly observationId: string;
  readonly runId: string;
  readonly recordedAt: string;
  readonly queries: readonly MapQueryObservation[];
  readonly dispositions: readonly EvidenceDisposition[];
  readonly humanCorrections: readonly TaskHumanCorrectionInsight[];
  readonly reviews: readonly TaskReviewInsight[];
}

export interface TaskInsight {
  readonly taskId: string;
  readonly runs: readonly TaskRunInsight[];
}

export interface TaskInsightSummary {
  readonly tasks: number;
  readonly tasksWithContext: number;
  readonly tasksWithReviewedContext: number;
  readonly tasksWithAssessedContext: number;
  readonly tasksWithReview: number;
  readonly tasksWithRework: number;
  readonly tasksWithConfirmedLead: number;
  readonly tasksWithMapRegression: number;
  readonly tasksWithHumanCorrection: number;
}

export interface TaskInsightReport {
  readonly repository: RepositoryIdentity;
  readonly period?: InsightPeriod;
  readonly summary: TaskInsightSummary;
  readonly tasks: readonly TaskInsight[];
}
