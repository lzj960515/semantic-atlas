import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
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
