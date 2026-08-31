import type {
  EvidenceReference,
  MaintenanceObservation,
  MaintenanceResult,
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
  readonly maintenanceHistory: readonly ReconciliationMaintenanceOrigin[];
}

export interface ReconciliationMaintenanceOrigin {
  readonly maintenanceObservationId: string;
  readonly recordedAt: string;
  readonly maintenance: MaintenanceObservation["maintenance"];
  readonly status: MaintenanceResult["status"];
  readonly reason: string;
  readonly evidence: readonly EvidenceReference[];
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
  readonly waitingForEvidenceOccurrences: number;
}

export interface ReconciliationCandidateReport {
  readonly repository: TaskObservation["repository"];
  readonly summary: ReconciliationSummary;
  readonly domains: readonly ReconciliationDomainGroup[];
}
