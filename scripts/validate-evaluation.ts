import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";

import {
  baselineEvaluationPlanSchema,
  evaluationPlanSchema,
  evaluationRunSchema,
  summarizeEvaluationRun,
  type EvaluationRun,
} from "../src/evaluation/contracts.js";
import {
  summarizeEvaluationComparison,
  type EvaluationComparison,
} from "../src/evaluation/comparison.js";

const commandArguments = process.argv.slice(2);
const validateBaseline = commandArguments.includes("--baseline");
const compareRuns = commandArguments.includes("--comparison");
const reportOptionIndex = commandArguments.indexOf("--report");
const reportPath = reportOptionIndex < 0
  ? undefined
  : commandArguments[reportOptionIndex + 1];
if (reportOptionIndex >= 0 && reportPath === undefined) {
  throw new Error("--report requires a report path");
}
const [planPath, ...runPaths] = commandArguments.filter((argument, index) => (
  argument !== "--baseline"
  && argument !== "--comparison"
  && argument !== "--report"
  && index !== reportOptionIndex + 1
));

if (planPath === undefined) {
  throw new Error(
    "Usage: validate-evaluation [--baseline] [--comparison] [--report <report.json>] <evaluation-plan.json> [evaluation-run.json ...]",
  );
}

const planSchema = validateBaseline
  ? baselineEvaluationPlanSchema
  : evaluationPlanSchema;
const plan = planSchema.parse(await readJson(planPath));
const casesById = new Map(
  plan.cases.map((evaluationCase) => [evaluationCase.id, evaluationCase]),
);
const runs = (await Promise.all(runPaths.map(readJson))).map((rawRun) => (
  evaluationRunSchema.parse(rawRun)
));
const summaries = runs.map((run) => {
  const evaluationCase = casesById.get(run.caseId);

  if (evaluationCase === undefined) {
    throw new Error(`Run ${run.runId} references unknown case ${run.caseId}`);
  }

  return summarizeEvaluationRun(evaluationCase, run);
});
const comparison = compareRuns
  ? summarizeEvaluationComparison(plan, runs)
  : undefined;
if (reportPath !== undefined) {
  if (comparison === undefined) {
    throw new Error("--report requires --comparison");
  }
  verifyPublishedReport(await readJson(reportPath), plan, runs, comparison);
}

const categoryCounts = Object.fromEntries(
  ["location", "dependency-impact"].map((category) => [
    category,
    plan.cases.filter((evaluationCase) => evaluationCase.category === category)
      .length,
  ]),
);
const frameworks = [
  ...new Set(plan.cases.flatMap((evaluationCase) => evaluationCase.frameworks)),
].sort();

process.stdout.write(
  `${JSON.stringify(
    {
      schemaVersion: 1,
      valid: true,
      baseline: validateBaseline,
      plan: {
        caseCount: plan.cases.length,
        categoryCounts,
        frameworks,
      },
      runs: summaries,
      ...(comparison === undefined ? {} : { comparison }),
      ...(reportPath === undefined ? {} : { reportVerified: true }),
    },
    null,
    2,
  )}\n`,
);

async function readJson(path: string) {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    throw new Error(`Unable to read JSON from ${path}`, { cause: error });
  }
}

function verifyPublishedReport(
  rawReport: unknown,
  plan: { readonly cases: readonly { readonly fixture: { readonly revision: string } }[] },
  parsedRuns: readonly EvaluationRun[],
  comparison: EvaluationComparison,
): void {
  if (!isRecord(rawReport)) throw new Error("Published evaluation report must be an object");
  const fixture = isRecord(rawReport.fixture) ? rawReport.fixture : undefined;
  const agent = isRecord(rawReport.agent) ? rawReport.agent : undefined;
  const protocol = isRecord(rawReport.protocol) ? rawReport.protocol : undefined;
  const firstRun = parsedRuns[0];
  const fixtureRevisions = new Set(plan.cases.map((item) => item.fixture.revision));
  const matches = rawReport.schemaVersion === 1
    && rawReport.caseCount === plan.cases.length
    && rawReport.runCount === parsedRuns.length
    && fixtureRevisions.size === 1
    && fixture?.revision === [...fixtureRevisions][0]
    && fixture?.commit === firstRun?.protocol.fixtureCommit
    && agent?.product === firstRun?.agent.product
    && agent?.model === firstRun?.agent.model
    && protocol?.runnerVersion === firstRun?.protocol.runnerVersion
    && protocol?.sourceTokenMethod === firstRun?.observations.sourceTokenMethod
    && protocol?.toolPolicyHash === firstRun?.protocol.toolPolicyHash
    && isDeepStrictEqual(rawReport.comparison, comparison);
  if (!matches) {
    throw new Error("Published evaluation report does not match the validated runs");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
