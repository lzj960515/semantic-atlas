import { z } from "zod";

export const observedCommandSchema = z.enum([
  "status",
  "index",
  "map.view",
  "map.search",
  "map.show",
  "code.search",
  "learn",
  "changes",
  "feedback.report",
]);

export const commandOutcomeSchema = z.enum(["ok", "partial", "error"]);

export const feedbackKindSchema = z.enum(["problem", "suggestion"]);
export const feedbackCategorySchema = z.enum([
  "misleading-result",
  "missing-knowledge",
  "workflow-friction",
  "performance",
  "cli-error",
  "skill-instruction",
]);
export const feedbackImpactSchema = z.enum(["blocked", "slowed", "minor"]);
export const feedbackStatusSchema = z.enum(["new", "triaged", "resolved", "dismissed"]);
export const insightsPeriodSchema = z.enum(["today", "yesterday", "7d", "30d", "all"]);

export const feedbackReportInputSchema = z.strictObject({
  kind: feedbackKindSchema,
  category: feedbackCategorySchema,
  impact: feedbackImpactSchema,
  observed: z.string().trim().min(1).max(4_000),
  expected: z.string().trim().min(1).max(4_000),
  suggestion: z.string().trim().min(1).max(4_000).optional(),
  sourceConfirmed: z.boolean(),
});

export const feedbackReportUpdateInputSchema = z.strictObject({
  id: z.string().uuid(),
  status: z.enum(["triaged", "resolved", "dismissed"]),
  note: z.string().trim().min(1).max(4_000),
});

export type ObservedCommand = z.infer<typeof observedCommandSchema>;
export type CommandOutcome = z.infer<typeof commandOutcomeSchema>;
export type FeedbackReportInput = z.infer<typeof feedbackReportInputSchema>;
export type FeedbackStatus = z.infer<typeof feedbackStatusSchema>;
export type InsightsPeriod = z.infer<typeof insightsPeriodSchema>;
export type FeedbackReportUpdateInput = z.infer<typeof feedbackReportUpdateInputSchema>;

const timestampSchema = z.iso.datetime();
const nonNegativeIntegerSchema = z.number().int().nonnegative();
const insightRangeSchema = z.strictObject({
  from: timestampSchema,
  to: timestampSchema,
});
const feedbackReportSchema = feedbackReportInputSchema.extend({
  id: z.string().uuid(),
  repositoryId: z.string().regex(/^[a-f0-9]{64}$/),
  snapshotId: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  contextEventIds: z.array(z.string().uuid()),
  status: feedbackStatusSchema,
  note: z.string().nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
const insightsSummarySchema = z.strictObject({
  commands: z.strictObject({
    total: nonNegativeIntegerSchema,
    outcomes: z.strictObject({
      ok: nonNegativeIntegerSchema,
      partial: nonNegativeIntegerSchema,
      error: nonNegativeIntegerSchema,
    }),
    byCommand: z.array(z.strictObject({
      command: observedCommandSchema,
      count: nonNegativeIntegerSchema,
    })),
    warningCodes: z.array(z.strictObject({
      code: z.string().min(1),
      count: nonNegativeIntegerSchema,
    })),
  }),
  feedback: z.strictObject({
    total: nonNegativeIntegerSchema,
    byCategory: z.array(z.strictObject({
      category: feedbackCategorySchema,
      count: nonNegativeIntegerSchema,
    })),
  }),
});

export const feedbackReportResultSchema = z.strictObject({
  id: z.string().uuid(),
  kind: feedbackKindSchema,
  category: feedbackCategorySchema,
  impact: feedbackImpactSchema,
  sourceConfirmed: z.boolean(),
  status: feedbackStatusSchema,
  contextEventCount: nonNegativeIntegerSchema,
  createdAt: timestampSchema,
});

const insightsSuccessDataSchema = z.discriminatedUnion("command", [
  z.strictObject({
    command: z.literal("insights.summary"),
    range: insightRangeSchema,
    summary: insightsSummarySchema,
  }),
  z.strictObject({
    command: z.literal("insights.feedback"),
    range: insightRangeSchema,
    reports: z.array(feedbackReportSchema),
  }),
  z.strictObject({
    command: z.literal("insights.feedback.update"),
    report: feedbackReportSchema,
  }),
]);

export const insightsEnvelopeSchema = z.discriminatedUnion("status", [
  z.strictObject({
    schemaVersion: z.literal(1),
    status: z.literal("ok"),
    data: insightsSuccessDataSchema,
  }),
  z.strictObject({
    schemaVersion: z.literal(1),
    status: z.literal("error"),
    data: z.strictObject({
      command: z.enum(["insights.summary", "insights.feedback", "insights.feedback.update"]).nullable(),
      error: z.strictObject({
        code: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
        message: z.string().min(1),
      }),
    }),
  }),
]);

export type InsightsEnvelope = z.infer<typeof insightsEnvelopeSchema>;
export type InsightsSuccessData = Extract<InsightsEnvelope, { readonly status: "ok" }>["data"];
