import { readFile } from "node:fs/promises";

import {
  baselineEvaluationPlanSchema,
  evaluationPlanSchema,
  evaluationRunSchema,
  summarizeEvaluationRun,
} from "../src/evaluation/contracts.js";

const commandArguments = process.argv.slice(2);
const validateBaseline = commandArguments[0] === "--baseline";
const [planPath, ...runPaths] = validateBaseline
  ? commandArguments.slice(1)
  : commandArguments;

if (planPath === undefined) {
  throw new Error(
    "Usage: validate-evaluation [--baseline] <evaluation-plan.json> [evaluation-run.json ...]",
  );
}

const planSchema = validateBaseline
  ? baselineEvaluationPlanSchema
  : evaluationPlanSchema;
const plan = planSchema.parse(await readJson(planPath));
const casesById = new Map(
  plan.cases.map((evaluationCase) => [evaluationCase.id, evaluationCase]),
);
const runs = await Promise.all(runPaths.map(readJson));
const summaries = runs.map((rawRun) => {
  const run = evaluationRunSchema.parse(rawRun);
  const evaluationCase = casesById.get(run.caseId);

  if (evaluationCase === undefined) {
    throw new Error(`Run ${run.runId} references unknown case ${run.caseId}`);
  }

  return summarizeEvaluationRun(evaluationCase, run);
});

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
