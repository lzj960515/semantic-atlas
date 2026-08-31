import type {
  ReconciliationCandidateGroup,
  ReconciliationCandidateOrigin,
  ReconciliationCandidateReport,
  ReconciliationDomainGroup,
  ReconciliationMaintenanceOrigin,
  ReconciliationReviewOrigin,
} from "../contracts/reconciliation.js";
import type {
  MaintenanceObservation,
  ReviewObservation,
  TaskObservation,
} from "../contracts/observation.js";
import { ObservationStore } from "../observations/observation-store.js";
import { RepositoryIdentityResolver } from "../observations/repository-identity.js";

interface CandidateAccumulator {
  readonly businessDomainId: string;
  readonly kind: ReconciliationCandidateGroup["kind"];
  readonly summary: string;
  readonly origins: ReconciliationCandidateOrigin[];
}

export class ReconciliationService {
  public constructor(
    private readonly repositoryResolver: RepositoryIdentityResolver,
    private readonly store: ObservationStore,
  ) {}

  public async listCandidates(
    repositoryPath: string,
  ): Promise<ReconciliationCandidateReport> {
    const repository = (await this.repositoryResolver.resolve(repositoryPath)).identity;
    const observations = await this.store.readAll(repository);
    const reviewsByTask = groupReviewsByTask(observations.reviews);
    const maintenanceByCandidate = groupMaintenanceByCandidate(
      observations.maintenances,
    );
    const groupedCandidates = groupCandidates(
      observations.tasks,
      reviewsByTask,
      maintenanceByCandidate,
    );
    const candidates = groupedCandidates.actionable;
    const domains = groupByDomain(candidates);
    const candidateGroups = domains.reduce(
      (total, domain) => total + domain.candidates.length,
      0,
    );
    const candidateOccurrences = candidates.reduce(
      (total, candidate) => total + candidate.origins.length,
      0,
    );

    return {
      repository,
      summary: {
        businessDomains: domains.length,
        candidateGroups,
        candidateOccurrences,
        duplicateGroups: candidates.filter(({ origins }) => origins.length > 1).length,
        waitingForEvidenceOccurrences: groupedCandidates.waitingForEvidenceOccurrences,
      },
      domains,
    };
  }
}

function groupReviewsByTask(
  reviews: readonly ReviewObservation[],
): ReadonlyMap<string, readonly ReconciliationReviewOrigin[]> {
  const grouped = new Map<string, ReconciliationReviewOrigin[]>();
  for (const observation of reviews) {
    const taskReviews = grouped.get(observation.taskObservationId) ?? [];
    taskReviews.push({
      reviewObservationId: observation.id,
      recordedAt: observation.recordedAt,
      review: observation.review,
      ...(observation.humanCorrection
        ? { humanCorrection: observation.humanCorrection }
        : {}),
    });
    grouped.set(observation.taskObservationId, taskReviews);
  }
  for (const taskReviews of grouped.values()) {
    taskReviews.sort((left, right) =>
      compareText(left.reviewObservationId, right.reviewObservationId)
    );
  }
  return grouped;
}

function groupCandidates(
  tasks: readonly TaskObservation[],
  reviewsByTask: ReadonlyMap<string, readonly ReconciliationReviewOrigin[]>,
  maintenanceByCandidate: ReadonlyMap<
    string,
    readonly ReconciliationMaintenanceOrigin[]
  >,
): {
  readonly actionable: readonly CandidateAccumulator[];
  readonly waitingForEvidenceOccurrences: number;
} {
  const grouped = new Map<string, CandidateAccumulator>();
  for (const task of tasks) {
    task.mapUpdateCandidates.forEach((candidate, candidateIndex) => {
      const maintenanceHistory = maintenanceByCandidate.get(
        candidateOriginKey(task.id, candidateIndex),
      ) ?? [];
      if (maintenanceHistory.some(({ status }) => status !== "unresolved")) {
        return;
      }
      const key = candidateKey(candidate.businessDomainId, candidate.kind, candidate.summary);
      const current = grouped.get(key) ?? {
        businessDomainId: candidate.businessDomainId,
        kind: candidate.kind,
        summary: candidate.summary,
        origins: [],
      };
      current.origins.push({
        taskObservationId: task.id,
        candidateIndex,
        recordedAt: task.recordedAt,
        task: task.task,
        map: task.map,
        disposition: candidate.disposition,
        evidence: candidate.evidence,
        ...(task.humanCorrection ? { humanCorrection: task.humanCorrection } : {}),
        reviews: reviewsByTask.get(task.id) ?? [],
        maintenanceHistory,
      });
      grouped.set(key, current);
    });
  }

  const candidates = [...grouped.values()];
  for (const candidate of candidates) {
    candidate.origins.sort(compareOrigins);
  }
  candidates.sort(compareCandidates);
  const actionable = candidates.filter(({ origins }) =>
    origins.some(({ maintenanceHistory }) => maintenanceHistory.length === 0)
  );
  const waitingForEvidenceOccurrences = candidates
    .filter(({ origins }) =>
      origins.every(({ maintenanceHistory }) => maintenanceHistory.length > 0)
    )
    .reduce((total, candidate) => total + candidate.origins.length, 0);
  return { actionable, waitingForEvidenceOccurrences };
}

function groupMaintenanceByCandidate(
  maintenances: readonly MaintenanceObservation[],
): ReadonlyMap<string, readonly ReconciliationMaintenanceOrigin[]> {
  const grouped = new Map<string, ReconciliationMaintenanceOrigin[]>();
  for (const observation of maintenances) {
    for (const result of observation.results) {
      const key = candidateOriginKey(
        result.candidate.taskObservationId,
        result.candidate.candidateIndex,
      );
      const history = grouped.get(key) ?? [];
      history.push({
        maintenanceObservationId: observation.id,
        recordedAt: observation.recordedAt,
        maintenance: observation.maintenance,
        status: result.status,
        reason: result.reason,
        evidence: result.evidence,
      });
      grouped.set(key, history);
    }
  }
  for (const history of grouped.values()) {
    history.sort((left, right) =>
      compareText(left.maintenanceObservationId, right.maintenanceObservationId)
    );
  }
  return grouped;
}

function candidateOriginKey(taskObservationId: string, candidateIndex: number): string {
  return JSON.stringify([taskObservationId, candidateIndex]);
}

function groupByDomain(
  candidates: readonly CandidateAccumulator[],
): readonly ReconciliationDomainGroup[] {
  const grouped = new Map<string, ReconciliationCandidateGroup[]>();
  for (const candidate of candidates) {
    const domainCandidates = grouped.get(candidate.businessDomainId) ?? [];
    domainCandidates.push({
      kind: candidate.kind,
      summary: candidate.summary,
      duplicate: candidate.origins.length > 1,
      origins: candidate.origins,
    });
    grouped.set(candidate.businessDomainId, domainCandidates);
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([businessDomainId, domainCandidates]) => ({
      businessDomainId,
      candidates: domainCandidates,
    }));
}

function candidateKey(
  businessDomainId: string,
  kind: ReconciliationCandidateGroup["kind"],
  summary: string,
): string {
  return JSON.stringify([businessDomainId, kind, summary]);
}

function compareCandidates(
  left: CandidateAccumulator,
  right: CandidateAccumulator,
): number {
  return compareText(left.businessDomainId, right.businessDomainId)
    || compareText(left.kind, right.kind)
    || compareText(left.summary, right.summary);
}

function compareOrigins(
  left: ReconciliationCandidateOrigin,
  right: ReconciliationCandidateOrigin,
): number {
  return compareText(left.taskObservationId, right.taskObservationId)
    || left.candidateIndex - right.candidateIndex;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
