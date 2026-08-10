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
  "decorated_by",
]);

export const businessRelationTypeSchema = z.enum([
  "part_of",
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

const structuralSymbolIdSchema = z
  .string()
  .regex(/^symbol:.+$/, "Expected a compiler-owned structural symbol ID");

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

const nodeReferenceSchema = z.discriminatedUnion("domain", [
  businessNodeReferenceSchema,
  structuralNodeReferenceSchema,
]);

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
    symbolId: structuralSymbolIdSchema,
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

const businessNodeSchema = z.strictObject({
  key: businessKeySchema,
  kind: businessNodeKindSchema,
  label: z.string().min(1),
  summary: z.string().min(1),
  aliases: z.array(z.string().min(1)),
  certainty: assertionCertaintySchema,
  evidence: z.array(evidenceSchema).min(1),
});

const relationSelectorSchema = z
  .strictObject({
    from: nodeReferenceSchema,
    type: businessRelationTypeSchema,
    to: nodeReferenceSchema,
  })
  .superRefine(validateBusinessRelationEndpoints);

const learnedRelationSchema = relationSelectorSchema.safeExtend({
  certainty: assertionCertaintySchema,
  evidence: z.array(evidenceSchema).min(1),
});

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

function validateBusinessRelationEndpoints(
  relation: {
    from: z.infer<typeof nodeReferenceSchema>;
    type: z.infer<typeof businessRelationTypeSchema>;
    to: z.infer<typeof nodeReferenceSchema>;
  },
  context: z.RefinementCtx,
) {
  if (relation.from.domain !== "business") {
    context.addIssue({
      code: "custom",
      message: "Learned business relations must originate from a business node",
      path: ["from"],
    });
  }

  const structuralTargets = new Set(["realized_by", "verified_by"]);
  const expectedTargetDomain = structuralTargets.has(relation.type)
    ? "structural"
    : "business";

  if (relation.to.domain !== expectedTargetDomain) {
    context.addIssue({
      code: "custom",
      message: `${relation.type} relations require a ${expectedTargetDomain} target`,
      path: ["to"],
    });
  }
}
