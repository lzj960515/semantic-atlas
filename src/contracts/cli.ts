import { z } from "zod";

import {
  assertionCertaintySchema,
  businessKeySchema,
  businessNodeReferenceSchema,
  businessNodeKindSchema,
  businessRelationTypeSchema,
  evidenceSchema,
  knowledgeValiditySchema,
  relativeSourcePathSchema,
  sourceRangeSchema,
  structuralNodeKindSchema,
  structuralNodeIdSchema,
  structuralSupportSchema,
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
  support: structuralSupportSchema,
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

export const mapNodeSchema = z.union([
  structuralMapNodeSchema,
  businessMapNodeSchema,
]);

const commandNameSchema = z.enum([
  "status",
  "index",
  "map.view",
  "map.search",
  "map.show",
  "code.search",
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

const mapRelationTypeSchema = businessRelationTypeSchema.exclude([
  "part_of",
  "realized_by",
  "verified_by",
]);

const mapRelationSummarySchema = z.looseObject({
  type: mapRelationTypeSchema,
  directCount: countSchema,
  aggregatedCount: countSchema,
  certainty: z.looseObject({
    exact: countSchema,
    inferred: countSchema,
    hypothesis: countSchema,
  }),
  validity: z.looseObject({
    valid: countSchema,
    stale: countSchema,
  }),
});

const mapViewDataSchema = z.looseObject({
  command: z.literal("map.view"),
  focus: businessMapNodeSchema.nullable(),
  breadcrumbs: z.array(businessMapNodeSchema),
  regions: z.array(z.looseObject({
    node: businessMapNodeSchema,
    role: z.enum(["root", "child", "context"]),
    childCount: countSchema,
    expandable: z.boolean(),
  })),
  connections: z.array(z.looseObject({
    from: businessNodeReferenceSchema,
    to: businessNodeReferenceSchema,
    relations: z.array(mapRelationSummarySchema),
  })),
});

const mapSearchDataSchema = z.looseObject({
  command: z.literal("map.search"),
  query: z.string().min(1),
  limit: z.number().int().positive(),
  results: z.array(
    z.looseObject({
      score: z.number().min(0).max(1),
      node: businessMapNodeSchema,
    }),
  ),
});

const codeSearchDataSchema = z.looseObject({
  command: z.literal("code.search"),
  query: z.string().min(1),
  limit: z.number().int().positive(),
  results: z.array(z.looseObject({
    score: z.number().min(0).max(1),
    node: structuralMapNodeSchema,
  })),
});

const directBusinessRelationSchema = z.looseObject({
  type: businessRelationTypeSchema,
  direction: z.enum(["incoming", "outgoing"]),
  node: z.union([businessMapNodeSchema, structuralMapNodeSchema]),
  certainty: assertionCertaintySchema,
  validity: knowledgeValiditySchema,
  evidence: z.array(evidenceSchema).min(1),
});

const mapShowDataSchema = z.looseObject({
  command: z.literal("map.show"),
  node: businessMapNodeSchema,
  relations: z.array(directBusinessRelationSchema),
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
  mapViewDataSchema,
  mapSearchDataSchema,
  mapShowDataSchema,
  codeSearchDataSchema,
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
