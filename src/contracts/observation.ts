import { z } from "zod";

const nonEmptyStringSchema = z.string().trim().min(1).max(2_000);
const identitySchema = z.string().trim().min(1).max(256);
const observationIdSchema = identitySchema.regex(
  /^[A-Za-z0-9][A-Za-z0-9._-]*$/u,
  "Observation IDs use letters, numbers, periods, underscores, and hyphens",
);
const repositoryIdSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const timestampSchema = z.iso.datetime({ offset: true });

export const repositoryIdentitySchema = z.object({
  kind: z.enum(["git", "directory"]),
  id: repositoryIdSchema,
}).strict();

export const evidenceReferenceSchema = z.object({
  kind: z.enum(["source", "test", "document", "runtime"]),
  reference: nonEmptyStringSchema,
}).strict().superRefine((evidence, context) => {
  if (evidence.kind === "runtime" || isNormalizedRepositoryReference(evidence.reference)) {
    return;
  }
  context.addIssue({
    code: "custom",
    path: ["reference"],
    message: "Repository evidence uses a normalized repository-relative path",
  });
});

const contextQuerySchema = z.object({
  selector: nonEmptyStringSchema,
  outcome: z.literal("context"),
  selectedConceptIds: z.array(identitySchema).min(1),
}).strict();

const boundedQuerySchema = z.object({
  selector: nonEmptyStringSchema,
  outcome: z.enum([
    "concept_not_found",
    "concept_ambiguous",
    "map_not_found",
    "unavailable",
  ]),
}).strict();

export const mapQueryObservationSchema = z.discriminatedUnion("outcome", [
  contextQuerySchema,
  boundedQuerySchema,
]);

export const evidenceDispositionSchema = z.object({
  status: z.enum(["confirmed", "missing", "stale", "contradicted", "unresolved"]),
  summary: nonEmptyStringSchema,
  evidence: z.array(evidenceReferenceSchema).min(1),
}).strict();

export const mapUpdateCandidateSchema = z.object({
  businessDomainId: identitySchema,
  kind: z.enum(["node", "relation", "anchor"]),
  disposition: z.enum(["confirmed", "contradicted", "unresolved"]),
  summary: nonEmptyStringSchema,
  evidence: z.array(evidenceReferenceSchema).min(1),
}).strict();

export const humanCorrectionSchema = z.object({
  summary: nonEmptyStringSchema,
  dimensions: z.array(z.enum([
    "business_boundary",
    "upstream_cause",
    "impact",
    "map_use",
  ])).min(1),
}).strict();

const taskObservationFields = {
  id: observationIdSchema,
  recordedAt: timestampSchema,
  task: z.object({
    taskId: identitySchema,
    runId: identitySchema,
  }).strict(),
  map: z.object({
    queries: z.array(mapQueryObservationSchema).min(1),
    dispositions: z.array(evidenceDispositionSchema),
  }).strict(),
  humanCorrection: humanCorrectionSchema.optional(),
};

export const taskObservationInputSchema = z.object({
  schemaVersion: z.literal(2),
  ...taskObservationFields,
  mapUpdateCandidates: z.array(mapUpdateCandidateSchema),
}).strict();

const approvedReviewSchema = z.object({
  taskId: identitySchema,
  runId: identitySchema,
  verdict: z.literal("approved"),
  businessBoundary: z.enum(["correct", "not_assessed"]),
  upstreamCause: z.enum(["correct", "not_applicable", "not_assessed"]),
  impactCompleteness: z.enum(["complete", "not_assessed"]),
  requiredRework: z.literal(false),
  mapCausedRegression: z.literal(false),
}).strict();

const changesRequestedReviewSchema = z.object({
  taskId: identitySchema,
  runId: identitySchema,
  verdict: z.literal("changes_requested"),
  businessBoundary: z.enum(["correct", "incorrect", "not_assessed"]),
  upstreamCause: z.enum(["correct", "incorrect", "not_applicable", "not_assessed"]),
  impactCompleteness: z.enum(["complete", "incomplete", "not_assessed"]),
  requiredRework: z.literal(true),
  mapCausedRegression: z.boolean(),
}).strict();

export const reviewAssessmentSchema = z.discriminatedUnion("verdict", [
  approvedReviewSchema,
  changesRequestedReviewSchema,
]);

export const reviewObservationInputSchema = z.object({
  schemaVersion: z.literal(1),
  id: observationIdSchema,
  recordedAt: timestampSchema,
  taskObservationId: observationIdSchema,
  review: reviewAssessmentSchema,
  humanCorrection: humanCorrectionSchema.optional(),
}).strict();

export const taskObservationSchema = taskObservationInputSchema.extend({
  repository: repositoryIdentitySchema,
}).strict();

export const reviewObservationSchema = reviewObservationInputSchema.extend({
  repository: repositoryIdentitySchema,
}).strict();

export type RepositoryIdentity = z.infer<typeof repositoryIdentitySchema>;
export type EvidenceReference = z.infer<typeof evidenceReferenceSchema>;
export type MapQueryObservation = z.infer<typeof mapQueryObservationSchema>;
export type EvidenceDisposition = z.infer<typeof evidenceDispositionSchema>;
export type MapUpdateCandidate = z.infer<typeof mapUpdateCandidateSchema>;
export type HumanCorrection = z.infer<typeof humanCorrectionSchema>;
export type ReviewAssessment = z.infer<typeof reviewAssessmentSchema>;
export type TaskObservationInput = z.infer<typeof taskObservationInputSchema>;
export type ReviewObservationInput = z.infer<typeof reviewObservationInputSchema>;
export type TaskObservation = z.infer<typeof taskObservationSchema>;
export type ReviewObservation = z.infer<typeof reviewObservationSchema>;
export type ObservationKind = "task" | "review";

function isNormalizedRepositoryReference(reference: string): boolean {
  return !reference.startsWith("/")
    && !reference.includes("\\")
    && !/^[A-Za-z]:/u.test(reference)
    && reference.split("/").every((segment) =>
      segment.length > 0 && segment !== "." && segment !== ".."
    );
}
