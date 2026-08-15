import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

import { z } from "zod";

import {
  auditCodexCommands,
  auditFreshAgentSkillDiscovery,
  auditCodexRun,
  bindSourceOpensToCommands,
  verifyFreshAgentSkillDiscovery,
} from "./evaluation/codex-run-audit.js";
import {
  buildCodexIsolationArguments,
  discoverHostSkillFiles,
} from "./evaluation/codex-agent-isolation.js";
import {
  buildFreshAgentInstructions,
  installCandidateSkill,
} from "./evaluation/candidate-skill.js";
import { summarizeEvaluationComparison } from "../src/evaluation/comparison.js";
import {
  baselineEvaluationPlanSchema,
  evaluationFailureClassificationSchema,
  evaluationRunSchema,
  FRESH_AGENT_COMMAND_AUDIT_POLICY,
  knowledgeCaptureAdjudicationSchema,
  knowledgeCaptureDecisionSchema,
  type EvaluationCase,
  type EvaluationRun,
} from "../src/evaluation/contracts.js";
import { validateEvaluationFixture } from "./evaluation/fixture.js";
import {
  EVALUATION_SOURCE_TOKEN_METHOD,
  parseEvaluationSourceTrace,
} from "./evaluation/source-trace.js";
import { parseEvaluationSkillTrace } from "./evaluation/skill-trace.js";
import {
  buildKnowledgeCaptureAdjudicationEvidence,
} from "./evaluation/knowledge-capture-adjudication.js";

const RUNNER_VERSION = "fresh-agent-runner-v5";
const SOURCE_TOKEN_METHOD = EVALUATION_SOURCE_TOKEN_METHOD;
const AGENT_MODEL = "gpt-5.6-sol";
const EVALUATION_ID = "fresh-agent-v1";

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

const agentAnswerSchema = z.strictObject({
  response: z.string().min(1),
  reportedFiles: z.array(z.string().min(1)),
  reportedSymbols: z.array(z.strictObject({
    file: z.string().min(1),
    name: z.string().min(1),
  })),
  atlasHandling: z.array(atlasHandlingSchema),
  knowledgeCaptureDecision: knowledgeCaptureDecisionSchema,
});

const adjudicationResultSchema = z.strictObject({
  adjudications: z.array(z.strictObject({
    runId: z.string().min(1),
    correct: z.boolean(),
    notes: z.string().min(1),
    failureClassifications: z.array(evaluationFailureClassificationSchema),
    knowledgeCaptureDecision: knowledgeCaptureAdjudicationSchema,
  })),
});

type EvaluationDraft = Omit<EvaluationRun, "adjudication">;

const repositoryRoot = resolve(import.meta.dirname, "..");
const planPath = join(repositoryRoot, "evaluation/cases/plan.json");
const fixtureTemplate = join(repositoryRoot, "evaluation/fixtures/framework-evaluation");
const answerSchemaPath = join(repositoryRoot, "evaluation/agent-answer.schema.json");
const adjudicationSchemaPath = join(repositoryRoot, "evaluation/adjudication.schema.json");
const observerPath = join(repositoryRoot, "scripts/evaluation-source-observer.mjs");
const candidateSkillRoot = join(repositoryRoot, ".agents/skills/semantic-atlas");
const selectedCaseId = readOption("--case");
const selectedMode = readModeOption();
const publishSelectedCase = process.argv.includes("--publish-selected");
if (publishSelectedCase && selectedCaseId === undefined) {
  throw new Error("--publish-selected requires --case <case-id>");
}
if (publishSelectedCase && selectedMode !== undefined) {
  throw new Error("--publish-selected requires both evaluation modes");
}

const plan = baselineEvaluationPlanSchema.parse(JSON.parse(await readFile(planPath, "utf8")));
validateEvaluationFixture(plan, fixtureTemplate);
const selectedCases = selectedCaseId === undefined
  ? plan.cases
  : plan.cases.filter((evaluationCase) => evaluationCase.id === selectedCaseId);
if (selectedCases.length === 0) throw new Error(`Unknown evaluation case ${selectedCaseId}`);

const runtimeRoot = await mkdtemp(join(tmpdir(), "semantic-atlas-fresh-agent-"));
process.stdout.write(`Fresh Agent runtime: ${runtimeRoot}\n`);
await buildSemanticAtlas();
const fixture = await prepareFixture(runtimeRoot);
const codexVersion = (await runProcess("codex", ["--version"], { cwd: repositoryRoot })).stdout.trim();
const hostSkillFiles = await discoverHostSkillFiles();
const mcpServerIds = await discoverMcpServerIds();
const codexIsolationArguments = buildCodexIsolationArguments(hostSkillFiles, mcpServerIds);
const toolPolicyHash = sha256(JSON.stringify({
  sandbox: "workspace-write",
  sourceObserver: SOURCE_TOKEN_METHOD,
  commandAudit: FRESH_AGENT_COMMAND_AUDIT_POLICY,
  hostInstructions: "disabled",
  fixtureMutation: "rejected",
}));

const jobs = selectedCases.flatMap((evaluationCase) => (
  (selectedMode === undefined ? ["no-atlas", "atlas"] as const : [selectedMode])
    .map((mode) => ({ evaluationCase, mode }))
));
let completedJobs = 0;
const drafts = await mapWithConcurrency(jobs, 3, async ({ evaluationCase, mode }) => {
  const caseRepositories = fixture.repositories.get(evaluationCase.id)!;
  process.stdout.write(`[${completedJobs}/${jobs.length}] ${evaluationCase.id} ${mode} started\n`);
  let draft: EvaluationDraft | undefined;
  for (let executionAttempt = 1; executionAttempt <= 3; executionAttempt += 1) {
    try {
      draft = await runFreshAgent({
        evaluationCase,
        mode,
        repository: mode === "atlas" ? caseRepositories.atlas : caseRepositories.noAtlas,
        fixtureCommit: fixture.commit,
        runtimeRoot,
        codexVersion,
        toolPolicyHash,
        executionAttempt,
      });
      break;
    } catch (error) {
      process.stdout.write(
        `${evaluationCase.id} ${mode} attempt ${executionAttempt} invalid: `
        + `${error instanceof Error ? error.message.split("\n")[0] : String(error)}\n`,
      );
      if (executionAttempt === 3) throw error;
    }
  }
  if (draft === undefined) throw new Error(`Fresh Agent did not produce ${evaluationCase.id} ${mode}`);
  await writeFile(
    join(runtimeRoot, `${draft.runId}-draft.json`),
    `${JSON.stringify(draft, null, 2)}\n`,
  );
  completedJobs += 1;
  process.stdout.write(
    `[${completedJobs}/${jobs.length}] ${evaluationCase.id} ${mode} completed: `
    + `${draft.observations.sourceOpens.length} source events, `
    + `${draft.observations.atlasCalls.length} Atlas calls\n`,
  );
  return draft;
});

process.stdout.write(`Independent adjudication started for ${drafts.length} runs\n`);
const adjudications = await adjudicateRuns(selectedCases, drafts, runtimeRoot);
const runs = drafts.map((draft) => evaluationRunSchema.parse({
  ...draft,
  adjudication: requireAdjudication(draft.runId, adjudications),
}));

if (selectedCaseId === undefined) {
  const comparison = summarizeEvaluationComparison(plan, runs);
  await publishResults({
    runs,
    comparison,
    fixtureCommit: fixture.commit,
    codexVersion,
  });
  process.stdout.write(`${JSON.stringify(comparison.gate)}\n`);
} else if (publishSelectedCase) {
  const retainedRuns = await readPublishedRunsExcept(selectedCaseId);
  const publishedRuns = [...retainedRuns, ...runs];
  const comparison = summarizeEvaluationComparison(plan, publishedRuns);
  await publishResults({
    runs: publishedRuns,
    comparison,
    fixtureCommit: fixture.commit,
    codexVersion,
  });
  process.stdout.write(`${JSON.stringify(comparison.gate)}\n`);
} else {
  const smokePath = join(runtimeRoot, `${selectedCaseId}-runs.json`);
  await writeFile(smokePath, `${JSON.stringify(runs, null, 2)}\n`);
  process.stdout.write(`Smoke run records: ${smokePath}\n`);
}

async function buildSemanticAtlas(): Promise<void> {
  const result = await runProcess("corepack", ["pnpm", "build"], { cwd: repositoryRoot });
  process.stdout.write(result.stdout);
}

async function prepareFixture(runtime: string): Promise<{
  readonly commit: string;
  readonly repositories: ReadonlyMap<string, {
    readonly noAtlas: string;
    readonly atlas: string;
  }>;
}> {
  const sourceRepository = join(runtime, "fixture-source");
  await cp(fixtureTemplate, sourceRepository, { recursive: true });
  await runProcess("git", ["init", "--quiet", "--initial-branch=main"], { cwd: sourceRepository });
  await runProcess("git", ["config", "user.name", "Semantic Atlas Evaluation"], { cwd: sourceRepository });
  await runProcess("git", ["config", "user.email", "evaluation@semantic-atlas.invalid"], { cwd: sourceRepository });
  await runProcess("git", ["add", "."], { cwd: sourceRepository });
  await runProcess("git", ["commit", "--quiet", "--no-gpg-sign", "-m", "test: establish fixture v1"], {
    cwd: sourceRepository,
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: "2026-08-14T00:00:00Z",
      GIT_COMMITTER_DATE: "2026-08-14T00:00:00Z",
    },
  });
  await runProcess("git", ["tag", "fixture-v1"], { cwd: sourceRepository });
  const commit = (await runProcess("git", ["rev-parse", "HEAD"], { cwd: sourceRepository })).stdout.trim();

  const shimDirectory = join(runtime, "bin");
  await mkdir(shimDirectory, { recursive: true });
  const shimPath = join(shimDirectory, "semantic-atlas");
  await writeFile(
    shimPath,
    `#!/bin/sh\nexec node '${join(repositoryRoot, "dist/cli/bin.js")}' "$@"\n`,
  );
  await chmod(shimPath, 0o755);
  const atlasEnvironment = withAtlasPath(shimDirectory);
  const repositories = new Map<string, { noAtlas: string; atlas: string }>();
  for (const [index, evaluationCase] of selectedCases.entries()) {
    const caseRoot = join(runtime, "repositories", evaluationCase.id);
    await mkdir(caseRoot, { recursive: true });
    const noAtlas = join(caseRoot, "no-atlas");
    const atlas = join(caseRoot, "atlas");
    await runProcess("git", ["clone", "--quiet", "--no-hardlinks", sourceRepository, noAtlas], {
      cwd: caseRoot,
    });
    await runProcess("git", ["clone", "--quiet", "--no-hardlinks", sourceRepository, atlas], {
      cwd: caseRoot,
    });
    await installCandidateSkill(candidateSkillRoot, atlas);
    const indexResult = await runProcess("semantic-atlas", ["index"], {
      cwd: atlas,
      env: atlasEnvironment,
      timeoutMs: 120_000,
    });
    const status = await runProcess("semantic-atlas", ["status"], {
      cwd: atlas,
      env: atlasEnvironment,
    });
    const statusEnvelope = JSON.parse(status.stdout) as {
      data?: { freshness?: string; backend?: { completeness?: string } };
    };
    if (
      statusEnvelope.data?.freshness !== "current"
      || statusEnvelope.data.backend?.completeness !== "complete"
    ) {
      throw new Error(`Prepared Atlas fixture ${evaluationCase.id} is not current and complete`);
    }
    await requireCleanFixture(noAtlas);
    await requireCleanFixture(atlas);
    repositories.set(evaluationCase.id, { noAtlas, atlas });
    process.stdout.write(
      `Atlas fixture ${index + 1}/${selectedCases.length} indexed: ${oneLine(indexResult.stdout)}\n`,
    );
  }
  return { commit, repositories };
}

async function runFreshAgent(options: {
  readonly evaluationCase: EvaluationCase;
  readonly mode: EvaluationRun["mode"];
  readonly repository: string;
  readonly fixtureCommit: string;
  readonly runtimeRoot: string;
  readonly codexVersion: string;
  readonly toolPolicyHash: string;
  readonly executionAttempt: number;
}): Promise<EvaluationDraft> {
  const runId = `${EVALUATION_ID}-${options.evaluationCase.id}-${options.mode}`;
  const artifactPrefix = `${runId}-attempt-${options.executionAttempt}`;
  const tracePath = join(options.runtimeRoot, `${artifactPrefix}-source.jsonl`);
  const skillTracePath = join(options.runtimeRoot, `${artifactPrefix}-skill.jsonl`);
  const outputPath = join(options.runtimeRoot, `${artifactPrefix}-answer.json`);
  const rawLogPath = join(options.runtimeRoot, `${artifactPrefix}-codex.jsonl`);
  const errorLogPath = join(options.runtimeRoot, `${artifactPrefix}-codex.stderr.log`);
  const instructions = buildFreshAgentInstructions(options.evaluationCase.prompt);
  const startedAt = new Date().toISOString();
  const agentEnvironment: NodeJS.ProcessEnv = {
    ...process.env,
    EVALUATION_ROOT: options.repository,
    EVALUATION_TRACE: tracePath,
    EVALUATION_SKILL_TRACE: skillTracePath,
    EVALUATION_OBSERVER: observerPath,
  };
  delete agentEnvironment.OPENAI_API_KEY;
  if (options.mode === "atlas") {
    agentEnvironment.PATH = `${join(options.runtimeRoot, "bin")}:${agentEnvironment.PATH ?? ""}`;
  }
  const result = await runProcess("codex", [
    "exec",
    ...codexIsolationArguments,
    "--ephemeral",
    "--disable",
    "multi_agent",
    "--disable",
    "memories",
    "--json",
    "--model",
    AGENT_MODEL,
    "--sandbox",
    "workspace-write",
    "--cd",
    options.repository,
    "--add-dir",
    options.runtimeRoot,
    "--output-schema",
    answerSchemaPath,
    "--output-last-message",
    outputPath,
    instructions,
  ], {
    cwd: options.repository,
    env: agentEnvironment,
    timeoutMs: 600_000,
  });
  const finishedAt = new Date().toISOString();
  await writeFile(rawLogPath, result.stdout);
  await writeFile(errorLogPath, result.stderr);
  const audit = auditCodexRun(options.mode, result.stdout);
  const answer = agentAnswerSchema.parse(JSON.parse(await readFile(outputPath, "utf8")));
  const sourceOpens = bindSourceOpensToCommands(
    await readSourceTrace(tracePath),
    audit.sourceCommands,
  );
  const skillLoads = await readSkillTrace(skillTracePath);
  const skillDiscovery = options.mode === "atlas"
    ? auditFreshAgentSkillDiscovery(audit.commands, skillLoads, {
      atlasCalls: audit.atlasCalls,
      sourceOpens,
      reportedFiles: answer.reportedFiles,
      reportedSymbols: answer.reportedSymbols,
      requiredFiles: options.evaluationCase.oracle.requiredFiles,
      requiredSymbols: options.evaluationCase.oracle.requiredSymbols,
      knowledgeCaptureDecision: answer.knowledgeCaptureDecision,
    })
    : undefined;
  await requireCleanFixture(options.repository);

  return {
    schemaVersion: 1,
    runId,
    caseId: options.evaluationCase.id,
    mode: options.mode,
    fixtureRevision: options.evaluationCase.fixture.revision,
    agent: {
      product: options.codexVersion,
      model: AGENT_MODEL,
      freshContext: true,
    },
    protocol: {
      runnerVersion: RUNNER_VERSION,
      fixtureCommit: options.fixtureCommit,
      instructionsHash: sha256(instructions),
      toolPolicyHash: options.toolPolicyHash,
      oracleHidden: true,
      commandAuditPassed: true,
      commandAudit: {
        policy: FRESH_AGENT_COMMAND_AUDIT_POLICY,
        commands: audit.commands,
      },
      skillDiscovery,
    },
    startedAt,
    finishedAt,
    observations: {
      sourceTokenMethod: SOURCE_TOKEN_METHOD,
      sourceOpens,
      atlasCalls: audit.atlasCalls,
      atlasHandling: answer.atlasHandling.map((handling, index) => ({
        ...handling,
        sequence: index + 1,
      })),
      skillLoads: [...skillLoads],
    },
    answer: {
      response: answer.response.replaceAll(`${options.repository}/`, ""),
      reportedFiles: answer.reportedFiles,
      reportedSymbols: answer.reportedSymbols,
      knowledgeCaptureDecision: answer.knowledgeCaptureDecision,
    },
  };
}

async function adjudicateRuns(
  cases: readonly EvaluationCase[],
  drafts: readonly EvaluationDraft[],
  runtime: string,
) {
  const records = drafts.map((draft) => ({
    runId: draft.runId,
    case: cases.find((evaluationCase) => evaluationCase.id === draft.caseId),
    mode: draft.mode,
    answer: draft.answer,
    atlasHandling: draft.observations.atlasHandling,
    knowledgeCaptureEvidence: buildKnowledgeCaptureAdjudicationEvidence(draft),
  }));
  const outputPath = join(runtime, "independent-adjudication.json");
  const prompt = [
    "You are the independent evaluator for a completed Fresh Agent experiment. You did not guide any run.",
    "Judge every answer independently against its case acceptance criteria, required files, and required symbols.",
    "Correct means the response answers the prompt and the reported evidence covers the oracle. Classify every incorrect result.",
    "For Atlas runs, classify stale, hypothesis, unknown, or unsupported facts presented as exact with the matching failure type.",
    "Judge knowledgeCaptureDecision separately against knowledgeCaptureEvidence and the answer. Persist is correct when missing or insufficient Atlas business knowledge caused successful source confirmation of durable reusable business meaning; reuse requires that the retained Atlas business nodes already express that meaning; transient is for one-off context; unverified is for meaning without decisive verification.",
    "Return the evaluated answer outcome, a boolean verdict, and notes in knowledgeCaptureDecision. A wrong outcome makes the whole run incorrect and requires protocol-violation.",
    "Return exactly one adjudication for every runId. Use an empty failureClassifications array only for correct answers.",
    "Do not use tools. The complete evaluation material follows as JSON:",
    JSON.stringify(records),
  ].join("\n\n");
  const environment = { ...process.env };
  delete environment.OPENAI_API_KEY;
  const result = await runProcess("codex", [
    "exec",
    ...codexIsolationArguments,
    "--ephemeral",
    "--disable",
    "multi_agent",
    "--disable",
    "memories",
    "--json",
    "--model",
    AGENT_MODEL,
    "--sandbox",
    "read-only",
    "--skip-git-repo-check",
    "--cd",
    runtime,
    "--output-schema",
    adjudicationSchemaPath,
    "--output-last-message",
    outputPath,
    prompt,
  ], { cwd: runtime, env: environment, timeoutMs: 600_000 });
  await writeFile(join(runtime, "independent-adjudication-codex.jsonl"), result.stdout);
  await writeFile(join(runtime, "independent-adjudication-codex.stderr.log"), result.stderr);
  const adjudication = adjudicationResultSchema.parse(
    JSON.parse(await readFile(outputPath, "utf8")),
  );
  const expected = new Set(drafts.map((draft) => draft.runId));
  const actual = new Set(adjudication.adjudications.map((item) => item.runId));
  if (actual.size !== expected.size || [...expected].some((runId) => !actual.has(runId))) {
    throw new Error("Independent adjudication did not return every run exactly once");
  }
  return adjudication.adjudications;
}

function requireAdjudication(
  runId: string,
  adjudications: z.infer<typeof adjudicationResultSchema>["adjudications"],
) {
  const matches = adjudications.filter((adjudication) => adjudication.runId === runId);
  if (matches.length !== 1) throw new Error(`Expected one adjudication for ${runId}`);
  const { runId: _runId, ...result } = matches[0]!;
  return result;
}

async function publishResults(options: {
  readonly runs: readonly EvaluationRun[];
  readonly comparison: ReturnType<typeof summarizeEvaluationComparison>;
  readonly fixtureCommit: string;
  readonly codexVersion: string;
}): Promise<void> {
  const resultRoot = join(repositoryRoot, "evaluation/results", EVALUATION_ID);
  const runRoot = join(resultRoot, "runs");
  await mkdir(runRoot, { recursive: true });
  for (const run of options.runs) {
    await writeFile(join(runRoot, `${run.runId}.json`), `${JSON.stringify(run, null, 2)}\n`);
  }
  const report = {
    schemaVersion: 1,
    evaluationId: EVALUATION_ID,
    generatedAt: new Date().toISOString(),
    fixture: {
      repository: "framework-evaluation",
      revision: "fixture-v1",
      commit: options.fixtureCommit,
    },
    agent: {
      product: options.codexVersion,
      model: AGENT_MODEL,
    },
    protocol: {
      runnerVersions: uniqueSorted(options.runs.map((run) => run.protocol.runnerVersion)),
      sourceTokenMethod: SOURCE_TOKEN_METHOD,
      commandAuditPolicies: uniqueSorted(
        options.runs.map((run) => run.protocol.commandAudit.policy),
      ),
      toolPolicyHashes: uniqueSorted(options.runs.map((run) => run.protocol.toolPolicyHash)),
      freshContextPerRun: true,
      oracleHiddenDuringRuns: true,
      independentAdjudication: true,
    },
    caseCount: plan.cases.length,
    runCount: options.runs.length,
    comparison: options.comparison,
  };
  await writeFile(join(resultRoot, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`Published ${options.runs.length} run records to ${resultRoot}\n`);
}

async function readPublishedRunsExcept(caseId: string): Promise<EvaluationRun[]> {
  const runRoot = join(repositoryRoot, "evaluation/results", EVALUATION_ID, "runs");
  const files = (await readdir(runRoot)).filter((file) => file.endsWith(".json")).sort();
  const runs: EvaluationRun[] = [];
  for (const file of files) {
    const value = JSON.parse(await readFile(join(runRoot, file), "utf8")) as { caseId?: unknown };
    if (value.caseId === caseId) continue;
    const run = evaluationRunSchema.parse(value);
    const audit = auditCodexCommands(run.mode, run.protocol.commandAudit.commands);
    if (!sameAtlasCalls(audit.atlasCalls, run.observations.atlasCalls)) {
      throw new Error(`Published command evidence disagrees with Atlas calls for ${run.runId}`);
    }
    const evaluationCase = plan.cases.find((item) => item.id === run.caseId);
    if (evaluationCase === undefined) {
      throw new Error(`Published run ${run.runId} references unknown case ${run.caseId}`);
    }
    verifyFreshAgentSkillDiscovery(run, evaluationCase);
    runs.push(run);
  }
  const expectedCount = plan.cases.length * 2 - 2;
  if (runs.length !== expectedCount) {
    throw new Error(`Expected ${expectedCount} retained published runs, received ${runs.length}`);
  }
  return runs;
}

async function readSourceTrace(path: string): Promise<EvaluationRun["observations"]["sourceOpens"]> {
  const contents = await readFile(path, "utf8").catch(() => "");
  if (contents.trim().length === 0) {
    throw new Error(`Fresh Agent produced no observed source reads: ${basename(path)}`);
  }
  return parseEvaluationSourceTrace(contents);
}

async function readSkillTrace(path: string) {
  const contents = await readFile(path, "utf8").catch(() => "");
  return parseEvaluationSkillTrace(contents);
}

async function requireCleanFixture(repository: string): Promise<void> {
  const status = await runProcess(
    "git",
    ["status", "--short", "--untracked-files=all"],
    { cwd: repository },
  );
  if (status.stdout.trim().length > 0) {
    throw new Error(`Evaluation fixture was modified:\n${status.stdout}`);
  }
}

async function discoverMcpServerIds(): Promise<readonly string[]> {
  const result = await runProcess("codex", ["mcp", "list", "--json"], {
    cwd: repositoryRoot,
  });
  const servers = z.array(z.object({ name: z.string().min(1) })).parse(
    JSON.parse(result.stdout),
  );
  return servers.map((server) => server.name);
}

function withAtlasPath(shimDirectory: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: `${shimDirectory}:${process.env.PATH ?? ""}`,
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function oneLine(value: string): string {
  return value.trim().replace(/\s+/gu, " ").slice(0, 240);
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function sameAtlasCalls(
  left: EvaluationRun["observations"]["atlasCalls"],
  right: EvaluationRun["observations"]["atlasCalls"],
): boolean {
  return left.length === right.length && left.every((call, index) => (
    call.sequence === right[index]?.sequence && call.command === right[index]?.command
  ));
}

function readOption(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function readModeOption(): EvaluationRun["mode"] | undefined {
  const value = readOption("--mode");
  if (value === undefined) return undefined;
  if (value !== "atlas" && value !== "no-atlas") {
    throw new Error("--mode must be atlas or no-atlas");
  }
  return value;
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await operation(values[index]!);
    }
  }));
  return results;
}

async function runProcess(
  command: string,
  arguments_: readonly string[],
  options: {
    readonly cwd: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly timeoutMs?: number;
  },
): Promise<{ readonly stdout: string; readonly stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, [...arguments_], {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${command} timed out after ${options.timeoutMs ?? 60_000}ms`));
    }, options.timeoutMs ?? 60_000);
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(
          `${command} ${arguments_.join(" ")} exited ${code}\n${stderr}\n${stdout}`,
        ));
        return;
      }
      resolvePromise({ stdout, stderr });
    });
  });
}
