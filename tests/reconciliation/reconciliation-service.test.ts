import { afterEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type {
  MapUpdateCandidate,
  ReviewObservationInput,
  TaskObservationInput,
} from "../../src/contracts/observation.js";
import { ObservationApplication } from "../../src/observations/observation-application.js";
import { ObservationStore } from "../../src/observations/observation-store.js";
import { RepositoryIdentityResolver } from "../../src/observations/repository-identity.js";
import { ReconciliationService } from "../../src/reconciliation/reconciliation-service.js";

interface ControlledCase extends MapUpdateCandidate {
  readonly id: string;
  readonly expectedOutcome: "candidate" | "discarded";
}

interface ControlledSuite {
  readonly schemaVersion: 1;
  readonly cases: readonly ControlledCase[];
}

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const controlledRepository = path.join(
  projectRoot,
  "tests/fixtures/agent-skill/repository",
);
const sandboxes: string[] = [];
const execFileAsync = promisify(execFile);

afterEach(async () => {
  await Promise.all(sandboxes.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe("ReconciliationService", () => {
  it("groups durable candidates by business domain and preserves every origin", async () => {
    const fixture = await createFixture();
    const suite = await readControlledSuite();
    await recordControlledObservations(fixture.application, suite);

    const report = await fixture.service.listCandidates(controlledRepository);

    expect(report.summary).toEqual({
      businessDomains: 2,
      candidateGroups: 4,
      candidateOccurrences: 5,
      duplicateGroups: 1,
    });
    expect(report.domains.map(({ businessDomainId }) => businessDomainId)).toEqual([
      "commerce",
      "engagement",
    ]);

    const commerce = report.domains[0];
    const anchor = commerce?.candidates.find(({ kind }) => kind === "anchor");
    expect(anchor).toMatchObject({
      kind: "anchor",
      summary: "Replace the stale inventory reservation anchor with the current fulfillment source.",
      duplicate: true,
    });
    expect(anchor?.origins.map(({ taskObservationId }) => taskObservationId)).toEqual([
      "observation-stale-anchor-duplicate",
      "observation-stale-anchor-primary",
    ]);
    expect(anchor?.origins[0]).toMatchObject({
      disposition: "confirmed",
      task: { taskId: "task-stale-anchor-duplicate" },
      reviews: [{ review: { verdict: "approved" } }],
    });

    const contradicted = commerce?.candidates.find(({ kind }) => kind === "relation");
    expect(contradicted?.origins[0]).toMatchObject({
      disposition: "contradicted",
      evidence: [
        { kind: "source", reference: "src/checkout/authorize-order.ts" },
        { kind: "source", reference: "src/risk/current-risk-policy.ts" },
      ],
      map: {
        dispositions: [{ status: "contradicted" }],
      },
      reviews: [{ review: { impactCompleteness: "complete" } }],
    });

    const unresolved = report.domains[1]?.candidates[0];
    expect(unresolved?.origins[0]?.disposition).toBe("unresolved");
    expect(JSON.stringify(report)).not.toContain("discarded-transient-observation");
  });

  it("returns the same report without changing source, Git, maps, or observations", async () => {
    const fixture = await createFixture();
    const suite = await readControlledSuite();
    await recordControlledObservations(fixture.application, suite);
    const repositoryDocument = path.join(
      controlledRepository,
      "docs/business-map/controlled-commerce.yaml",
    );
    const beforeMap = await readFile(repositoryDocument, "utf8");
    const beforeMapStatus = await stat(repositoryDocument);
    const beforeGitStatus = await gitStatus(controlledRepository);
    const observationRoot = path.join(
      fixture.userHome,
      ".semantic-atlas/observations/v1/repositories",
    );
    const beforeObservations = await directorySnapshot(observationRoot);

    const first = await fixture.service.listCandidates(controlledRepository);
    const second = await fixture.service.listCandidates(controlledRepository);

    expect(second).toEqual(first);
    expect(await readFile(repositoryDocument, "utf8")).toBe(beforeMap);
    expect((await stat(repositoryDocument)).mtimeMs).toBe(beforeMapStatus.mtimeMs);
    expect(await directorySnapshot(observationRoot)).toEqual(beforeObservations);
    expect(await gitStatus(controlledRepository)).toBe(beforeGitStatus);
  });
});

async function createFixture(): Promise<{
  readonly userHome: string;
  readonly application: ObservationApplication;
  readonly service: ReconciliationService;
}> {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "semantic-atlas-reconcile-"));
  sandboxes.push(sandbox);
  const userHome = path.join(sandbox, "home");
  const resolver = new RepositoryIdentityResolver();
  const store = new ObservationStore({ userHome });
  return {
    userHome,
    application: new ObservationApplication(resolver, store),
    service: new ReconciliationService(resolver, store),
  };
}

async function readControlledSuite(): Promise<ControlledSuite> {
  return JSON.parse(await readFile(
    path.join(projectRoot, "tests/fixtures/reconciliation/cases.json"),
    "utf8",
  )) as ControlledSuite;
}

async function recordControlledObservations(
  application: ObservationApplication,
  suite: ControlledSuite,
): Promise<void> {
  expect(suite.schemaVersion).toBe(1);
  for (const controlledCase of suite.cases) {
    for (const evidence of controlledCase.evidence) {
      await expect(stat(path.join(controlledRepository, evidence.reference))).resolves.toBeTruthy();
    }
    const taskObservationId = `observation-${controlledCase.id}`;
    const task = taskObservation(taskObservationId, controlledCase);
    await application.recordTask(controlledRepository, task);
    await application.recordReview(
      controlledRepository,
      reviewObservation(taskObservationId, controlledCase.id),
    );
  }
}

function taskObservation(
  id: string,
  controlledCase: ControlledCase,
): TaskObservationInput {
  return {
    schemaVersion: 1,
    id,
    recordedAt: "2026-08-27T10:00:00.000Z",
    task: {
      taskId: `task-${controlledCase.id}`,
      runId: `run-${controlledCase.id}`,
    },
    map: {
      queries: [{ selector: controlledCase.businessDomainId, outcome: "concept_not_found" }],
      dispositions: [{
        status: controlledCase.disposition === "confirmed"
          ? "confirmed"
          : controlledCase.disposition,
        summary: controlledCase.summary,
        evidence: controlledCase.evidence,
      }],
    },
    mapUpdateCandidates: controlledCase.expectedOutcome === "candidate"
      ? [{
          businessDomainId: controlledCase.businessDomainId,
          kind: controlledCase.kind,
          disposition: controlledCase.disposition,
          summary: controlledCase.summary,
          evidence: controlledCase.evidence,
        }]
      : [],
  };
}

function reviewObservation(
  taskObservationId: string,
  caseId: string,
): ReviewObservationInput {
  return {
    schemaVersion: 1,
    id: `review-${caseId}`,
    recordedAt: "2026-08-27T11:00:00.000Z",
    taskObservationId,
    review: {
      taskId: `review-task-${caseId}`,
      runId: `review-run-${caseId}`,
      verdict: "approved",
      businessBoundary: "correct",
      upstreamCause: "not_applicable",
      impactCompleteness: "complete",
      requiredRework: false,
      mapCausedRegression: false,
    },
  };
}

async function directorySnapshot(
  directory: string,
): Promise<readonly { readonly path: string; readonly contents?: string }[]> {
  const paths = (await readdir(directory, { recursive: true })).sort();
  return Promise.all(paths.map(async (relativePath) => {
    const absolutePath = path.join(directory, relativePath);
    const status = await stat(absolutePath);
    return status.isFile()
      ? { path: relativePath, contents: await readFile(absolutePath, "utf8") }
      : { path: relativePath };
  }));
}

async function gitStatus(repository: string): Promise<string> {
  return (await execFileAsync("git", ["status", "--short"], { cwd: repository })).stdout;
}
