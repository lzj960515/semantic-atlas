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

export const mapDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  map: z.object({
    id: businessIdSchema,
    title: nonEmptyStringSchema,
    summary: nonEmptyStringSchema,
  }).strict(),
  nodes: z.array(businessNodeSchema),
  relations: z.array(businessRelationSchema),
}).strict();

export type BusinessNodeKind = typeof businessNodeKinds[number];
export type BusinessRelationKind = typeof businessRelationKinds[number];
export type NavigationAnchorKind = typeof navigationAnchorKinds[number];
export type NavigationAnchor = z.infer<typeof navigationAnchorSchema>;
export type BusinessNodeDefinition = z.infer<typeof businessNodeSchema>;
export type BusinessRelationDefinition = z.infer<typeof businessRelationSchema>;
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
  | "ANCHOR_PATH_INVALID";

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
}
