import { z } from "zod";

import {
  assertionCertaintySchema,
  businessKeySchema,
  businessNodeKindSchema,
  businessRelationTypeSchema,
  evidenceSchema,
  knowledgeValiditySchema,
  relativeSourcePathSchema,
  sourceRangeSchema,
  structuralNodeKindSchema,
  structuralNodeIdSchema,
  structuralRelationTypeSchema,
} from "./graph.js";
import {
  contentIdentifierSchema,
  gitObjectIdSchema,
} from "./identifiers.js";

const repositoryDescriptorSchema = z.strictObject({
  id: contentIdentifierSchema,
  root: z.string().min(1),
  headCommit: gitObjectIdSchema,
});

const snapshotDescriptorSchema = z.strictObject({
  id: contentIdentifierSchema,
  gitHead: gitObjectIdSchema,
  createdAt: z.iso.datetime(),
  freshness: z.enum(["current", "stale"]),
});

const warningSchema = z.strictObject({
  code: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  message: z.string().min(1),
  details: z.json().optional(),
});

const sourceLocationSchema = z.looseObject({
  file: relativeSourcePathSchema,
  range: sourceRangeSchema,
});

const structuralMapNodeSchema = z.looseObject({
  domain: z.literal("structural"),
  id: structuralNodeIdSchema,
  kind: structuralNodeKindSchema.exclude(["UnknownBoundary"]),
  label: z.string().min(1),
  validity: knowledgeValiditySchema,
  locations: z.array(sourceLocationSchema),
});

export const businessMapNodeSchema = z.looseObject({
  domain: z.literal("business"),
  key: businessKeySchema,
  kind: businessNodeKindSchema,
  label: z.string().min(1),
  summary: z.string().min(1),
  aliases: z.array(z.string().min(1)),
  certainty: assertionCertaintySchema,
  validity: knowledgeValiditySchema,
  evidence: z.array(evidenceSchema).min(1),
});

const unknownBoundarySchema = z.looseObject({
  domain: z.literal("structural"),
  id: structuralNodeIdSchema,
  kind: z.literal("UnknownBoundary"),
  label: z.string().min(1),
  validity: z.literal("unknown"),
  reason: z.string().min(1),
  location: sourceLocationSchema,
  candidates: z.array(z.string().min(1)),
});

export const mapNodeSchema = z.union([
  structuralMapNodeSchema,
  businessMapNodeSchema,
  unknownBoundarySchema,
]);

const mapRootNodeSchema = z.union([
  structuralMapNodeSchema.safeExtend({ kind: z.literal("Module") }),
  businessMapNodeSchema.safeExtend({ kind: z.literal("Capability") }),
]);

const invariantMapNodeSchema = businessMapNodeSchema.safeExtend({
  kind: z.literal("Invariant"),
});

const testMapNodeSchema = structuralMapNodeSchema.safeExtend({
  kind: z.literal("Test"),
});

const commandNameSchema = z.enum([
  "status",
  "index",
  "map.roots",
  "map.children",
  "map.search",
  "map.show",
  "learn",
  "changes",
]);

const countSchema = z.number().int().nonnegative();
const sourceChangeCountsSchema = z.looseObject({
  staged: countSchema,
  unstaged: countSchema,
  untracked: countSchema,
});

const languageSupportSchema = z.discriminatedUnion("support", [
  z.looseObject({
    language: z.string().min(1),
    support: z.literal("supported"),
  }),
  z.looseObject({
    language: z.string().min(1),
    support: z.literal("unsupported"),
    reason: z.string().min(1),
  }),
]);

const statusDataSchema = z.looseObject({
  command: z.literal("status"),
  currentRevision: z.looseObject({
    headCommit: gitObjectIdSchema,
    changes: sourceChangeCountsSchema,
  }),
  freshness: z.enum(["current", "stale", "missing"]),
  storeLocation: z.string().min(1),
  languages: z.array(languageSupportSchema),
});

const indexDataSchema = z.looseObject({
  command: z.literal("index"),
  snapshotId: contentIdentifierSchema,
  facts: z.looseObject({
    added: countSchema,
    changed: countSchema,
    reused: countSchema,
    removed: countSchema,
  }),
  unknowns: z.looseObject({
    added: countSchema,
    resolved: countSchema,
    total: countSchema,
  }),
});

const mapRootsDataSchema = z.looseObject({
  command: z.literal("map.roots"),
  nodes: z.array(mapRootNodeSchema),
});

const mapChildrenDataSchema = z.looseObject({
  command: z.literal("map.children"),
  nodeId: z.string().min(1),
  children: z.array(mapNodeSchema),
});

const mapSearchDataSchema = z.looseObject({
  command: z.literal("map.search"),
  query: z.string().min(1),
  limit: z.number().int().positive(),
  results: z.array(
    z.looseObject({
      score: z.number().min(0).max(1),
      node: mapNodeSchema,
    }),
  ),
});

const neighborSchema = z.union([
  z.looseObject({
    type: structuralRelationTypeSchema,
    direction: z.enum(["incoming", "outgoing"]),
    node: mapNodeSchema,
    certainty: z.null(),
    validity: knowledgeValiditySchema,
    evidence: z.array(evidenceSchema),
  }),
  z.looseObject({
    type: businessRelationTypeSchema,
    direction: z.enum(["incoming", "outgoing"]),
    node: mapNodeSchema,
    certainty: assertionCertaintySchema,
    validity: knowledgeValiditySchema,
    evidence: z.array(evidenceSchema).min(1),
  }),
]);

const mapShowDataSchema = z.looseObject({
  command: z.literal("map.show"),
  node: mapNodeSchema,
  depth: z.number().int().min(1).max(3),
  neighbors: z.array(neighborSchema),
  invariants: z.array(invariantMapNodeSchema),
  tests: z.array(testMapNodeSchema),
  unknowns: z.array(unknownBoundarySchema),
});

const learnDataSchema = z.looseObject({
  command: z.literal("learn"),
  baseSnapshotId: contentIdentifierSchema,
  snapshotId: contentIdentifierSchema,
  applied: z.looseObject({
    nodeOperations: countSchema,
    relationOperations: countSchema,
  }),
});

const changeSetSchema = z.looseObject({
  added: z.array(z.string().min(1)),
  changed: z.array(z.string().min(1)),
  removed: z.array(z.string().min(1)),
});

const changesDataSchema = z.looseObject({
  command: z.literal("changes"),
  fromSnapshotId: contentIdentifierSchema,
  toSnapshotId: contentIdentifierSchema,
  nodes: changeSetSchema,
  relations: changeSetSchema,
  staleAssertions: z.array(z.string().min(1)),
});

export const cliCommandDataSchema = z.discriminatedUnion("command", [
  statusDataSchema,
  indexDataSchema,
  mapRootsDataSchema,
  mapChildrenDataSchema,
  mapSearchDataSchema,
  mapShowDataSchema,
  learnDataSchema,
  changesDataSchema,
]);

const errorDataSchema = z.looseObject({
  command: commandNameSchema.nullable(),
  error: z.strictObject({
    code: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
    message: z.string().min(1),
    details: z.json().optional(),
  }),
});

const successEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  repository: repositoryDescriptorSchema,
  snapshot: snapshotDescriptorSchema.nullable(),
  status: z.enum(["ok", "partial"]),
  data: cliCommandDataSchema,
  warnings: z.array(warningSchema),
});

const errorEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  repository: repositoryDescriptorSchema.nullable(),
  snapshot: snapshotDescriptorSchema.nullable(),
  status: z.literal("error"),
  data: errorDataSchema,
  warnings: z.array(warningSchema),
});

export const cliEnvelopeSchema = z.union([
  successEnvelopeSchema,
  errorEnvelopeSchema,
]);

export type CliCommandData = z.infer<typeof cliCommandDataSchema>;
export type CliEnvelope = z.infer<typeof cliEnvelopeSchema>;
