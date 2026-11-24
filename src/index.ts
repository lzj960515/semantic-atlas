export { MapApplication } from "./application/map-application.js";
export type {
  CliRunResult,
  ContextData,
  ContextEnvelope,
  FlowsEnvelope,
  FlowSearchEnvelope,
  InsightsSummaryEnvelope,
  ObservationRecordedData,
  ObserveMaintenanceEnvelope,
  ObserveReviewEnvelope,
  ObserveTaskEnvelope,
  ProjectAddData,
  ProjectAddEnvelope,
  ProjectListData,
  ProjectListEnvelope,
  ReconciliationCandidatesEnvelope,
  ReconciliationStatusData,
  ReconciliationStatusEnvelope,
  RenderData,
  RenderEnvelope,
  SetupData,
  SetupEnvelope,
  UpgradeData,
  UpgradeEnvelope,
  ValidateData,
  ValidateEnvelope,
} from "./contracts/cli.js";
export type { RegisteredProject } from "./contracts/project.js";
export type {
  AccuracyDimensionCounts,
  ImpactCompletenessCounts,
  InsightPeriod,
  InsightSummary,
  InsightSummaryResult,
  UpstreamCauseCounts,
} from "./contracts/insights.js";
export type {
  BusinessNode,
  BusinessRelation,
  MapDocument,
  MapIssue,
  RepositoryMapSource,
} from "./contracts/map.js";
export {
  evidenceDispositionSchema,
  evidenceReferenceSchema,
  humanCorrectionSchema,
  maintenanceCandidateReferenceSchema,
  maintenanceObservationInputSchema,
  maintenanceObservationSchema,
  maintenanceResultSchema,
  mapQueryObservationSchema,
  mapUpdateCandidateSchema,
  repositoryIdentitySchema,
  reviewAssessmentSchema,
  reviewObservationInputSchema,
  reviewObservationSchema,
  taskObservationInputSchema,
  taskObservationSchema,
} from "./contracts/observation.js";
export type {
  ReconciliationCandidateGroup,
  ReconciliationCandidateOrigin,
  ReconciliationCandidateReport,
  ReconciliationDomainGroup,
  ReconciliationMaintenanceOrigin,
  ReconciliationReviewOrigin,
  ReconciliationSummary,
} from "./contracts/reconciliation.js";
export type {
  EvidenceDisposition,
  EvidenceReference,
  HumanCorrection,
  MaintenanceCandidateReference,
  MaintenanceObservation,
  MaintenanceObservationInput,
  MaintenanceResult,
  MapQueryObservation,
  MapUpdateCandidate,
  ObservationKind,
  RepositoryIdentity,
  ReviewAssessment,
  ReviewObservation,
  ReviewObservationInput,
  TaskObservation,
  TaskObservationInput,
} from "./contracts/observation.js";

export type {
  FlowNavigation,
  FlowContext,
  FlowSearchResult,
  FlowsData,
} from "./contracts/flow-navigation.js";

export type {
  BusinessQuerySummary,
  QueryConcept,
  QueryRelation,
  QueryFlowReference,
  QueryMapReference,
} from "./contracts/query-context.js";
export type {
  QuerySourceLocation,
  ResolvedNavigationAnchor,
  NavigationAnchorResolution,
} from "./contracts/query-location.js";
