import {
  evaluationPlanSchema,
  evaluationRunSchema,
  summarizeEvaluationRun,
  type EvaluationRun,
  type EvaluationRunSummary,
} from "./contracts.js";

const REDUCTION_GATE_PERCENT = 30;
const UNCERTAINTY_FAILURES = new Set([
  "stale-knowledge",
  "hypothesis-mishandled",
  "unknown-boundary-mishandled",
  "unsupported-source",
]);

export interface EvaluationPairSummary {
  readonly caseId: string;
  readonly noAtlas: EvaluationRunSummary;
  readonly atlas: EvaluationRunSummary;
  readonly noRegression: boolean;
}

export interface EvaluationComparison {
  readonly pairs: readonly EvaluationPairSummary[];
  readonly medians: {
    readonly noAtlas: EvaluationUsageMedian;
    readonly atlas: EvaluationUsageMedian;
  };
  readonly reductions: {
    readonly openedFilePercent: number;
    readonly sourceTokenPercent: number;
  };
  readonly gate: {
    readonly noRegression: boolean;
    readonly uncertaintyHandled: boolean;
    readonly reductionThresholdMet: boolean;
    readonly passed: boolean;
  };
}

export interface EvaluationUsageMedian {
  readonly openedFileCount: number;
  readonly sourceTokens: number;
}

export function summarizeEvaluationComparison(
  rawPlan: unknown,
  rawRuns: readonly unknown[],
): EvaluationComparison {
  const plan = evaluationPlanSchema.parse(rawPlan);
  const runs = rawRuns.map((run) => evaluationRunSchema.parse(run));
  requireUniqueRunIds(runs);

  const pairs = plan.cases.map((evaluationCase): EvaluationPairSummary => {
    const caseRuns = runs.filter((run) => run.caseId === evaluationCase.id);
    const noAtlas = requireModeRun(evaluationCase.id, caseRuns, "no-atlas");
    const atlas = requireModeRun(evaluationCase.id, caseRuns, "atlas");
    requireProtocolParity(noAtlas, atlas);

    const noAtlasSummary = summarizeEvaluationRun(evaluationCase, noAtlas);
    const atlasSummary = summarizeEvaluationRun(evaluationCase, atlas);
    return {
      caseId: evaluationCase.id,
      noAtlas: noAtlasSummary,
      atlas: atlasSummary,
      noRegression: preservesOutcome(noAtlasSummary, atlasSummary),
    };
  });

  const plannedCases = new Set(plan.cases.map((evaluationCase) => evaluationCase.id));
  const unexpectedRun = runs.find((run) => !plannedCases.has(run.caseId));
  if (unexpectedRun !== undefined) {
    throw new Error(`Run ${unexpectedRun.runId} references unknown case ${unexpectedRun.caseId}`);
  }

  const medians = {
    noAtlas: usageMedian(pairs.map((pair) => pair.noAtlas)),
    atlas: usageMedian(pairs.map((pair) => pair.atlas)),
  };
  const reductions = {
    openedFilePercent: reductionPercent(
      medians.noAtlas.openedFileCount,
      medians.atlas.openedFileCount,
    ),
    sourceTokenPercent: reductionPercent(
      medians.noAtlas.sourceTokens,
      medians.atlas.sourceTokens,
    ),
  };
  const noRegression = pairs.every((pair) => pair.noRegression);
  const uncertaintyHandled = pairs.every((pair) => (
    pair.atlas.failureClassifications.every((failure) => !UNCERTAINTY_FAILURES.has(failure))
  ));
  const reductionThresholdMet = reductions.openedFilePercent >= REDUCTION_GATE_PERCENT
    || reductions.sourceTokenPercent >= REDUCTION_GATE_PERCENT;

  return {
    pairs,
    medians,
    reductions,
    gate: {
      noRegression,
      uncertaintyHandled,
      reductionThresholdMet,
      passed: noRegression && uncertaintyHandled && reductionThresholdMet,
    },
  };
}

function requireUniqueRunIds(runs: readonly EvaluationRun[]): void {
  const runIds = new Set<string>();
  for (const run of runs) {
    if (runIds.has(run.runId)) {
      throw new Error(`Evaluation run ID ${run.runId} is duplicated`);
    }
    runIds.add(run.runId);
  }
}

function requireModeRun(
  caseId: string,
  runs: readonly EvaluationRun[],
  mode: EvaluationRun["mode"],
): EvaluationRun {
  const matches = runs.filter((run) => run.mode === mode);
  if (matches.length !== 1 || runs.length !== 2) {
    throw new Error(
      `Evaluation case ${caseId} requires exactly one no-atlas and one atlas run`,
    );
  }
  return matches[0]!;
}

function requireProtocolParity(noAtlas: EvaluationRun, atlas: EvaluationRun): void {
  const comparable = [
    noAtlas.agent.product === atlas.agent.product,
    noAtlas.agent.model === atlas.agent.model,
    noAtlas.protocol.fixtureCommit === atlas.protocol.fixtureCommit,
    noAtlas.protocol.instructionsHash === atlas.protocol.instructionsHash,
    noAtlas.protocol.toolPolicyHash === atlas.protocol.toolPolicyHash,
    noAtlas.observations.sourceTokenMethod === atlas.observations.sourceTokenMethod,
  ];
  if (comparable.some((matches) => !matches)) {
    throw new Error(
      "Paired runs require the same agent product, model, fixture commit, instructions, "
      + "tool policy, and source-token method",
    );
  }
}

function preservesOutcome(
  noAtlas: EvaluationRunSummary,
  atlas: EvaluationRunSummary,
): boolean {
  return Number(atlas.correct) >= Number(noAtlas.correct)
    && atlas.requiredFileRecall >= noAtlas.requiredFileRecall
    && atlas.requiredSymbolRecall >= noAtlas.requiredSymbolRecall;
}

function usageMedian(runs: readonly EvaluationRunSummary[]): EvaluationUsageMedian {
  return {
    openedFileCount: median(runs.map((run) => run.openedFileCount)),
    sourceTokens: median(runs.map((run) => run.sourceTokens)),
  };
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

function reductionPercent(baseline: number, candidate: number): number {
  if (baseline === 0) return candidate === 0 ? 0 : -100;
  return Math.round(((baseline - candidate) / baseline) * 10_000) / 100;
}
