import type { RepositoryIdentity } from "./observation.js";

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
