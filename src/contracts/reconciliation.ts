import type {
  EvidenceReference,
  MapUpdateCandidate,
  ReviewObservation,
  TaskObservation,
} from "./observation.js";

export interface ReconciliationReviewOrigin {
  readonly reviewObservationId: string;
  readonly recordedAt: string;
  readonly review: ReviewObservation["review"];
  readonly humanCorrection?: ReviewObservation["humanCorrection"];
}

export interface ReconciliationCandidateOrigin {
  readonly taskObservationId: string;
  readonly candidateIndex: number;
  readonly recordedAt: string;
  readonly task: TaskObservation["task"];
  readonly map: TaskObservation["map"];
  readonly disposition: MapUpdateCandidate["disposition"];
  readonly evidence: readonly EvidenceReference[];
  readonly humanCorrection?: TaskObservation["humanCorrection"];
  readonly reviews: readonly ReconciliationReviewOrigin[];
}

export interface ReconciliationCandidateGroup {
  readonly kind: MapUpdateCandidate["kind"];
  readonly summary: string;
  readonly duplicate: boolean;
  readonly origins: readonly ReconciliationCandidateOrigin[];
}

export interface ReconciliationDomainGroup {
  readonly businessDomainId: string;
  readonly candidates: readonly ReconciliationCandidateGroup[];
}

export interface ReconciliationSummary {
  readonly businessDomains: number;
  readonly candidateGroups: number;
  readonly candidateOccurrences: number;
  readonly duplicateGroups: number;
}

export interface ReconciliationCandidateReport {
  readonly repository: TaskObservation["repository"];
  readonly summary: ReconciliationSummary;
  readonly domains: readonly ReconciliationDomainGroup[];
}
