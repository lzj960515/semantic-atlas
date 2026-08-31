import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  MaintenanceObservationInput,
  ReviewObservationInput,
  TaskObservationInput,
} from "../../src/contracts/observation.js";
import { createCliRuntime, runCli } from "../../src/cli/run-cli.js";

const sandboxes: string[] = [];

afterEach(async () => {
  await Promise.all(sandboxes.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe("semantic-atlas observation commands", () => {
  it("records task and review stdin before deriving a repository summary", async () => {
    const fixture = await createFixture();
    const task = taskObservation();
    fixture.setInput(JSON.stringify(task));

    const taskResult = await runCli([
      "observe",
      "task",
      "--stdin",
      "--repo",
      fixture.repositoryRoot,
    ], fixture.runtime);
    expect(taskResult.exitCode).toBe(0);
    expect(JSON.parse(taskResult.stdout)).toMatchObject({
      schemaVersion: 1,
      ok: true,
      command: "observe task",
      data: {
        outcome: "recorded",
        kind: "task",
        id: task.id,
      },
    });

    const review = reviewObservation(task.id);
    fixture.setInput(JSON.stringify(review));
    const reviewResult = await runCli([
      "observe",
      "review",
      "--stdin",
      "--repo",
      fixture.repositoryRoot,
    ], fixture.runtime);
    expect(reviewResult.exitCode).toBe(0);
    expect(JSON.parse(reviewResult.stdout)).toMatchObject({
      ok: true,
      command: "observe review",
      data: { outcome: "recorded", kind: "review", id: review.id },
    });

    const summaryResult = await runCli([
      "insights",
      "summary",
      "--repo",
      fixture.repositoryRoot,
      "--period",
      "7d",
    ], fixture.runtime);
    expect(summaryResult.exitCode).toBe(0);
    expect(JSON.parse(summaryResult.stdout)).toMatchObject({
      ok: true,
      command: "insights summary",
      data: {
        period: { duration: "7d" },
        summary: {
          taskObservations: 1,
          reviewObservations: 1,
          approvedReviews: 1,
          recoveries: { contradicted: 1 },
        },
      },
    });
  });

  it("returns actionable malformed-input and period errors without a partial success", async () => {
    const fixture = await createFixture();
    fixture.setInput("{ incomplete");

    const malformed = await runCli([
      "observe",
      "task",
      "--stdin",
      "--repo",
      fixture.repositoryRoot,
    ], fixture.runtime);
    expect(malformed.exitCode).toBe(1);
    expect(JSON.parse(malformed.stdout)).toMatchObject({
      ok: false,
      command: "observe task",
      error: { code: "OBSERVATION_INPUT_INVALID" },
    });

    const invalidPeriod = await runCli([
      "insights",
      "summary",
      "--repo",
      fixture.repositoryRoot,
      "--period",
      "yesterday",
    ], fixture.runtime);
    expect(invalidPeriod.exitCode).toBe(1);
    expect(JSON.parse(invalidPeriod.stdout)).toMatchObject({
      ok: false,
      command: "insights summary",
      error: { code: "INSIGHTS_PERIOD_INVALID" },
    });
  });

  it("records a maintenance result only after resolving its exact candidate source", async () => {
    const fixture = await createFixture();
    const task = {
      ...taskObservation(),
      mapUpdateCandidates: [{
        businessDomainId: "commerce",
        kind: "relation" as const,
        disposition: "contradicted" as const,
        summary: "Replace the contradicted Orders collaborator.",
        evidence: [{ kind: "source" as const, reference: "src/orders.ts" }],
      }],
    };
    await fixture.runtime.observationApplication.recordTask(
      fixture.repositoryRoot,
      task,
    );
    const maintenance = maintenanceObservation(task.id);
    fixture.setInput(JSON.stringify(maintenance));

    const result = await runCli([
      "observe",
      "maintenance",
      "--stdin",
      "--repo",
      fixture.repositoryRoot,
    ], fixture.runtime);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      schemaVersion: 1,
      ok: true,
      command: "observe maintenance",
      data: {
        outcome: "recorded",
        kind: "maintenance",
        id: maintenance.id,
      },
    });

    fixture.setInput(JSON.stringify({
      ...maintenance,
      id: "maintenance-observation-invalid-source",
      results: [{
        ...maintenance.results[0]!,
        candidate: { taskObservationId: task.id, candidateIndex: 1 },
      }],
    }));
    const invalidSource = await runCli([
      "observe",
      "maintenance",
      "--stdin",
      "--repo",
      fixture.repositoryRoot,
    ], fixture.runtime);
    expect(invalidSource.exitCode).toBe(1);
    expect(JSON.parse(invalidSource.stdout)).toMatchObject({
      ok: false,
      command: "observe maintenance",
      error: {
        code: "MAINTENANCE_CANDIDATE_INVALID",
        taskObservationId: task.id,
        candidateIndex: 1,
      },
    });
  });

  it("reports only whether the current repository requires maintenance", async () => {
    const fixture = await createFixture();
    const task = {
      ...taskObservation(),
      mapUpdateCandidates: [{
        businessDomainId: "commerce",
        kind: "anchor" as const,
        disposition: "confirmed" as const,
        summary: "Add the current Orders navigation anchor.",
        evidence: [{ kind: "source" as const, reference: "src/orders.ts" }],
      }],
    };
    await fixture.runtime.observationApplication.recordTask(
      fixture.repositoryRoot,
      task,
    );

    const required = await runCli([
      "reconcile",
      "status",
      "--repo",
      fixture.repositoryRoot,
    ], fixture.runtime);
    expect(required.exitCode).toBe(0);
    expect(JSON.parse(required.stdout)).toEqual({
      schemaVersion: 1,
      ok: true,
      command: "reconcile status",
      data: { required: true },
    });

    await fixture.runtime.observationApplication.recordMaintenance(
      fixture.repositoryRoot,
      maintenanceObservation(task.id),
    );
    const current = await runCli([
      "reconcile",
      "status",
      "--repo",
      fixture.repositoryRoot,
    ], fixture.runtime);
    expect(current.exitCode).toBe(0);
    expect(JSON.parse(current.stdout)).toMatchObject({
      command: "reconcile status",
      data: { required: false },
    });
  });

  it("waits after an unresolved origin until the same candidate gains a new origin", async () => {
    const fixture = await createFixture();
    const candidate = {
      businessDomainId: "commerce",
      kind: "anchor" as const,
      disposition: "confirmed" as const,
      summary: "Add the current Orders navigation anchor.",
      evidence: [{ kind: "source" as const, reference: "src/orders.ts" }],
    };
    const firstTask = { ...taskObservation(), mapUpdateCandidates: [candidate] };
    await fixture.runtime.observationApplication.recordTask(
      fixture.repositoryRoot,
      firstTask,
    );
    await fixture.runtime.observationApplication.recordMaintenance(
      fixture.repositoryRoot,
      maintenanceObservation(firstTask.id, "unresolved"),
    );

    const waiting = await runCli([
      "reconcile",
      "status",
      "--repo",
      fixture.repositoryRoot,
    ], fixture.runtime);
    expect(JSON.parse(waiting.stdout)).toMatchObject({
      data: { required: false },
    });

    await fixture.runtime.observationApplication.recordTask(
      fixture.repositoryRoot,
      {
        ...taskObservation(),
        id: "task-observation-cli-new-origin",
        task: { taskId: "task-cli-new-origin", runId: "run-cli-new-origin" },
        mapUpdateCandidates: [candidate],
      },
    );
    const actionable = await runCli([
      "reconcile",
      "status",
      "--repo",
      fixture.repositoryRoot,
    ], fixture.runtime);
    expect(JSON.parse(actionable.stdout)).toMatchObject({
      data: { required: true },
    });
  });
});

async function createFixture(): Promise<{
  readonly repositoryRoot: string;
  readonly runtime: Awaited<ReturnType<typeof createCliRuntime>>;
  readonly setInput: (value: string) => void;
}> {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "semantic-atlas-cli-observation-"));
  sandboxes.push(sandbox);
  const repositoryRoot = path.join(sandbox, "repository");
  await mkdir(path.join(repositoryRoot, ".git"), { recursive: true });
  let input = "";
  const runtime = await createCliRuntime({
    userHome: path.join(sandbox, "home"),
    readStandardInput: async () => input,
    now: () => new Date("2026-08-27T12:00:00.000Z"),
  });
  return {
    repositoryRoot,
    runtime,
    setInput: (value) => {
      input = value;
    },
  };
}

function taskObservation(): TaskObservationInput {
  return {
    schemaVersion: 2,
    id: "task-observation-cli",
    recordedAt: "2026-08-27T10:00:00.000Z",
    task: { taskId: "task-cli", runId: "run-cli" },
    map: {
      queries: [{
        selector: "Orders",
        outcome: "context",
        selectedConceptIds: ["commerce.orders"],
      }],
      dispositions: [{
        status: "contradicted",
        summary: "Current source contradicted the mapped collaborator.",
        evidence: [{ kind: "source", reference: "src/orders.ts" }],
      }],
    },
    mapUpdateCandidates: [],
  };
}

function reviewObservation(taskObservationId: string): ReviewObservationInput {
  return {
    schemaVersion: 1,
    id: "review-observation-cli",
    recordedAt: "2026-08-27T11:00:00.000Z",
    taskObservationId,
    review: {
      taskId: "review-cli",
      runId: "review-run-cli",
      verdict: "approved",
      businessBoundary: "correct",
      upstreamCause: "not_applicable",
      impactCompleteness: "complete",
      requiredRework: false,
      mapCausedRegression: false,
    },
  };
}

function maintenanceObservation(
  taskObservationId: string,
  status: "discarded" | "unresolved" = "discarded",
): MaintenanceObservationInput {
  return {
    schemaVersion: 1,
    id: "maintenance-observation-cli",
    recordedAt: "2026-08-27T12:00:00.000Z",
    maintenance: { taskId: "maintenance-task-cli", runId: "maintenance-run-cli" },
    businessDomainId: "commerce",
    results: [{
      candidate: { taskObservationId, candidateIndex: 0 },
      status,
      reason: "The proposed relation was implementation-local rather than durable meaning.",
      evidence: [{ kind: "source", reference: "src/orders.ts" }],
    }],
  };
}
