import { describe, expect, it } from "vitest";

import { summarizeEvaluationComparison } from "../../src/evaluation/comparison.js";

const plan = {
  schemaVersion: 1,
  cases: [{
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
      requiredSymbols: [{
        file: "src/invoices/invoice.service.ts",
        name: "InvoiceService.createInvoice",
      }],
    },
  }],
};

describe("Fresh Agent evaluation comparison", () => {
  it("passes an equivalent Atlas answer with at least 30 percent less source context", () => {
    const comparison = summarizeEvaluationComparison(plan, [
      evaluationRun("no-atlas", { openedFiles: 4, sourceTokens: 1_000 }),
      evaluationRun("atlas", { openedFiles: 2, sourceTokens: 600 }),
    ]);

    expect(comparison.medians).toEqual({
      noAtlas: { openedFileCount: 4, sourceTokens: 1_000 },
      atlas: { openedFileCount: 2, sourceTokens: 600 },
    });
    expect(comparison.reductions).toEqual({
      openedFilePercent: 50,
      sourceTokenPercent: 40,
    });
    expect(comparison.gate).toEqual({
      noRegression: true,
      uncertaintyHandled: true,
      reductionThresholdMet: true,
      passed: true,
    });
  });

  it("fails the no-regression gate when Atlas misses required evidence", () => {
    const atlasRun = evaluationRun("atlas", { openedFiles: 1, sourceTokens: 200 });
    atlasRun.answer.reportedFiles = [];
    atlasRun.answer.reportedSymbols = [];
    atlasRun.adjudication.correct = false;
    atlasRun.adjudication.failureClassifications = ["missed-dependency"];

    const comparison = summarizeEvaluationComparison(plan, [
      evaluationRun("no-atlas", { openedFiles: 4, sourceTokens: 1_000 }),
      atlasRun,
    ]);

    expect(comparison.pairs[0]?.noRegression).toBe(false);
    expect(comparison.gate.noRegression).toBe(false);
    expect(comparison.gate.passed).toBe(false);
  });

  it("rejects paired runs produced by different agent or protocol settings", () => {
    const noAtlas = evaluationRun("no-atlas", { openedFiles: 4, sourceTokens: 1_000 });
    const atlas = evaluationRun("atlas", { openedFiles: 2, sourceTokens: 600 });
    atlas.agent.model = "different-model";

    expect(() => summarizeEvaluationComparison(plan, [noAtlas, atlas])).toThrow(
      /same agent product, model, fixture commit, instructions, tool policy, and source-token method/,
    );
  });

  it("requires exactly one run per mode for every planned case", () => {
    expect(() => summarizeEvaluationComparison(plan, [
      evaluationRun("no-atlas", { openedFiles: 4, sourceTokens: 1_000 }),
    ])).toThrow(/exactly one no-atlas and one atlas run/);
  });
});

function evaluationRun(
  mode: "no-atlas" | "atlas",
  metrics: { openedFiles: number; sourceTokens: number },
) {
  const sourceOpens = Array.from({ length: metrics.openedFiles }, (_, index) => ({
    sequence: index + 1,
    file: index === 0
      ? "src/invoices/invoice.service.ts"
      : `src/support/file-${index}.ts`,
    sourceTokens: index === 0 ? metrics.sourceTokens : 0,
  }));
  return {
    schemaVersion: 1 as const,
    runId: `run-${mode}`,
    caseId: "location-nest-provider",
    mode,
    fixtureRevision: "fixture-v1",
    agent: {
      product: "codex-cli",
      model: "gpt-5.6-sol",
      freshContext: true as const,
    },
    protocol: {
      runnerVersion: "fresh-agent-runner-v1",
      fixtureCommit: "0123456789abcdef0123456789abcdef01234567",
      instructionsHash: "a".repeat(64),
      toolPolicyHash: "b".repeat(64),
      oracleHidden: true as const,
      commandAuditPassed: true as const,
      commandAudit: {
        policy: "fresh-agent-shell-allowlist-v3" as const,
        commands: [mode === "atlas"
          ? "/bin/zsh -lc 'semantic-atlas status'"
          : "/bin/zsh -lc 'node $EVALUATION_OBSERVER read src/invoices/invoice.service.ts'"],
      },
    },
    startedAt: "2026-08-14T00:00:00.000Z",
    finishedAt: "2026-08-14T00:01:00.000Z",
    observations: {
      sourceTokenMethod: "tiktoken-o200k_base-v1",
      sourceOpens,
      atlasCalls: mode === "atlas"
        ? [{ sequence: 1, command: "semantic-atlas status" }]
        : [],
      atlasHandling: [],
    },
    answer: {
      response: "InvoiceService.createInvoice creates the invoice.",
      reportedFiles: ["src/invoices/invoice.service.ts"],
      reportedSymbols: [{
        file: "src/invoices/invoice.service.ts",
        name: "InvoiceService.createInvoice",
      }],
    },
    adjudication: {
      correct: true,
      notes: "The answer satisfies the oracle.",
      failureClassifications: [] as string[],
    },
  };
}
