import { z } from "zod";

export const businessNodeKinds = [
  "domain",
  "capability",
  "scenario",
  "operation",
  "data",
  "invariant",
  "interface",
] as const;

export const businessRelationKinds = [
  "part_of",
  "invokes",
  "reads",
  "writes",
  "publishes",
  "consumes",
  "constrained_by",
] as const;

export const navigationAnchorKinds = [
  "file",
  "directory",
  "symbol",
  "search",
  "document",
] as const;

export const businessFlowStepKinds = [
  "action",
  "decision",
  "outcome",
] as const;

const nonEmptyStringSchema = z.string().trim().min(1);
const businessIdSchema = nonEmptyStringSchema.regex(
  /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/,
  "IDs use lowercase dot-separated business vocabulary with optional hyphens",
);

export const navigationAnchorSchema = z.object({
  kind: z.enum(navigationAnchorKinds),
  value: nonEmptyStringSchema,
  description: nonEmptyStringSchema,
}).strict();

export const businessNodeSchema = z.object({
  id: businessIdSchema,
  kind: z.enum(businessNodeKinds),
  name: nonEmptyStringSchema,
  summary: nonEmptyStringSchema,
  aliases: z.array(nonEmptyStringSchema),
  anchors: z.array(navigationAnchorSchema),
  notes: nonEmptyStringSchema.optional(),
}).strict();

export const businessRelationSchema = z.object({
  from: businessIdSchema,
  type: z.enum(businessRelationKinds),
  to: businessIdSchema,
  summary: nonEmptyStringSchema,
  notes: nonEmptyStringSchema.optional(),
}).strict();

export const businessFlowStepSchema = z.object({
  id: businessIdSchema,
  kind: z.enum(businessFlowStepKinds),
  name: nonEmptyStringSchema,
  summary: nonEmptyStringSchema,
  concept: businessIdSchema.optional(),
  notes: nonEmptyStringSchema.optional(),
}).strict();

export const businessFlowTransitionSchema = z.object({
  from: businessIdSchema,
  to: businessIdSchema,
  when: nonEmptyStringSchema.optional(),
}).strict();

export const businessFlowSchema = z.object({
  id: businessIdSchema,
  name: nonEmptyStringSchema,
  summary: nonEmptyStringSchema,
  scenario: businessIdSchema,
  startsAt: businessIdSchema,
  steps: z.array(businessFlowStepSchema).min(1),
  transitions: z.array(businessFlowTransitionSchema),
  notes: nonEmptyStringSchema.optional(),
}).strict();

export const mapDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  map: z.object({
    id: businessIdSchema,
    title: nonEmptyStringSchema,
    summary: nonEmptyStringSchema,
  }).strict(),
  nodes: z.array(businessNodeSchema),
  relations: z.array(businessRelationSchema),
  flows: z.array(businessFlowSchema).default([]),
}).strict();

export type BusinessNodeKind = typeof businessNodeKinds[number];
export type BusinessRelationKind = typeof businessRelationKinds[number];
export type NavigationAnchorKind = typeof navigationAnchorKinds[number];
export type BusinessFlowStepKind = typeof businessFlowStepKinds[number];
export type NavigationAnchor = z.infer<typeof navigationAnchorSchema>;
export type BusinessNodeDefinition = z.infer<typeof businessNodeSchema>;
export type BusinessRelationDefinition = z.infer<typeof businessRelationSchema>;
export type BusinessFlowStepDefinition = z.infer<typeof businessFlowStepSchema>;
export type BusinessFlowTransitionDefinition = z.infer<typeof businessFlowTransitionSchema>;
export type BusinessFlowDefinition = z.infer<typeof businessFlowSchema>;
export type MapDocument = z.infer<typeof mapDocumentSchema>;

export interface LoadedMapDocument {
  readonly fileName: string;
  readonly relativePath: string;
  readonly value: unknown;
}

export interface ParsedMapDocument {
  readonly fileName: string;
  readonly relativePath: string;
  readonly document: MapDocument;
}

export interface BusinessNode extends Omit<BusinessNodeDefinition, "aliases" | "anchors"> {
  readonly aliases: readonly string[];
  readonly anchors: readonly NavigationAnchor[];
  readonly documentId: string;
  readonly documentPath: string;
}

export interface BusinessRelation extends BusinessRelationDefinition {
  readonly documentId: string;
  readonly documentPath: string;
}

export interface BusinessFlow extends Omit<BusinessFlowDefinition, "steps" | "transitions"> {
  readonly steps: readonly BusinessFlowStepDefinition[];
  readonly transitions: readonly BusinessFlowTransitionDefinition[];
  readonly documentId: string;
  readonly documentPath: string;
}

export type MapIssueCode =
  | "DOCUMENT_PARSE_FAILED"
  | "DOCUMENT_SCHEMA_INVALID"
  | "DUPLICATE_DOCUMENT_ID"
  | "DUPLICATE_NODE_ID"
  | "DUPLICATE_NODE_ALIAS"
  | "DUPLICATE_RELATION"
  | "RELATION_ENDPOINT_MISSING"
  | "MULTIPLE_CONTAINMENT_PARENTS"
  | "CONTAINMENT_CYCLE"
  | "DOMAIN_HAS_PARENT"
  | "RELATION_KIND_MISMATCH"
  | "ANCHOR_PATH_INVALID"
  | "DUPLICATE_FLOW_ID"
  | "DUPLICATE_FLOW_STEP_ID"
  | "FLOW_SCENARIO_MISSING"
  | "FLOW_SCENARIO_KIND_MISMATCH"
  | "FLOW_CONCEPT_MISSING"
  | "FLOW_START_STEP_MISSING"
  | "FLOW_TRANSITION_ENDPOINT_MISSING"
  | "DUPLICATE_FLOW_TRANSITION"
  | "FLOW_ACTION_BRANCH_INVALID"
  | "FLOW_DECISION_BRANCH_INVALID"
  | "FLOW_OUTCOME_HAS_TRANSITION"
  | "FLOW_STEP_UNREACHABLE";

export interface MapIssue {
  readonly code: MapIssueCode;
  readonly message: string;
  readonly document?: string;
  readonly path?: string;
  readonly subject?: string;
}

export interface RepositoryMapSource {
  readonly root: string;
  readonly mapDirectory: string;
  readonly documents: readonly string[];
}

export interface ValidatedBusinessMap {
  readonly source: RepositoryMapSource;
  readonly documents: readonly ParsedMapDocument[];
  readonly nodes: readonly BusinessNode[];
  readonly relations: readonly BusinessRelation[];
  readonly flows: readonly BusinessFlow[];
}
