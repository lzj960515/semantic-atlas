import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  baselineEvaluationPlanSchema,
  evaluationPlanSchema,
  evaluationRunSchema,
  summarizeEvaluationRun,
} from "../../src/evaluation/contracts.js";

const plan = {
  schemaVersion: 1,
  cases: [
    {
      id: "location-nest-provider",
      title: "Locate a NestJS provider",
      category: "location",
      frameworks: ["nestjs"],
      fixture: {
        kind: "synthetic",
        repository: "framework-evaluation",
        revision: "fixture-v1",
      },
      prompt: "Locate the provider that creates an invoice.",
      oracle: {
        acceptanceCriteria: [
          "The answer identifies the provider method that creates an invoice.",
        ],
        requiredFiles: ["src/invoices/invoice.service.ts"],
        requiredSymbols: [
          {
            file: "src/invoices/invoice.service.ts",
            name: "InvoiceService.createInvoice",
          },
        ],
      },
    },
  ],
};

describe("evaluation artifact contracts", () => {
  it("accepts a planned case with an explicit evidence oracle", () => {
    expect(evaluationPlanSchema.parse(plan)).toEqual(plan);
  });

  it("rejects an evaluation case without required files or symbols", () => {
    const invalidPlan = structuredClone(plan);
    invalidPlan.cases[0]!.oracle.requiredFiles = [];
    invalidPlan.cases[0]!.oracle.requiredSymbols = [];

    expect(() => evaluationPlanSchema.parse(invalidPlan)).toThrow(
      /requiredFiles|requiredSymbols/,
    );
  });

  it("rejects duplicate oracle entries that would distort recall", () => {
    const invalidPlan = structuredClone(plan);
    invalidPlan.cases[0]!.oracle.requiredFiles.push(
      "src/invoices/invoice.service.ts",
    );

    expect(() => evaluationPlanSchema.parse(invalidPlan)).toThrow(/unique/);
  });

  it("derives recall and source-use metrics from a Fresh Agent run", () => {
    const run = evaluationRunSchema.parse({
      schemaVersion: 1,
      runId: "run-2026-08-10-location-nest-provider-no-atlas-01",
      caseId: "location-nest-provider",
      mode: "no-atlas",
      fixtureRevision: "fixture-v1",
      agent: {
        product: "codex",
        model: "gpt-5",
        freshContext: true,
      },
      protocol: {
        runnerVersion: "fresh-agent-runner-v1",
        fixtureCommit: "0123456789abcdef0123456789abcdef01234567",
        instructionsHash: "a".repeat(64),
        toolPolicyHash: "b".repeat(64),
        oracleHidden: true,
        commandAuditPassed: true,
        commandAudit: {
          policy: "fresh-agent-shell-allowlist-v4",
          commands: ["/bin/zsh -lc 'node $EVALUATION_OBSERVER read src/invoices/invoice.service.ts'"],
        },
      },
      startedAt: "2026-08-10T00:00:00.000Z",
      finishedAt: "2026-08-10T00:01:00.000Z",
      observations: {
        sourceTokenMethod: "codex-source-input-v1",
        sourceOpens: [
          {
            sequence: 1,
            file: "src/invoices/invoice.service.ts",
            sourceTokens: 120,
          },
          {
            sequence: 2,
            file: "src/invoices/invoice.module.ts",
            sourceTokens: 80,
          },
        ],
        atlasCalls: [],
        atlasHandling: [],
      },
      answer: {
        response:
          "InvoiceService.createInvoice in src/invoices/invoice.service.ts creates the invoice.",
        reportedFiles: ["src/invoices/invoice.service.ts"],
        reportedSymbols: [
          {
            file: "src/invoices/invoice.service.ts",
            name: "InvoiceService.createInvoice",
          },
        ],
      },
      adjudication: {
        correct: true,
        notes: "The answer identifies the implementation and its file.",
        failureClassifications: [],
      },
    });

    expect(summarizeEvaluationRun(plan.cases[0]!, run)).toEqual({
      caseId: "location-nest-provider",
      runId: run.runId,
      mode: "no-atlas",
      correct: true,
      requiredFileRecall: 1,
      requiredSymbolRecall: 1,
      openedFileCount: 2,
      sourceTokens: 200,
      atlasCallCount: 0,
      atlasHandlingCount: 0,
      failureClassifications: [],
    });
  });

  it("rejects Atlas use in a no-Atlas run", () => {
    const invalidRun = {
      schemaVersion: 1,
      runId: "run-1",
      caseId: "case-1",
      mode: "no-atlas",
      fixtureRevision: "fixture-v1",
      agent: { product: "codex", model: "gpt-5", freshContext: true },
      protocol: {
        runnerVersion: "fresh-agent-runner-v1",
        fixtureCommit: "0123456789abcdef0123456789abcdef01234567",
        instructionsHash: "a".repeat(64),
        toolPolicyHash: "b".repeat(64),
        oracleHidden: true,
        commandAuditPassed: true,
        commandAudit: {
          policy: "fresh-agent-shell-allowlist-v4",
          commands: ["/bin/zsh -lc 'semantic-atlas status'"],
        },
      },
      startedAt: "2026-08-10T00:00:00.000Z",
      finishedAt: "2026-08-10T00:01:00.000Z",
      observations: {
        sourceTokenMethod: "codex-source-input-v1",
        sourceOpens: [{ sequence: 1, file: "src/example.ts", sourceTokens: 1 }],
        atlasCalls: [{ sequence: 1, command: "map search invoice" }],
        atlasHandling: [],
      },
      answer: {
        response: "No answer was produced.",
        reportedFiles: [],
        reportedSymbols: [],
      },
      adjudication: {
        correct: false,
        notes: "Atlas was used.",
        failureClassifications: ["protocol-violation"],
      },
    };

    expect(() => evaluationRunSchema.parse(invalidRun)).toThrow(/no-atlas/);
  });

  it("locks the baseline to six cases per category across all frameworks", () => {
    const publishedPlan = JSON.parse(
      readFileSync("evaluation/cases/plan.json", "utf8"),
    );

    expect(baselineEvaluationPlanSchema.parse(publishedPlan).cases).toHaveLength(
      12,
    );
    expect(() => baselineEvaluationPlanSchema.parse(plan)).toThrow(
      /six location and six dependency-impact cases/,
    );

    const privatePlan = structuredClone(publishedPlan);
    privatePlan.cases[0]!.fixture = {
      kind: "private",
      repositoryAlias: "private-repository-1",
      revision: "fixture-v1",
    };
    expect(() => baselineEvaluationPlanSchema.parse(privatePlan)).toThrow(
      /published baseline/i,
    );
  });
});
