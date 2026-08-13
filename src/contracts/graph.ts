import { z } from "zod";

import { contentIdentifierSchema } from "./identifiers.js";

export const structuralNodeKindSchema = z.enum([
  "Repository",
  "Module",
  "File",
  "Symbol",
  "Test",
  "UnknownBoundary",
]);

export const businessNodeKindSchema = z.enum([
  "Capability",
  "Scenario",
  "Operation",
  "Invariant",
  "Interface",
  "Data",
]);

export const structuralRelationTypeSchema = z.enum([
  "contains",
  "declares",
  "imports",
  "exports",
  "references",
  "calls",
  "extends",
  "implements",
  "instantiates",
  "decorated_by",
]);

export const businessRelationTypeSchema = z.enum([
  "part_of",
  "invokes",
  "realized_by",
  "reads",
  "writes",
  "publishes",
  "consumes",
  "constrained_by",
  "verified_by",
]);

export const businessKeySchema = z
  .string()
  .regex(
    /^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*$/,
    "Expected a stable hierarchical business key",
  );

export const structuralNodeIdSchema = z
  .string()
  .regex(
    /^(?:repository|module|file|symbol|test|unknown):.+$/,
    "Expected a namespaced structural node ID",
  );

const evidenceNodeIdSchema = z
  .string()
  .regex(/^(?:symbol|test):.+$/, "Expected an evidence-bearing structural symbol or test ID");

export const relativeSourcePathSchema = z
  .string()
  .min(1)
  .regex(
    /^(?!\/)(?!.*\\)(?!.*(?:^|\/)\.\.?(?:\/|$))(?!.*\/\/).+$/,
    "Expected a normalized repository-relative path",
  );

const businessNodeReferenceSchema = z.strictObject({
  domain: z.literal("business"),
  key: businessKeySchema,
});

const structuralNodeReferenceSchema = z.strictObject({
  domain: z.literal("structural"),
  id: structuralNodeIdSchema,
});

export const sourcePositionSchema = z.strictObject({
  line: z.number().int().positive(),
  column: z.number().int().positive(),
});

export const sourceRangeSchema = z
  .strictObject({
    start: sourcePositionSchema,
    end: sourcePositionSchema,
  })
  .superRefine((range, context) => {
    const endsBeforeStart =
      range.end.line < range.start.line ||
      (range.end.line === range.start.line &&
        range.end.column < range.start.column);

    if (endsBeforeStart) {
      context.addIssue({
        code: "custom",
        message: "Source range end must not precede its start",
        path: ["end"],
      });
    }
  });

export const evidenceSchema = z
  .strictObject({
    symbolId: evidenceNodeIdSchema,
    file: relativeSourcePathSchema,
    range: sourceRangeSchema,
    contentHash: contentIdentifierSchema,
  });

export const assertionCertaintySchema = z.enum([
  "exact",
  "inferred",
  "hypothesis",
]);

export const knowledgeValiditySchema = z.enum(["valid", "stale"]);

export const structuralSupportStatusSchema = z.enum([
  "exact",
  "inferred",
  "unresolved",
  "unsupported",
]);

export const structuralProvenanceSchema = z.enum([
  "tree-sitter",
  "scip",
  "heuristic",
  "backend",
]);

export const structuralSupportSchema = z.strictObject({
  status: structuralSupportStatusSchema,
  provenance: structuralProvenanceSchema,
});

const businessNodeSchema = z.strictObject({
  key: businessKeySchema,
  kind: businessNodeKindSchema,
  label: z.string().min(1),
  summary: z.string().min(1),
  aliases: z.array(z.string().min(1)),
  certainty: assertionCertaintySchema,
  evidence: z.array(evidenceSchema).min(1),
});

const businessTargetRelationTypeSchema = z.enum([
  "part_of",
  "invokes",
  "reads",
  "writes",
  "publishes",
  "consumes",
  "constrained_by",
]);

const structuralTargetRelationTypeSchema = z.enum([
  "realized_by",
  "verified_by",
]);

const businessTargetRelationSelectorSchema = z.strictObject({
  from: businessNodeReferenceSchema,
  type: businessTargetRelationTypeSchema,
  to: businessNodeReferenceSchema,
});

const structuralTargetRelationSelectorSchema = z.strictObject({
  from: businessNodeReferenceSchema,
  type: structuralTargetRelationTypeSchema,
  to: structuralNodeReferenceSchema,
});

const relationSelectorSchema = z.union([
  businessTargetRelationSelectorSchema,
  structuralTargetRelationSelectorSchema,
]);

const assertionShape = {
  certainty: assertionCertaintySchema,
  evidence: z.array(evidenceSchema).min(1),
};

const learnedRelationSchema = z.union([
  businessTargetRelationSelectorSchema.extend(assertionShape),
  structuralTargetRelationSelectorSchema.extend(assertionShape),
]);

const nodeOperationSchema = z.discriminatedUnion("op", [
  z.strictObject({
    op: z.literal("upsert"),
    node: businessNodeSchema,
  }),
  z.strictObject({
    op: z.literal("remove"),
    key: businessKeySchema,
  }),
]);

const relationOperationSchema = z.discriminatedUnion("op", [
  z.strictObject({
    op: z.literal("upsert"),
    relation: learnedRelationSchema,
  }),
  z.strictObject({
    op: z.literal("remove"),
    relation: relationSelectorSchema,
  }),
]);

export const graphPatchV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  baseSnapshotId: contentIdentifierSchema,
  nodeOperations: z.array(nodeOperationSchema),
  relationOperations: z.array(relationOperationSchema),
});

export type GraphPatchV1 = z.infer<typeof graphPatchV1Schema>;
