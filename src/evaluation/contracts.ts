import { z } from "zod";

const relativeSourcePathSchema = z
  .string()
  .min(1)
  .regex(
    /^(?!\/)(?!.*\\)(?!.*(?:^|\/)\.\.?(?:\/|$))(?!.*\/\/).+$/,
    "Expected a normalized repository-relative path",
  );

const frameworkSchema = z.enum(["nestjs", "graphql", "typeorm", "bullmq"]);

const fixtureSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("synthetic"),
    repository: z.string().min(1),
    revision: z.string().min(1),
  }),
  z.strictObject({
    kind: z.literal("private"),
    repositoryAlias: z.string().min(1),
    revision: z.string().min(1),
  }),
]);

const symbolReferenceSchema = z.strictObject({
  file: relativeSourcePathSchema,
  name: z.string().min(1),
});

export const evaluationCaseSchema = z
  .strictObject({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: z.string().min(1),
    category: z.enum(["location", "dependency-impact"]),
    frameworks: z
      .array(frameworkSchema)
      .min(1)
      .refine(
        (frameworks) => new Set(frameworks).size === frameworks.length,
        { message: "frameworks must be unique" },
      ),
    fixture: fixtureSchema,
    prompt: z.string().min(1),
    oracle: z.strictObject({
      acceptanceCriteria: z.array(z.string().min(1)).min(1),
      requiredFiles: z.array(relativeSourcePathSchema).min(1),
      requiredSymbols: z.array(symbolReferenceSchema).min(1),
    }),
  })
  .superRefine((evaluationCase, context) => {
    const { acceptanceCriteria, requiredFiles, requiredSymbols } =
      evaluationCase.oracle;
    addUniqueValueIssue(acceptanceCriteria, context, [
      "oracle",
      "acceptanceCriteria",
    ]);
    addUniqueValueIssue(requiredFiles, context, ["oracle", "requiredFiles"]);
    addUniqueValueIssue(
      requiredSymbols.map(toSymbolIdentity),
      context,
      ["oracle", "requiredSymbols"],
    );

    const requiredFileSet = new Set(requiredFiles);
    if (requiredSymbols.some((symbol) => !requiredFileSet.has(symbol.file))) {
      context.addIssue({
        code: "custom",
        message: "Every required symbol file must also be a required file",
        path: ["oracle", "requiredSymbols"],
      });
    }
  });

export const evaluationPlanSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    cases: z.array(evaluationCaseSchema).min(1),
  })
  .superRefine((plan, context) => {
    addDuplicateIssues(
      plan.cases.map((evaluationCase) => evaluationCase.id),
      context,
      "cases",
    );
  });

export const baselineEvaluationPlanSchema = evaluationPlanSchema.superRefine(
  (plan, context) => {
    const locationCount = plan.cases.filter(
      (evaluationCase) => evaluationCase.category === "location",
    ).length;
    const impactCount = plan.cases.filter(
      (evaluationCase) => evaluationCase.category === "dependency-impact",
    ).length;

    if (locationCount !== 6 || impactCount !== 6) {
      context.addIssue({
        code: "custom",
        message:
          "The baseline must contain six location and six dependency-impact cases",
        path: ["cases"],
      });
    }

    const coveredFrameworks = new Set(
      plan.cases.flatMap((evaluationCase) => evaluationCase.frameworks),
    );
    for (const framework of frameworkSchema.options) {
      if (!coveredFrameworks.has(framework)) {
        context.addIssue({
          code: "custom",
          message: `The baseline must cover ${framework}`,
          path: ["cases"],
        });
      }
    }

    if (
      plan.cases.some(
        (evaluationCase) => evaluationCase.fixture.kind !== "synthetic",
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "The published baseline may contain only synthetic fixtures",
        path: ["cases"],
      });
    }
  },
);

const sourceOpenSchema = z.strictObject({
  sequence: z.number().int().positive(),
  file: relativeSourcePathSchema,
  sourceTokens: z.number().int().nonnegative(),
});

const atlasCallSchema = z.strictObject({
  sequence: z.number().int().positive(),
  command: z.string().min(1),
  commandSequence: z.number().int().positive().optional(),
  exitCode: z.number().int().optional(),
  output: z.string().min(1).optional(),
});

const atlasHandlingSchema = z.strictObject({
  sequence: z.number().int().positive(),
  classification: z.enum([
    "stale",
    "hypothesis",
    "unknown",
    "unsupported",
    "partial",
    "insufficient",
  ]),
  action: z.string().min(1),
});

const skillLoadSchema = z.strictObject({
  sequence: z.number().int().positive(),
  file: relativeSourcePathSchema.regex(
    /^\.agents\/skills\/semantic-atlas\/(?:SKILL\.md|references\/[a-z0-9-]+\.md)$/u,
  ),
});

const skillDiscoverySchema = z.strictObject({
  delivery: z.literal("repository"),
  promptInjection: z.literal(false),
  mainSkillLoaded: z.literal(true),
  statusBeforeSource: z.literal(true),
  mapBeforeSource: z.literal(true),
  decisiveSourceRead: z.literal(true),
  decisiveSourceFiles: z.array(relativeSourcePathSchema).min(1),
  conditionalReferences: z.strictObject({
    snapshotBootstrap: z.discriminatedUnion("outcome", [
      z.strictObject({ outcome: z.literal("not-required") }),
      z.strictObject({
        outcome: z.literal("loaded-after-trigger"),
        triggerCommandSequence: z.number().int().positive(),
        loadCommandSequence: z.number().int().positive(),
      }),
    ]),
    resultRouting: z.discriminatedUnion("outcome", [
      z.strictObject({ outcome: z.literal("not-required") }),
      z.strictObject({
        outcome: z.literal("loaded-after-trigger"),
        triggerCommandSequence: z.number().int().positive(),
        loadCommandSequence: z.number().int().positive(),
      }),
    ]),
    graphPatch: z.discriminatedUnion("outcome", [
      z.strictObject({ outcome: z.literal("not-loaded") }),
      z.strictObject({
        outcome: z.literal("loaded-after-source"),
        sourceCommandSequence: z.number().int().positive(),
        loadCommandSequence: z.number().int().positive(),
      }),
    ]),
  }),
});

export const evaluationFailureClassificationSchema = z.enum([
  "missed-dependency",
  "incorrect-answer",
  "stale-knowledge",
  "hypothesis-mishandled",
  "unknown-boundary-mishandled",
  "unsupported-source",
  "protocol-violation",
]);

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const FRESH_AGENT_COMMAND_AUDIT_POLICY = "fresh-agent-shell-allowlist-v4";

export const evaluationRunSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    runId: z.string().min(1),
    caseId: z.string().min(1),
    mode: z.enum(["no-atlas", "atlas"]),
    fixtureRevision: z.string().min(1),
    agent: z.strictObject({
      product: z.string().min(1),
      model: z.string().min(1),
      freshContext: z.literal(true),
    }),
    protocol: z.strictObject({
      runnerVersion: z.string().min(1),
      fixtureCommit: z.string().regex(/^[a-f0-9]{40}$/),
      instructionsHash: sha256Schema,
      toolPolicyHash: sha256Schema,
      oracleHidden: z.literal(true),
      commandAuditPassed: z.literal(true),
      commandAudit: z.strictObject({
        policy: z.literal(FRESH_AGENT_COMMAND_AUDIT_POLICY),
        commands: z.array(z.string().min(1)).min(1),
      }),
      skillDiscovery: skillDiscoverySchema.optional(),
    }),
    startedAt: z.iso.datetime(),
    finishedAt: z.iso.datetime(),
    observations: z.strictObject({
      sourceTokenMethod: z.string().min(1),
      sourceOpens: z.array(sourceOpenSchema).min(1),
      atlasCalls: z.array(atlasCallSchema),
      atlasHandling: z.array(atlasHandlingSchema),
      skillLoads: z.array(skillLoadSchema).optional(),
    }),
    answer: z.strictObject({
      response: z.string().min(1),
      reportedFiles: z.array(relativeSourcePathSchema),
      reportedSymbols: z.array(symbolReferenceSchema),
    }),
    adjudication: z.strictObject({
      correct: z.boolean(),
      notes: z.string().min(1),
      failureClassifications: z.array(evaluationFailureClassificationSchema),
    }),
  })
  .superRefine((run, context) => {
    if (run.mode === "no-atlas" && run.observations.atlasCalls.length > 0) {
      context.addIssue({
        code: "custom",
        message: "A no-atlas run cannot contain Atlas calls",
        path: ["observations", "atlasCalls"],
      });
    }

    if (run.mode === "atlas" && run.observations.atlasCalls.length === 0) {
      context.addIssue({
        code: "custom",
        message: "An Atlas-assisted run must contain at least one Atlas call",
        path: ["observations", "atlasCalls"],
      });
    }

    if (run.mode === "no-atlas" && run.observations.atlasHandling.length > 0) {
      context.addIssue({
        code: "custom",
        message: "A no-atlas run cannot contain Atlas result handling",
        path: ["observations", "atlasHandling"],
      });
    }

    if (run.protocol.runnerVersion === "fresh-agent-runner-v5") {
      const skillLoads = run.observations.skillLoads ?? [];
      if (run.mode === "atlas" && (
        run.protocol.skillDiscovery === undefined
        || skillLoads[0]?.file !== ".agents/skills/semantic-atlas/SKILL.md"
      )) {
        context.addIssue({
          code: "custom",
          message: "A discovery run must load and audit the repository Semantic Atlas Skill",
          path: ["protocol", "skillDiscovery"],
        });
      }
      if (run.mode === "atlas" && run.observations.atlasCalls.some((call) => (
        call.commandSequence === undefined
        || call.exitCode === undefined
        || call.output === undefined
      ))) {
        context.addIssue({
          code: "custom",
          message: "A discovery run must retain replayable Atlas command envelopes",
          path: ["observations", "atlasCalls"],
        });
      }
      if (run.mode === "no-atlas" && (
        run.protocol.skillDiscovery !== undefined || skillLoads.length > 0
      )) {
        context.addIssue({
          code: "custom",
          message: "A no-atlas run cannot load or audit the candidate Skill",
          path: ["observations", "skillLoads"],
        });
      }
    }

    if (run.adjudication.correct === (run.adjudication.failureClassifications.length > 0)) {
      context.addIssue({
        code: "custom",
        message: "Incorrect answers require failure classifications and correct answers require none",
        path: ["adjudication", "failureClassifications"],
      });
    }

    if (Date.parse(run.finishedAt) < Date.parse(run.startedAt)) {
      context.addIssue({
        code: "custom",
        message: "finishedAt must not precede startedAt",
        path: ["finishedAt"],
      });
    }

    addSequenceIssues(run.observations.sourceOpens, context, "sourceOpens");
    addSequenceIssues(run.observations.atlasCalls, context, "atlasCalls");
    addSequenceIssues(run.observations.atlasHandling, context, "atlasHandling");
    addSequenceIssues(run.observations.skillLoads ?? [], context, "skillLoads");
  });

export type EvaluationCase = z.infer<typeof evaluationCaseSchema>;
export type EvaluationRun = z.infer<typeof evaluationRunSchema>;

export interface EvaluationRunSummary {
  caseId: string;
  runId: string;
  mode: EvaluationRun["mode"];
  correct: boolean;
  requiredFileRecall: number;
  requiredSymbolRecall: number;
  openedFileCount: number;
  sourceTokens: number;
  atlasCallCount: number;
  atlasHandlingCount: number;
  failureClassifications: EvaluationRun["adjudication"]["failureClassifications"];
}

export function summarizeEvaluationRun(
  rawCase: unknown,
  rawRun: unknown,
): EvaluationRunSummary {
  const evaluationCase = evaluationCaseSchema.parse(rawCase);
  const run = evaluationRunSchema.parse(rawRun);

  if (run.caseId !== evaluationCase.id) {
    throw new Error(
      `Run case ${run.caseId} does not match evaluation case ${evaluationCase.id}`,
    );
  }

  if (run.fixtureRevision !== evaluationCase.fixture.revision) {
    throw new Error(
      `Run fixture revision ${run.fixtureRevision} does not match ${evaluationCase.fixture.revision}`,
    );
  }

  const reportedFiles = new Set(run.answer.reportedFiles);
  const reportedSymbols = new Set(
    run.answer.reportedSymbols.map(toSymbolIdentity),
  );
  const openedFiles = new Set(
    run.observations.sourceOpens.map((sourceOpen) => sourceOpen.file),
  );

  return {
    caseId: evaluationCase.id,
    runId: run.runId,
    mode: run.mode,
    correct: run.adjudication.correct,
    requiredFileRecall: recall(
      evaluationCase.oracle.requiredFiles,
      reportedFiles,
      (file) => file,
    ),
    requiredSymbolRecall: recall(
      evaluationCase.oracle.requiredSymbols,
      reportedSymbols,
      toSymbolIdentity,
    ),
    openedFileCount: openedFiles.size,
    sourceTokens: run.observations.sourceOpens.reduce(
      (total, sourceOpen) => total + sourceOpen.sourceTokens,
      0,
    ),
    atlasCallCount: run.observations.atlasCalls.length,
    atlasHandlingCount: run.observations.atlasHandling.length,
    failureClassifications: [...run.adjudication.failureClassifications],
  };
}

function recall<T>(required: T[], reported: Set<string>, key: (value: T) => string) {
  const recalled = required.filter((value) => reported.has(key(value))).length;
  return recalled / required.length;
}

function toSymbolIdentity(symbol: z.infer<typeof symbolReferenceSchema>) {
  return `${symbol.file}#${symbol.name}`;
}

function addDuplicateIssues(
  values: string[],
  context: z.RefinementCtx,
  path: string,
) {
  if (new Set(values).size !== values.length) {
    context.addIssue({
      code: "custom",
      message: `${path} must have unique identifiers`,
      path: [path],
    });
  }
}

function addUniqueValueIssue(
  values: string[],
  context: z.RefinementCtx,
  path: PropertyKey[],
) {
  if (new Set(values).size !== values.length) {
    context.addIssue({
      code: "custom",
      message: "Values must be unique",
      path,
    });
  }
}

function addSequenceIssues(
  events: Array<{ sequence: number }>,
  context: z.RefinementCtx,
  path: string,
) {
  for (const [index, event] of events.entries()) {
    if (index > 0 && event.sequence <= events[index - 1]!.sequence) {
      context.addIssue({
        code: "custom",
        message: `${path} sequence values must be strictly increasing`,
        path: ["observations", path, index, "sequence"],
      });
    }
  }
}
